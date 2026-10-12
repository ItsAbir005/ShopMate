"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentService = void 0;
const Payment_1 = require("../../models/Payment");
const Order_1 = require("../../models/Order");
const rabbitmq_1 = require("../../config/rabbitmq");
const paypal_provider_1 = require("./providers/paypal.provider");
const logger_1 = require("../../utils/logger");
const payPalProvider = new paypal_provider_1.PayPalProvider();
class PaymentService {
    // ─── Provider Accessors ───────────────────────────────────────────────────
    static getPayPalProvider() {
        return payPalProvider;
    }
    // ─── PayPal Methods ───────────────────────────────────────────────────────
    /**
     * Create PayPal Order (Auth required).
     * Server calculates amount from database order to prevent tampering.
     */
    static async createPayPalOrder(orderId, userId, isAdmin = false) {
        const order = await Order_1.Order.findById(orderId);
        if (!order)
            throw new Error('Order not found');
        if (!isAdmin && order.user_id.toString() !== userId) {
            throw new Error('Unauthorized to pay for this order');
        }
        if (order.payment_status === 'paid') {
            throw new Error('Order is already paid');
        }
        const paymentResult = await payPalProvider.createPayment(order);
        order.paymentProvider = 'paypal';
        order.paypalOrderId = paymentResult.paypalOrderId;
        await order.save();
        return {
            paypalOrderId: paymentResult.paypalOrderId,
        };
    }
    /**
     * Capture PayPal Order (Auth required).
     * Verifies order belongs to user and updates payment state. Idempotent.
     */
    static async capturePayPalOrder(paypalOrderId, userId, isAdmin = false) {
        let order = await Order_1.Order.findOne({ paypalOrderId });
        if (!order) {
            // Fallback search by reference if needed
            order = await Order_1.Order.findOne({ _id: paypalOrderId });
        }
        if (!order)
            throw new Error(`Order with PayPal order ID ${paypalOrderId} not found`);
        if (!isAdmin && order.user_id.toString() !== userId) {
            throw new Error('Unauthorized to capture payment for this order');
        }
        // Idempotency: if already paid, return success immediately
        if (order.payment_status === 'paid') {
            return {
                success: true,
                orderId: order._id.toString(),
                status: 'paid',
                alreadyPaid: true,
                captureId: order.paypalCaptureId,
            };
        }
        const captureResult = await payPalProvider.capture(paypalOrderId, order);
        if (captureResult.success) {
            order.payment_status = 'paid';
            if (order.status === 'pending') {
                order.status = 'paid';
            }
            order.paymentProvider = 'paypal';
            order.paypalCaptureId = captureResult.captureId;
            await order.save();
            // Create or update Payment record
            await Payment_1.Payment.findOneAndUpdate({ order_id: order._id }, {
                order_id: order._id,
                transaction_id: captureResult.captureId || paypalOrderId,
                amount: order.total_amount,
                currency: 'usd',
                status: 'successful',
            }, { upsert: true, new: true });
            // Publish payment.success to RabbitMQ
            await rabbitmq_1.rabbitMQ.publishEvent('payment.success', {
                orderId: order._id.toString(),
                userId: order.user_id.toString(),
                amount: order.total_amount,
            });
            // Notify Socket.IO
            try {
                const { getIO } = await Promise.resolve().then(() => __importStar(require('../../config/socket')));
                getIO().to(`order:${order._id.toString()}`).emit('status:changed', {
                    status: 'paid',
                    payment_status: 'paid',
                });
            }
            catch {
                // Socket.io room notification
            }
            return {
                success: true,
                orderId: order._id.toString(),
                status: 'paid',
                captureId: captureResult.captureId,
            };
        }
        throw new Error(`PayPal capture failed with status: ${captureResult.status}`);
    }
    /**
     * Handle PayPal Webhook (Public, raw body signature verification).
     */
    static async handlePayPalWebhook(headers, rawBody) {
        const verification = await payPalProvider.verifyWebhook(headers, rawBody);
        if (!verification.isValid) {
            throw new Error(`PayPal Webhook verification failed: ${verification.error || 'Invalid signature'}`);
        }
        const eventType = verification.eventType;
        const resource = (verification.resource || {});
        logger_1.logger.info({ eventType, resourceId: resource.id }, 'Processing PayPal webhook event');
        if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
            const captureId = resource.id;
            const customOrderId = resource.custom_id;
            const relatedOrderId = resource.supplementary_data?.related_ids?.order_id;
            let order = null;
            if (customOrderId) {
                order = await Order_1.Order.findById(customOrderId);
            }
            if (!order && relatedOrderId) {
                order = await Order_1.Order.findOne({ paypalOrderId: relatedOrderId });
            }
            if (!order && captureId) {
                order = await Order_1.Order.findOne({ paypalCaptureId: captureId });
            }
            if (order) {
                if (order.payment_status === 'paid') {
                    return { received: true, message: 'Order already marked as paid' };
                }
                order.payment_status = 'paid';
                if (order.status === 'pending') {
                    order.status = 'paid';
                }
                order.paymentProvider = 'paypal';
                order.paypalCaptureId = captureId;
                await order.save();
                await Payment_1.Payment.findOneAndUpdate({ order_id: order._id }, {
                    order_id: order._id,
                    transaction_id: captureId,
                    amount: order.total_amount,
                    currency: 'usd',
                    status: 'successful',
                }, { upsert: true, new: true });
                await rabbitmq_1.rabbitMQ.publishEvent('payment.success', {
                    orderId: order._id.toString(),
                    userId: order.user_id.toString(),
                    amount: order.total_amount,
                });
                try {
                    const { getIO } = await Promise.resolve().then(() => __importStar(require('../../config/socket')));
                    getIO().to(`order:${order._id.toString()}`).emit('status:changed', {
                        status: 'paid',
                        payment_status: 'paid',
                    });
                }
                catch {
                    // Socket.io room notification
                }
            }
        }
        else if (eventType === 'PAYMENT.CAPTURE.DENIED') {
            const captureId = resource.id;
            const customOrderId = resource.custom_id;
            const order = customOrderId
                ? await Order_1.Order.findById(customOrderId)
                : await Order_1.Order.findOne({ paypalCaptureId: captureId });
            if (order && order.payment_status !== 'paid') {
                await Payment_1.Payment.findOneAndUpdate({ order_id: order._id }, {
                    order_id: order._id,
                    transaction_id: captureId,
                    amount: order.total_amount,
                    currency: 'usd',
                    status: 'failed',
                }, { upsert: true });
            }
        }
        else if (eventType === 'PAYMENT.CAPTURE.REFUNDED') {
            const captureId = resource.id;
            const customOrderId = resource.custom_id;
            const order = customOrderId
                ? await Order_1.Order.findById(customOrderId)
                : await Order_1.Order.findOne({ paypalCaptureId: captureId });
            if (order) {
                if (order.payment_status !== 'refunded') {
                    order.payment_status = 'refunded';
                    order.status = 'cancelled';
                    await order.save();
                    await Payment_1.Payment.findOneAndUpdate({ order_id: order._id }, { status: 'refunded' });
                    try {
                        const { getIO } = await Promise.resolve().then(() => __importStar(require('../../config/socket')));
                        getIO().to(`order:${order._id.toString()}`).emit('status:changed', {
                            status: 'cancelled',
                            payment_status: 'refunded',
                        });
                    }
                    catch {
                        // Socket.io room notification
                    }
                }
            }
        }
        return { received: true, eventType };
    }
    /**
     * Admin refund for PayPal order (Admin only).
     */
    static async processPayPalRefund(orderId, amount) {
        const order = await Order_1.Order.findById(orderId);
        if (!order)
            throw new Error('Order not found');
        if (order.payment_status !== 'paid') {
            throw new Error('Only paid orders can be refunded');
        }
        let captureId = order.paypalCaptureId;
        if (!captureId) {
            const payment = await Payment_1.Payment.findOne({ order_id: order._id, status: 'successful' });
            if (payment?.transaction_id && !payment.transaction_id.startsWith('pending_')) {
                captureId = payment.transaction_id;
            }
        }
        if (!captureId) {
            throw new Error('PayPal capture ID not found on this order');
        }
        const refundResult = await payPalProvider.refund(captureId, amount || order.total_amount);
        if (refundResult.success) {
            order.payment_status = 'refunded';
            order.status = 'cancelled';
            await order.save();
            await Payment_1.Payment.findOneAndUpdate({ order_id: order._id }, { status: 'refunded' });
            await rabbitmq_1.rabbitMQ.publishEvent('job.process_refund', {
                orderId: order._id.toString(),
                userId: order.user_id.toString(),
                amount: amount || order.total_amount,
            });
            try {
                const { getIO } = await Promise.resolve().then(() => __importStar(require('../../config/socket')));
                getIO().to(`order:${order._id.toString()}`).emit('status:changed', {
                    status: 'cancelled',
                    payment_status: 'refunded',
                });
            }
            catch {
                // Socket.io room notification
            }
        }
        return refundResult;
    }
}
exports.PaymentService = PaymentService;
//# sourceMappingURL=payment.service.js.map
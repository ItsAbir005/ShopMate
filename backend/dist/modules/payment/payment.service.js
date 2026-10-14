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
const User_1 = require("../../models/User");
const Notification_1 = require("../../models/Notification");
const rabbitmq_1 = require("../../config/rabbitmq");
const paypal_provider_1 = require("./providers/paypal.provider");
const shipping_service_1 = require("../shipping/shipping.service");
const mail_service_1 = require("../mail/mail.service");
const logger_1 = require("../../utils/logger");
const payPalProvider = new paypal_provider_1.PayPalProvider();
class PaymentService {
    /**
     * Run in-process post-payment actions:
     * 1. Create shipment for order if none exists (fails soft).
     * 2. Send payment confirmation email (idempotent via order.confirmationEmailSent).
     * 3. Create notification for payment (idempotent by checking existing notification).
     * 4. Publish payment.success to RabbitMQ ONLY if connected.
     * All steps wrapped in separate try/catch so failure in one never blocks the others or payment.
     */
    static async runPostPaymentProcessing(orderInput) {
        const orderId = orderInput?._id ? orderInput._id.toString() : orderInput?.toString();
        if (!orderId)
            return;
        const order = await Order_1.Order.findById(orderId);
        if (!order) {
            logger_1.logger.warn({ orderId }, '[payment] Order not found for post-payment processing');
            return;
        }
        // 1. Create shipment directly in-process if none exists
        try {
            await (0, shipping_service_1.createShipment)(order._id.toString());
        }
        catch (shipmentErr) {
            logger_1.logger.warn({ err: shipmentErr.message, orderId: order._id }, '[shipping] In-process shipment creation failed soft');
        }
        // 2. Send confirmation email (idempotent via confirmationEmailSent)
        try {
            const freshOrder = await Order_1.Order.findById(order._id);
            if (freshOrder && !freshOrder.confirmationEmailSent) {
                const user = await User_1.User.findById(order.user_id);
                if (user?.email && user?.notificationSettings?.email !== false) {
                    await (0, mail_service_1.sendPaymentSuccessEmail)(user.email, user.name || 'Customer', order._id.toString(), order.total_amount);
                }
                freshOrder.confirmationEmailSent = true;
                await freshOrder.save();
                logger_1.logger.info({ orderId: order._id }, '[mail] Confirmation email sent and marked');
            }
        }
        catch (emailErr) {
            logger_1.logger.warn({ err: emailErr.message, orderId: order._id }, '[mail] Post-payment confirmation email failed soft');
        }
        // 3. Create notification (idempotent by checking existing notification)
        try {
            const existingNotif = await Notification_1.Notification.findOne({
                type: 'GENERAL',
                relatedId: order._id,
            });
            if (!existingNotif) {
                await Notification_1.Notification.create({
                    type: 'GENERAL',
                    message: `Payment confirmed for Order #${order._id.toString().slice(-8).toUpperCase()} ($${order.total_amount.toFixed(2)})`,
                    relatedId: order._id,
                    metadata: {
                        orderId: order._id.toString(),
                        amount: order.total_amount,
                        userId: order.user_id.toString(),
                    },
                });
                logger_1.logger.info({ orderId: order._id }, '[notification] Post-payment notification created');
            }
        }
        catch (notifErr) {
            logger_1.logger.warn({ err: notifErr.message, orderId: order._id }, '[notification] Post-payment notification failed soft');
        }
        // 4. Publish payment.success to RabbitMQ if connected
        if (rabbitmq_1.rabbitMQ.isConnected()) {
            try {
                await rabbitmq_1.rabbitMQ.publishEvent('payment.success', {
                    orderId: order._id.toString(),
                    userId: order.user_id.toString(),
                    amount: order.total_amount,
                });
            }
            catch (rmqErr) {
                logger_1.logger.warn({ err: rmqErr.message, orderId: order._id }, '[rabbitmq] Failed to publish payment.success soft');
            }
        }
    }
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
        // Run AI Risk Evaluation before creating PayPal order (soft fallback, never blocks checkout)
        try {
            const { evaluateOrderRisk } = await Promise.resolve().then(() => __importStar(require('../ai/ai.service')));
            const riskResult = await evaluateOrderRisk(order);
            order.aiRisk = {
                decision: riskResult.decision,
                reason: riskResult.reason,
                checkedAt: new Date(),
                signals: riskResult.signals,
            };
            await order.save();
        }
        catch (riskErr) {
            logger_1.logger.warn({ err: riskErr.message, orderId }, '[ai] Order risk evaluation failed soft, defaulting to approve');
            order.aiRisk = {
                decision: 'approve',
                reason: 'AI unavailable',
                checkedAt: new Date(),
            };
            await order.save();
        }
        const paymentResult = await payPalProvider.createPayment(order);
        order.paymentProvider = 'paypal';
        order.paypalOrderId = paymentResult.paypalOrderId;
        await order.save();
        logger_1.logger.info({ orderId, paypalOrderId: paymentResult.paypalOrderId, aiRisk: order.aiRisk?.decision }, '[payment] PayPal order created');
        return {
            paypalOrderId: paymentResult.paypalOrderId,
            aiRisk: order.aiRisk,
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
        // Idempotency: if already paid, ensure post-processing tasks ran and return success immediately
        if (order.payment_status === 'paid') {
            await PaymentService.runPostPaymentProcessing(order);
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
            logger_1.logger.info({ orderId: order._id, captureId: captureResult.captureId }, '[payment] PayPal order captured');
            logger_1.logger.info({ orderId: order._id, payment_status: order.payment_status, status: order.status }, '[payment] Order status updated');
            // Create or update Payment record
            await Payment_1.Payment.findOneAndUpdate({ order_id: order._id }, {
                order_id: order._id,
                transaction_id: captureResult.captureId || paypalOrderId,
                amount: order.total_amount,
                currency: 'usd',
                status: 'successful',
            }, { upsert: true, new: true });
            // Execute in-process post-payment tasks (shipment, email, notification, RabbitMQ if connected)
            await PaymentService.runPostPaymentProcessing(order);
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
        logger_1.logger.info({ eventType, resourceId: resource.id }, '[payment] PayPal webhook received');
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
                    await PaymentService.runPostPaymentProcessing(order);
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
                // Execute in-process post-payment tasks (shipment, email, notification, RabbitMQ if connected)
                await PaymentService.runPostPaymentProcessing(order);
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
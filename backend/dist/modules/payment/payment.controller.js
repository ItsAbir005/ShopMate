"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refundPayPalOrder = exports.paypalWebhook = exports.capturePayPalOrder = exports.createPayPalOrder = void 0;
const payment_service_1 = require("./payment.service");
const logger_1 = require("../../utils/logger");
// ─── PayPal Endpoints ─────────────────────────────────────────────────────────
/**
 * POST /api/payment/paypal/create-order (Auth required)
 * Loads order from DB and computes amount ON SERVER.
 */
const createPayPalOrder = async (req, res) => {
    try {
        const { orderId, order_id } = req.body;
        const targetOrderId = orderId || order_id;
        if (!targetOrderId) {
            res.status(400).json({ success: false, message: 'orderId is required' });
            return;
        }
        const userId = req.user?._id?.toString() || '';
        const isAdmin = req.user?.role === 'admin';
        const result = await payment_service_1.PaymentService.createPayPalOrder(targetOrderId, userId, isAdmin);
        res.status(200).json({
            success: true,
            paypalOrderId: result.paypalOrderId,
        });
    }
    catch (error) {
        logger_1.logger.error({ err: error.message }, 'PayPal create order controller error');
        res.status(error.message.includes('Unauthorized') ? 403 : 400).json({
            success: false,
            message: error.message || 'Failed to create PayPal order',
        });
    }
};
exports.createPayPalOrder = createPayPalOrder;
/**
 * POST /api/payment/paypal/capture (Auth required)
 * Captures PayPal order and updates order status to paid. Idempotent.
 */
const capturePayPalOrder = async (req, res) => {
    try {
        const { paypalOrderId } = req.body;
        if (!paypalOrderId) {
            res.status(400).json({ success: false, message: 'paypalOrderId is required' });
            return;
        }
        const userId = req.user?._id?.toString() || '';
        const isAdmin = req.user?.role === 'admin';
        const result = await payment_service_1.PaymentService.capturePayPalOrder(paypalOrderId, userId, isAdmin);
        res.status(200).json({
            success: true,
            orderId: result.orderId,
            status: result.status,
            captureId: result.captureId,
            alreadyPaid: result.alreadyPaid,
        });
    }
    catch (error) {
        logger_1.logger.error({ err: error.message }, 'PayPal capture controller error');
        res.status(error.message.includes('Unauthorized') ? 403 : 400).json({
            success: false,
            message: error.message || 'Failed to capture PayPal order',
        });
    }
};
exports.capturePayPalOrder = capturePayPalOrder;
/**
 * POST /api/payment/paypal/webhook (Public, raw body)
 * Verifies PayPal signature and handles completed/denied/refunded events.
 */
const paypalWebhook = async (req, res) => {
    try {
        const result = await payment_service_1.PaymentService.handlePayPalWebhook(req.headers, req.body);
        res.status(200).json(result);
    }
    catch (error) {
        logger_1.logger.error({ err: error.message }, 'PayPal webhook controller error');
        res.status(400).json({ success: false, message: error.message || 'Webhook verification failed' });
    }
};
exports.paypalWebhook = paypalWebhook;
/**
 * POST /api/payment/paypal/refund/:orderId (Admin only)
 * Initiates capture refund via PayPal REST Orders/Payments v2.
 */
const refundPayPalOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { amount } = req.body;
        if (!orderId) {
            res.status(400).json({ success: false, message: 'orderId is required' });
            return;
        }
        const result = await payment_service_1.PaymentService.processPayPalRefund(orderId, amount ? Number(amount) : undefined);
        res.status(200).json({
            success: true,
            message: 'PayPal refund processed successfully',
            data: result,
        });
    }
    catch (error) {
        logger_1.logger.error({ err: error.message }, 'PayPal admin refund controller error');
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to process PayPal refund',
        });
    }
};
exports.refundPayPalOrder = refundPayPalOrder;
//# sourceMappingURL=payment.controller.js.map
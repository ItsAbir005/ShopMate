import { Request, Response } from 'express';
import { PaymentService } from './payment.service';
import { AuthRequest } from '../../middleware/auth.middleware';
import { logger } from '../../utils/logger';

// ─── PayPal Endpoints ─────────────────────────────────────────────────────────

/**
 * POST /api/payment/paypal/create-order (Auth required)
 * Loads order from DB and computes amount ON SERVER.
 */
export const createPayPalOrder = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { orderId, order_id } = req.body;
        const targetOrderId = orderId || order_id;

        if (!targetOrderId) {
            res.status(400).json({ success: false, message: 'orderId is required' });
            return;
        }

        const userId = req.user?._id?.toString() || '';
        const isAdmin = req.user?.role === 'admin';

        const result = await PaymentService.createPayPalOrder(targetOrderId, userId, isAdmin);

        res.status(200).json({
            success: true,
            paypalOrderId: result.paypalOrderId,
        });
    } catch (error: any) {
        logger.error({ err: error.message }, 'PayPal create order controller error');
        res.status(error.message.includes('Unauthorized') ? 403 : 400).json({
            success: false,
            message: error.message || 'Failed to create PayPal order',
        });
    }
};

/**
 * POST /api/payment/paypal/capture (Auth required)
 * Captures PayPal order and updates order status to paid. Idempotent.
 */
export const capturePayPalOrder = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { paypalOrderId } = req.body;

        if (!paypalOrderId) {
            res.status(400).json({ success: false, message: 'paypalOrderId is required' });
            return;
        }

        const userId = req.user?._id?.toString() || '';
        const isAdmin = req.user?.role === 'admin';

        const result = await PaymentService.capturePayPalOrder(paypalOrderId, userId, isAdmin);

        res.status(200).json({
            success: true,
            orderId: result.orderId,
            status: result.status,
            captureId: result.captureId,
            alreadyPaid: result.alreadyPaid,
        });
    } catch (error: any) {
        logger.error({ err: error.message }, 'PayPal capture controller error');
        res.status(error.message.includes('Unauthorized') ? 403 : 400).json({
            success: false,
            message: error.message || 'Failed to capture PayPal order',
        });
    }
};

/**
 * POST /api/payment/paypal/webhook (Public, raw body)
 * Verifies PayPal signature and handles completed/denied/refunded events.
 */
export const paypalWebhook = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await PaymentService.handlePayPalWebhook(req.headers, req.body);
        res.status(200).json(result);
    } catch (error: any) {
        logger.error({ err: error.message }, 'PayPal webhook controller error');
        res.status(400).json({ success: false, message: error.message || 'Webhook verification failed' });
    }
};

/**
 * POST /api/payment/paypal/refund/:orderId (Admin only)
 * Initiates capture refund via PayPal REST Orders/Payments v2.
 */
export const refundPayPalOrder = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { orderId } = req.params;
        const { amount } = req.body;

        if (!orderId) {
            res.status(400).json({ success: false, message: 'orderId is required' });
            return;
        }

        const result = await PaymentService.processPayPalRefund(orderId, amount ? Number(amount) : undefined);

        res.status(200).json({
            success: true,
            message: 'PayPal refund processed successfully',
            data: result,
        });
    } catch (error: any) {
        logger.error({ err: error.message }, 'PayPal admin refund controller error');
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to process PayPal refund',
        });
    }
};

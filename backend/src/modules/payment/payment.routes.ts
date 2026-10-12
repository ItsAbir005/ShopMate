import { Router } from 'express';
import {
    createPayPalOrder,
    capturePayPalOrder,
    paypalWebhook,
    refundPayPalOrder
} from './payment.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminMiddleware } from '../../middleware/admin.middleware';

const router = Router();

// ─── PayPal Endpoints ─────────────────────────────────────────────────────────

// POST /api/payment/paypal/create-order (Auth required)
router.post('/paypal/create-order', authMiddleware, createPayPalOrder);

// POST /api/payment/paypal/capture (Auth required)
router.post('/paypal/capture', authMiddleware, capturePayPalOrder);

// POST /api/payment/paypal/webhook (NO auth, raw body)
router.post('/paypal/webhook', paypalWebhook);

// POST /api/payment/paypal/refund/:orderId (Admin only)
router.post('/paypal/refund/:orderId', authMiddleware, adminMiddleware, refundPayPalOrder);

export default router;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const payment_controller_1 = require("./payment.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const admin_middleware_1 = require("../../middleware/admin.middleware");
const router = (0, express_1.Router)();
// ─── PayPal Endpoints ─────────────────────────────────────────────────────────
// POST /api/payment/paypal/create-order (Auth required)
router.post('/paypal/create-order', auth_middleware_1.authMiddleware, payment_controller_1.createPayPalOrder);
// POST /api/payment/paypal/capture (Auth required)
router.post('/paypal/capture', auth_middleware_1.authMiddleware, payment_controller_1.capturePayPalOrder);
// POST /api/payment/paypal/webhook (NO auth, raw body)
router.post('/paypal/webhook', payment_controller_1.paypalWebhook);
// POST /api/payment/paypal/refund/:orderId (Admin only)
router.post('/paypal/refund/:orderId', auth_middleware_1.authMiddleware, admin_middleware_1.adminMiddleware, payment_controller_1.refundPayPalOrder);
exports.default = router;
//# sourceMappingURL=payment.routes.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const admin_middleware_1 = require("../../middleware/admin.middleware");
const ai_middleware_1 = require("./ai.middleware");
const ai_controller_1 = require("./ai.controller");
const router = (0, express_1.Router)();
// Apply AI rate limiter to all /api/ai routes (20 requests/min/user)
router.use(ai_middleware_1.aiRateLimiter);
// ── Admin Merchant Agent ──────────────────────────────────────────────────────
router.post('/merchant', auth_middleware_1.authMiddleware, admin_middleware_1.adminMiddleware, ai_controller_1.merchantHandler);
router.post('/merchant/action', auth_middleware_1.authMiddleware, admin_middleware_1.adminMiddleware, ai_controller_1.merchantActionHandler);
router.post('/merchant/quick-chip', auth_middleware_1.authMiddleware, admin_middleware_1.adminMiddleware, ai_controller_1.merchantQuickChipHandler);
// ── Customer Shopping Assistant ───────────────────────────────────────────────
router.post('/assistant', ai_middleware_1.optionalAuthMiddleware, ai_controller_1.assistantHandler);
exports.default = router;
//# sourceMappingURL=ai.routes.js.map
import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminMiddleware } from '../../middleware/admin.middleware';
import { aiRateLimiter, optionalAuthMiddleware } from './ai.middleware';
import {
    merchantHandler,
    merchantActionHandler,
    assistantHandler,
} from './ai.controller';

const router = Router();

// Apply AI rate limiter to all /api/ai routes (20 requests/min/user)
router.use(aiRateLimiter as any);

// ── Admin Merchant Agent ──────────────────────────────────────────────────────
router.post('/merchant', authMiddleware as any, adminMiddleware as any, merchantHandler);
router.post('/merchant/action', authMiddleware as any, adminMiddleware as any, merchantActionHandler);

// ── Customer Shopping Assistant ───────────────────────────────────────────────
router.post('/assistant', optionalAuthMiddleware as any, assistantHandler);

export default router;

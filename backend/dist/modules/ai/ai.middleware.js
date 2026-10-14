"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalAuthMiddleware = exports.aiRateLimiter = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = require("../../models/User");
const logger_1 = require("../../utils/logger");
const rateLimitMap = new Map();
// Cleanup stale entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitMap.entries()) {
        if (now > record.resetTime) {
            rateLimitMap.delete(key);
        }
    }
}, 5 * 60 * 1000);
const aiRateLimiter = (req, res, next) => {
    const identifier = req.user?._id?.toString() || req.ip || 'anonymous';
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute
    const maxRequests = 20;
    let record = rateLimitMap.get(identifier);
    if (!record || now > record.resetTime) {
        record = {
            count: 1,
            resetTime: now + windowMs,
        };
        rateLimitMap.set(identifier, record);
    }
    else {
        record.count += 1;
    }
    if (record.count > maxRequests) {
        const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
        logger_1.logger.warn({ rateLimitKey: req.user ? 'authenticated_user' : 'ip_client' }, '[ai] Rate limit exceeded on AI endpoint');
        res.set('Retry-After', String(retryAfterSeconds));
        return res.status(429).json({
            message: 'Too many AI requests. Rate limit is 20 requests per minute.',
            retryAfter: retryAfterSeconds,
        });
    }
    next();
};
exports.aiRateLimiter = aiRateLimiter;
/**
 * Optional authentication: attaches req.user if a valid token is present,
 * but allows unauthenticated guest requests to pass through.
 */
const optionalAuthMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
            const user = await User_1.User.findById(decoded.id).select('-password');
            if (user && !user.isBlocked) {
                req.user = user;
            }
        }
        catch {
            // Ignore token verification errors for optional auth
        }
    }
    next();
};
exports.optionalAuthMiddleware = optionalAuthMiddleware;
//# sourceMappingURL=ai.middleware.js.map
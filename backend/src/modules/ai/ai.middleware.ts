import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest } from '../../middleware/auth.middleware';
import { User } from '../../models/User';
import { logger } from '../../utils/logger';

// Rate limiter: 20 requests per minute per user / IP
interface RateLimitRecord {
    count: number;
    resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitMap.entries()) {
        if (now > record.resetTime) {
            rateLimitMap.delete(key);
        }
    }
}, 5 * 60 * 1000);

export const aiRateLimiter = (req: AuthRequest, res: Response, next: NextFunction): any => {
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
    } else {
        record.count += 1;
    }

    if (record.count > maxRequests) {
        const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
        logger.warn({ rateLimitKey: req.user ? 'authenticated_user' : 'ip_client' }, '[ai] Rate limit exceeded on AI endpoint');

        res.set('Retry-After', String(retryAfterSeconds));
        return res.status(429).json({
            message: 'Too many AI requests. Rate limit is 20 requests per minute.',
            retryAfter: retryAfterSeconds,
        });
    }

    next();
};

/**
 * Optional authentication: attaches req.user if a valid token is present,
 * but allows unauthenticated guest requests to pass through.
 */
export const optionalAuthMiddleware = async (req: AuthRequest, res: Response, next: NextFunction): Promise<any> => {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string };
            const user = await User.findById(decoded.id).select('-password');
            if (user && !user.isBlocked) {
                req.user = user;
            }
        } catch {
            // Ignore token verification errors for optional auth
        }
    }

    next();
};

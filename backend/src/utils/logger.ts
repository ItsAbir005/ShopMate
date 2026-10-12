import pino from 'pino';

export const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    redact: {
        paths: [
            'req.headers.authorization',
            'req.headers["paypal-auth-algo"]',
            'client_secret',
            'clientSecret',
            'secret',
            'password',
            'token',
            'PAYPAL_CLIENT_SECRET',
            'STRIPE_SECRET_KEY'
        ],
        censor: '[REDACTED]'
    }
});

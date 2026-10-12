"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const pino_1 = __importDefault(require("pino"));
exports.logger = (0, pino_1.default)({
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
//# sourceMappingURL=logger.js.map
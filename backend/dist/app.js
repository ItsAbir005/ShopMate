"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const crypto_1 = __importDefault(require("crypto"));
const mongoose_1 = __importDefault(require("mongoose"));
const db_1 = require("./config/db");
const redis_1 = require("./config/redis");
const rabbitmq_1 = require("./config/rabbitmq");
const logger_1 = require("./utils/logger");
const cors_1 = __importDefault(require("cors"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const user_routes_1 = __importDefault(require("./modules/users/user.routes"));
const product_routes_1 = __importDefault(require("./modules/products/product.routes"));
const cart_routes_1 = __importDefault(require("./modules/cart/cart.routes"));
const order_routes_1 = __importDefault(require("./modules/orders/order.routes"));
const category_routes_1 = __importDefault(require("./modules/categories/category.routes"));
const payment_routes_1 = __importDefault(require("./modules/payment/payment.routes"));
const shipping_routes_1 = __importDefault(require("./modules/shipping/shipping.routes"));
const driver_routes_1 = __importDefault(require("./modules/drivers/driver.routes"));
const notification_routes_1 = __importDefault(require("./modules/notifications/notification.routes"));
const chat_routes_1 = __importDefault(require("./modules/chat/chat.routes"));
const Sentry = __importStar(require("@sentry/node"));
dotenv_1.default.config();
const app = (0, express_1.default)();
(0, db_1.connectDB)();
(0, redis_1.connectRedis)();
rabbitmq_1.rabbitMQ.connect();
const allowedOrigins = [
    process.env.FRONTEND_URL?.replace(/\/$/, ""),
    "http://localhost:3000",
    "http://localhost:5173",
    "https://ecommerce-q1ph.vercel.app",
].filter(Boolean);
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || origin.endsWith(".vercel.app")) {
            callback(null, true);
        }
        else {
            callback(new Error("Not allowed by CORS"));
        }
    },
    credentials: true,
}));
// Request ID & Request Logging Middleware
app.use((req, res, next) => {
    const incomingId = req.headers["x-request-id"];
    const requestId = incomingId || crypto_1.default.randomUUID();
    req.id = requestId;
    res.setHeader("X-Request-Id", requestId);
    const start = Date.now();
    res.on("finish", () => {
        const duration = Date.now() - start;
        const user = req.user || req.driver;
        const userId = user?._id || user?.id;
        const role = user?.role || (req.driver ? "driver" : undefined);
        logger_1.logger.info({
            requestId,
            method: req.method,
            path: req.originalUrl || req.url,
            status: res.statusCode,
            duration: `${duration}ms`,
            userId,
            role,
        }, `HTTP ${req.method} ${req.originalUrl || req.url} ${res.statusCode} (${duration}ms)`);
    });
    next();
});
// Health check endpoint
app.get("/api/health", async (_req, res) => {
    const mongoStatus = mongoose_1.default.connection.readyState === 1 ? "connected" : "disconnected";
    const redisStatus = redis_1.redisClient.isOpen ? "connected" : "disconnected";
    const rabbitStatus = rabbitmq_1.rabbitMQ.channel ? "connected" : "disconnected";
    const cloudinaryStatus = process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET
        ? "configured"
        : "missing";
    const ok = mongoStatus === "connected";
    const httpStatus = ok ? 200 : 503;
    return res.status(httpStatus).json({
        ok,
        mongo: mongoStatus,
        redis: redisStatus,
        rabbitmq: rabbitStatus,
        cloudinary: cloudinaryStatus,
        uptime: process.uptime(),
    });
});
// PayPal webhook must be parsed as raw data BEFORE express.json()
app.use([
    "/api/payments/paypal/webhook",
    "/api/payment/paypal/webhook"
], express_1.default.raw({ type: "application/json" }));
app.use(express_1.default.json());
app.use("/api/auth", auth_routes_1.default);
app.use("/api/users", user_routes_1.default);
app.use("/api/products", product_routes_1.default);
app.use("/api/cart", cart_routes_1.default);
app.use("/api/orders", order_routes_1.default);
app.use("/api/categories", category_routes_1.default);
app.use("/api/payments", payment_routes_1.default);
app.use("/api/payment", payment_routes_1.default);
app.use("/api/shipping", shipping_routes_1.default);
app.use("/api/drivers", driver_routes_1.default);
app.use("/api/notifications", notification_routes_1.default);
app.use("/api/chat", chat_routes_1.default);
app.get("/api/debug-sentry", function mainHandler(_req, _res) {
    throw new Error("My first Sentry error!");
});
Sentry.setupExpressErrorHandler(app);
// Helper to sanitize sensitive keys in request body
function sanitizeBody(body) {
    if (!body || typeof body !== "object")
        return body;
    const sanitized = { ...body };
    const sensitiveKeys = ["password", "token", "secret", "client_secret", "clientSecret", "currentPassword", "newPassword"];
    for (const key of Object.keys(sanitized)) {
        if (sensitiveKeys.some(s => key.toLowerCase().includes(s.toLowerCase()))) {
            sanitized[key] = "[REDACTED]";
        }
        else if (typeof sanitized[key] === "object" && sanitized[key] !== null) {
            sanitized[key] = sanitizeBody(sanitized[key]);
        }
    }
    return sanitized;
}
// Global error handler middleware
app.use((err, req, res, _next) => {
    const requestId = req.id || req.headers["x-request-id"] || "unknown";
    logger_1.logger.error({
        errName: err.name || "Error",
        message: err.message,
        stack: err.stack,
        requestId,
        method: req.method,
        path: req.originalUrl || req.url,
        body: sanitizeBody(req.body),
    }, `[server] Error handling request: ${err.message}`);
    const status = err.statusCode || err.status || 500;
    res.status(status).json({
        message: err.message || "Internal Server Error",
        requestId,
    });
});
exports.default = app;
//# sourceMappingURL=app.js.map
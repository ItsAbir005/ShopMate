import express from "express";
import dotenv from "dotenv";
import crypto from "crypto";
import mongoose from "mongoose";
import { connectDB } from "./config/db";
import { connectRedis, redisClient } from "./config/redis";
import { rabbitMQ } from "./config/rabbitmq";
import { logger } from "./utils/logger";
import cors from "cors";
import authRoutes from "./routes/auth.routes";
import userRoutes from "./modules/users/user.routes";
import productRoutes from "./modules/products/product.routes";
import cartRoutes from "./modules/cart/cart.routes";
import orderRoutes from "./modules/orders/order.routes";
import categoryRoutes from "./modules/categories/category.routes";
import paymentRoutes from "./modules/payment/payment.routes";
import shippingRoutes from "./modules/shipping/shipping.routes";
import driverRoutes from "./modules/drivers/driver.routes";
import notificationRoutes from "./modules/notifications/notification.routes";
import chatRoutes from "./modules/chat/chat.routes";
import aiRoutes from "./modules/ai/ai.routes";
import * as Sentry from "@sentry/node";

dotenv.config();
const app = express();
connectDB();
connectRedis();
rabbitMQ.connect();

const allowedOrigins = [
    process.env.FRONTEND_URL?.replace(/\/$/, ""),
    "http://localhost:3000",
    "http://localhost:5173",
    "https://ecommerce-q1ph.vercel.app",
].filter(Boolean) as string[];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || origin.endsWith(".vercel.app")) {
            callback(null, true);
        } else {
            callback(new Error("Not allowed by CORS"));
        }
    },
    credentials: true,
}));

// Request ID & Request Logging Middleware
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    const incomingId = req.headers["x-request-id"] as string | undefined;
    const requestId = incomingId || crypto.randomUUID();
    (req as any).id = requestId;
    res.setHeader("X-Request-Id", requestId);

    const start = Date.now();
    res.on("finish", () => {
        const duration = Date.now() - start;
        const user = (req as any).user || (req as any).driver;
        const userId = user?._id || user?.id;
        const role = user?.role || ((req as any).driver ? "driver" : undefined);

        logger.info({
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
app.get("/api/health", async (_req: express.Request, res: express.Response) => {
    const mongoStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
    const redisStatus = redisClient.isOpen ? "connected" : "disconnected";
    const rabbitConnected = rabbitMQ.isConnected();
    const cloudinaryStatus = process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET
        ? "configured"
        : "missing";
    const aiAvailable = Boolean(process.env.GEMINI_API_KEY);
    const paypalToolkitAvailable = Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);

    const ok = mongoStatus === "connected";
    const httpStatus = ok ? 200 : 503;

    return res.status(httpStatus).json({
        ok,
        mongo: mongoStatus,
        redis: redisStatus,
        rabbitmq: rabbitConnected,
        cloudinary: cloudinaryStatus,
        ai: aiAvailable,
        paypalToolkit: paypalToolkitAvailable,
        uptime: process.uptime(),
    });
});

// PayPal webhook must be parsed as raw data BEFORE express.json()
app.use([
    "/api/payments/paypal/webhook",
    "/api/payment/paypal/webhook"
], express.raw({ type: "application/json" }));

app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/shipping", shippingRoutes);
app.use("/api/drivers", driverRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/ai", aiRoutes);

app.get("/api/debug-sentry", function mainHandler(_req: express.Request, _res: express.Response) {
    throw new Error("My first Sentry error!");
});

Sentry.setupExpressErrorHandler(app);

// Helper to sanitize sensitive keys in request body
function sanitizeBody(body: any): any {
    if (!body || typeof body !== "object") return body;
    const sanitized = { ...body };
    const sensitiveKeys = ["password", "token", "secret", "client_secret", "clientSecret", "currentPassword", "newPassword"];
    for (const key of Object.keys(sanitized)) {
        if (sensitiveKeys.some(s => key.toLowerCase().includes(s.toLowerCase()))) {
            sanitized[key] = "[REDACTED]";
        } else if (typeof sanitized[key] === "object" && sanitized[key] !== null) {
            sanitized[key] = sanitizeBody(sanitized[key]);
        }
    }
    return sanitized;
}

// Global error handler middleware
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const requestId = (req as any).id || (req.headers["x-request-id"] as string) || "unknown";

    logger.error({
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

export default app;

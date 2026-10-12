import express from "express";
import dotenv from "dotenv";
import { connectDB } from "./config/db";
import { connectRedis } from "./config/redis";
import { rabbitMQ } from "./config/rabbitmq";
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

app.get("/api/debug-sentry", function mainHandler(req: express.Request, res: express.Response) {
    throw new Error("My first Sentry error!");
});

Sentry.setupExpressErrorHandler(app);

export default app;

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
const db_1 = require("./config/db");
const redis_1 = require("./config/redis");
const rabbitmq_1 = require("./config/rabbitmq");
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
app.get("/api/debug-sentry", function mainHandler(req, res) {
    throw new Error("My first Sentry error!");
});
Sentry.setupExpressErrorHandler(app);
exports.default = app;
//# sourceMappingURL=app.js.map
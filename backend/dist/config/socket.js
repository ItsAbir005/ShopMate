"use strict";
/**
 * socket.ts
 * Socket.io server setup.
 *
 * Two logical rooms:
 *   - driver:<driverId>    → driver app receives delivery assignments
 *   - order:<orderId>      → customer tracks their order live
 *
 * Usage:
 *   import { getIO } from './socket';
 *   getIO().to('driver:abc123').emit('delivery:assigned', data);
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIO = exports.initSocket = void 0;
const socket_io_1 = require("socket.io");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const Message_1 = __importDefault(require("../models/Message"));
const logger_1 = require("../utils/logger");
let io;
const initSocket = (httpServer) => {
    const allowedOrigins = [
        process.env.FRONTEND_URL?.replace(/\/$/, ""),
        'http://localhost:3000',
        'http://localhost:5173',
        'https://ecommerce-q1ph.vercel.app',
    ].filter(Boolean);
    io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: (origin, callback) => {
                if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
                    callback(null, true);
                }
                else {
                    callback(new Error('Not allowed by CORS'));
                }
            },
            methods: ['GET', 'POST'],
            credentials: true,
        },
    });
    // ── Auth middleware for socket connections ─────────────────────────────────
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) {
            // Allow anonymous connections (for customer tracking without login)
            return next();
        }
        try {
            const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
            socket.data.userId = decoded.id;
            socket.data.role = decoded.role;
            next();
        }
        catch {
            next(new Error('Invalid token'));
        }
    });
    io.on('connection', (socket) => {
        const { userId, role } = socket.data;
        // Driver joins their personal room for receiving assignments
        if (role === 'driver' && userId) {
            socket.join(`driver:${userId}`);
            logger_1.logger.info({ userId }, "[socket] Driver connected to socket");
        }
        // Customer joins order tracking room
        // Client sends: socket.emit('track:order', { orderId })
        socket.on('track:order', ({ orderId }) => {
            socket.join(`order:${orderId}`);
            logger_1.logger.info({ orderId }, "[socket] Client tracking order");
        });
        // Chat logic
        socket.on('join:chat', ({ shipmentId }) => {
            socket.join(`chat:${shipmentId}`);
            logger_1.logger.info({ shipmentId }, "[socket] User/Driver joined chat");
        });
        socket.on('send:message', async (data) => {
            try {
                // Save to DB
                let finalSenderId = data.senderId;
                // fallback to socket user ID if available
                if (!finalSenderId && userId) {
                    finalSenderId = userId;
                }
                const newMessage = await Message_1.default.create({
                    shipmentId: data.shipmentId,
                    senderMode: data.senderMode,
                    senderId: finalSenderId || "anonymous",
                    text: data.text
                });
                logger_1.logger.info({ shipmentId: data.shipmentId, senderId: finalSenderId }, "[socket] Message sent");
                // Broadcast to everyone in the room (including sender to confirm)
                io.to(`chat:${data.shipmentId}`).emit('receive:message', newMessage);
            }
            catch (err) {
                logger_1.logger.error({ err }, "[socket] Error saving message");
            }
        });
        socket.on('disconnect', () => {
            if (role === 'driver') {
                logger_1.logger.info({ userId }, "[socket] Driver disconnected");
            }
        });
    });
    logger_1.logger.info("[socket] Socket.io server initialized");
    return io;
};
exports.initSocket = initSocket;
// Singleton getter — use this in services after server initializes
const getIO = () => {
    if (!io)
        throw new Error('Socket.io not initialized. Call initSocket(httpServer) first.');
    return io;
};
exports.getIO = getIO;
//# sourceMappingURL=socket.js.map
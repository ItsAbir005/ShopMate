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

import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import Message from '../models/Message';
import { logger } from '../utils/logger';

let io: SocketIOServer;

export const initSocket = (httpServer: HttpServer): SocketIOServer => {
    const allowedOrigins = [
        process.env.FRONTEND_URL?.replace(/\/$/, ""),
        'http://localhost:3000',
        'http://localhost:5173',
        'https://ecommerce-q1ph.vercel.app',
    ].filter(Boolean) as string[];

    io = new SocketIOServer(httpServer, {
        cors: {
            origin: (origin, callback) => {
                if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
                    callback(null, true);
                } else {
                    callback(new Error('Not allowed by CORS'));
                }
            },
            methods: ['GET', 'POST'],
            credentials: true,
        },
    });

    // ── Auth middleware for socket connections ─────────────────────────────────
    io.use((socket: Socket, next) => {
        const token = socket.handshake.auth.token as string | undefined;
        if (!token) {
            // Allow anonymous connections (for customer tracking without login)
            return next();
        }
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
                id: string;
                role: string;
            };
            socket.data.userId = decoded.id;
            socket.data.role = decoded.role;
            next();
        } catch {
            next(new Error('Invalid token'));
        }
    });

    io.on('connection', (socket: Socket) => {
        const { userId, role } = socket.data;

        // Driver joins their personal room for receiving assignments
        if (role === 'driver' && userId) {
            socket.join(`driver:${userId}`);
            logger.info({ userId }, "[socket] Driver connected to socket");
        }

        // Customer joins order tracking room
        // Client sends: socket.emit('track:order', { orderId })
        socket.on('track:order', ({ orderId }: { orderId: string }) => {
            socket.join(`order:${orderId}`);
            logger.info({ orderId }, "[socket] Client tracking order");
        });

        // Chat logic
        socket.on('join:chat', ({ shipmentId }: { shipmentId: string }) => {
            socket.join(`chat:${shipmentId}`);
            logger.info({ shipmentId }, "[socket] User/Driver joined chat");
        });

        socket.on('send:message', async (data: { shipmentId: string; senderMode: 'customer'|'driver'; senderId: string; text: string }) => {
            try {
                // Save to DB
                let finalSenderId = data.senderId;
                // fallback to socket user ID if available
                if (!finalSenderId && userId) {
                    finalSenderId = userId;
                }
                
                const newMessage = await Message.create({
                    shipmentId: data.shipmentId,
                    senderMode: data.senderMode,
                    senderId: finalSenderId || "anonymous",
                    text: data.text
                });
                
                logger.info({ shipmentId: data.shipmentId, senderId: finalSenderId }, "[socket] Message sent");
                // Broadcast to everyone in the room (including sender to confirm)
                io.to(`chat:${data.shipmentId}`).emit('receive:message', newMessage);
            } catch (err) {
                logger.error({ err }, "[socket] Error saving message");
            }
        });

        socket.on('disconnect', () => {
            if (role === 'driver') {
                logger.info({ userId }, "[socket] Driver disconnected");
            }
        });
    });

    logger.info("[socket] Socket.io server initialized");
    return io;
};

// Singleton getter — use this in services after server initializes
export const getIO = (): SocketIOServer => {
    if (!io) throw new Error('Socket.io not initialized. Call initSocket(httpServer) first.');
    return io;
};

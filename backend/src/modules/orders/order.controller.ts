import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import * as OrderService from './order.service';
import { OrderStatus } from '../../models/Order';

const uid = (req: AuthRequest) => (req.user as any)._id.toString();
const isAdmin = (req: AuthRequest) => req.user?.role === 'admin';

// POST /api/orders
export const createOrder = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const { shippingAddress } = req.body;
        if (!shippingAddress?.street || !shippingAddress?.city || !shippingAddress?.zip || !shippingAddress?.country) {
            return res.status(400).json({ message: 'Complete shipping address is required (street, city, zip, country)' });
        }
        const order = await OrderService.createOrder(uid(req), shippingAddress);
        return res.status(201).json(order);
    } catch (err: any) {
        const status = err.message.includes('empty') ? 400
            : err.message.includes('stock') ? 409 : 500;
        return res.status(status).json({ message: err.message });
    }
};

// GET /api/orders/my
export const getMyOrders = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const status = req.query.status as string | undefined;
        const result = await OrderService.getMyOrders(uid(req), page, limit, status);
        return res.json(result);
    } catch (err: any) {
        return res.status(500).json({ message: err.message });
    }
};

// GET /api/orders/:id
export const getOrderById = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const order = await OrderService.getOrderById(req.params.id as string, uid(req), isAdmin(req));
        return res.json(order);
    } catch (err: any) {
        return res.status(err.message.includes('not found') ? 404 : 403).json({ message: err.message });
    }
};

// PUT /api/orders/:id/cancel
export const cancelOrder = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const order = await OrderService.cancelOrder(req.params.id as string, uid(req), req.body.reason);
        return res.json(order);
    } catch (err: any) {
        const status = err.message.includes('not found') ? 404
            : err.message.includes('Cannot cancel') ? 409 : 500;
        return res.status(status).json({ message: err.message });
    }
};

// GET /api/orders  (admin)
export const getAllOrders = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const status = req.query.status as string | undefined;
        const userId = req.query.userId as string | undefined;
        const aiRisk = req.query.aiRisk as string | undefined;
        const result = await OrderService.getAllOrders(page, limit, status, userId, aiRisk);
        return res.json(result);
    } catch (err: any) {
        return res.status(500).json({ message: err.message });
    }
};

// PUT /api/orders/:id/status  (admin)
export const updateOrderStatus = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const { status } = req.body;
        if (!status) return res.status(400).json({ message: 'status is required' });
        const order = await OrderService.updateOrderStatus(req.params.id as string, status as OrderStatus);
        return res.json(order);
    } catch (err: any) {
        const code = err.message.includes('not found') ? 404
            : err.message.includes('Cannot transition') ? 409 : 500;
        return res.status(code).json({ message: err.message });
    }
};

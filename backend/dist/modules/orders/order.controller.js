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
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateOrderStatus = exports.getAllOrders = exports.cancelOrder = exports.getOrderById = exports.getMyOrders = exports.createOrder = void 0;
const OrderService = __importStar(require("./order.service"));
const uid = (req) => req.user._id.toString();
const isAdmin = (req) => req.user?.role === 'admin';
// POST /api/orders
const createOrder = async (req, res) => {
    try {
        const { shippingAddress } = req.body;
        if (!shippingAddress?.street || !shippingAddress?.city || !shippingAddress?.zip || !shippingAddress?.country) {
            return res.status(400).json({ message: 'Complete shipping address is required (street, city, zip, country)' });
        }
        const order = await OrderService.createOrder(uid(req), shippingAddress);
        return res.status(201).json(order);
    }
    catch (err) {
        const status = err.message.includes('empty') ? 400
            : err.message.includes('stock') ? 409 : 500;
        return res.status(status).json({ message: err.message });
    }
};
exports.createOrder = createOrder;
// GET /api/orders/my
const getMyOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const status = req.query.status;
        const result = await OrderService.getMyOrders(uid(req), page, limit, status);
        return res.json(result);
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
};
exports.getMyOrders = getMyOrders;
// GET /api/orders/:id
const getOrderById = async (req, res) => {
    try {
        const order = await OrderService.getOrderById(req.params.id, uid(req), isAdmin(req));
        return res.json(order);
    }
    catch (err) {
        return res.status(err.message.includes('not found') ? 404 : 403).json({ message: err.message });
    }
};
exports.getOrderById = getOrderById;
// PUT /api/orders/:id/cancel
const cancelOrder = async (req, res) => {
    try {
        const order = await OrderService.cancelOrder(req.params.id, uid(req), req.body.reason);
        return res.json(order);
    }
    catch (err) {
        const status = err.message.includes('not found') ? 404
            : err.message.includes('Cannot cancel') ? 409 : 500;
        return res.status(status).json({ message: err.message });
    }
};
exports.cancelOrder = cancelOrder;
// GET /api/orders  (admin)
const getAllOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const status = req.query.status;
        const userId = req.query.userId;
        const aiRisk = req.query.aiRisk;
        const result = await OrderService.getAllOrders(page, limit, status, userId, aiRisk);
        return res.json(result);
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
};
exports.getAllOrders = getAllOrders;
// PUT /api/orders/:id/status  (admin)
const updateOrderStatus = async (req, res) => {
    try {
        const { status } = req.body;
        if (!status)
            return res.status(400).json({ message: 'status is required' });
        const order = await OrderService.updateOrderStatus(req.params.id, status);
        return res.json(order);
    }
    catch (err) {
        const code = err.message.includes('not found') ? 404
            : err.message.includes('Cannot transition') ? 409 : 500;
        return res.status(code).json({ message: err.message });
    }
};
exports.updateOrderStatus = updateOrderStatus;
//# sourceMappingURL=order.controller.js.map
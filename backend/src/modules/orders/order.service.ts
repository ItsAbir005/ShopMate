/**
 * order.service.ts
 * Handles the full order lifecycle. Never touches payments directly.
 *
 * ── Inventory Locking Strategy ───────────────────────────────────────────
 * Instead of READ → CHECK → WRITE (non-atomic, causes overselling), we use
 * MongoDB atomic `findOneAndUpdate` with a stock guard condition:
 *
 *   findOneAndUpdate({ _id, stock: { $gte: qty } }, { $inc: { stock: -qty } })
 *
 * This is a single round-trip. MongoDB only applies the $inc if the condition
 * passes — making it race-condition proof. If two users buy the last item
 * simultaneously, only ONE succeeds. The other gets null → throws immediately.
 *
 * On failure mid-loop, all previously decremented items are restored (rollback).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import mongoose from 'mongoose';
import { Order, OrderStatus } from '../../models/Order';
import { Product } from '../../models/Product';
import { getCart, clearCart as clearRedisCart } from '../cart/cart.service';
import { rabbitMQ } from '../../config/rabbitmq';

const TAX_RATE = 0.08;
const FREE_SHIPPING = 50;
const SHIPPING_COST = 5.99;

// ── Valid status transitions ───────────────────────────────────────────────────
const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
    pending: ['paid', 'cancelled'],
    paid: ['shipped', 'cancelled'],
    shipped: ['delivered'],
    delivered: ['returned'],
    cancelled: [],
    returned: [],
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface LockedItem {
    product_id: mongoose.Types.ObjectId;
    variant_id?: string;
    quantity: number;
}

// ── Rollback: undo stock locks if anything fails mid-checkout ─────────────────
const releaseLocks = async (locked: LockedItem[]) => {
    for (const item of locked) {
        try {
            if (item.variant_id) {
                await Product.updateOne(
                    { _id: item.product_id, 'variants._id': item.variant_id },
                    { $inc: { 'variants.$.stock': item.quantity } }
                );
            } else {
                await Product.findByIdAndUpdate(item.product_id, { $inc: { stock: item.quantity } });
            }
        } catch (rollbackErr) {
            console.error(`⚠️  ROLLBACK FAILED for product ${item.product_id}:`, rollbackErr);
        }
    }
};

// ── 1. Create Order from Cart ─────────────────────────────────────────────────
export const createOrder = async (userId: string, shippingAddress: {
    street: string; city: string; state: string; zip: string; country: string;
}) => {
    const cart = await getCart(userId);
    if (!cart || cart.items.length === 0) throw new Error('Cart is empty');

    const orderItems: any[] = [];
    let subtotal = 0;
    let discountAmount = 0;

    // Track what we've locked so we can roll back on failure
    const locked: LockedItem[] = [];

    for (const item of cart.items) {
        // ── ATOMIC STOCK LOCK ──────────────────────────────────────────────
        // Single DB operation: only succeeds if stock >= quantity.
        // This prevents race conditions — two simultaneous checkouts for the
        // last item will result in exactly ONE success and ONE failure.

        let updatedProduct: any = null;

        if (item.variant_id) {
            // Variant stock lock
            updatedProduct = await Product.findOneAndUpdate(
                {
                    _id: item.product_id,
                    'variants._id': item.variant_id,
                    'variants.stock': { $gte: item.quantity },
                },
                { $inc: { 'variants.$.stock': -item.quantity } },
                { new: true }
            );
        } else {
            // Simple stock lock
            updatedProduct = await Product.findOneAndUpdate(
                {
                    _id: item.product_id,
                    stock: { $gte: item.quantity },
                },
                { $inc: { stock: -item.quantity } },
                { new: true }
            );
        }

        if (!updatedProduct) {
            // Lock failed — either product removed or insufficient stock.
            // Roll back all items successfully locked so far.
            await releaseLocks(locked);

            // Fetch fresh product to give accurate error message
            const freshProduct = await Product.findById(item.product_id);
            if (!freshProduct) {
                throw new Error(`"${item.title}" is no longer available.`);
            }
            const remaining = item.variant_id
                ? freshProduct.variants?.find((v: any) => v._id?.toString() === item.variant_id)?.stock ?? 0
                : freshProduct.stock;

            throw new Error(
                `Insufficient stock for "${freshProduct.title}". ` +
                `Only ${remaining} left, you requested ${item.quantity}.`
            );
        }

        // Successfully locked — track for potential rollback
        locked.push({
            product_id: updatedProduct._id,
            variant_id: item.variant_id ?? undefined,
            quantity: item.quantity,
        });

        // ── Pricing ───────────────────────────────────────────────────────
        const originalPrice = updatedProduct.price;
        const discountedPrice = updatedProduct.discount > 0
            ? parseFloat((originalPrice * (1 - updatedProduct.discount / 100)).toFixed(2))
            : originalPrice;

        subtotal += discountedPrice * item.quantity;
        discountAmount += (originalPrice - discountedPrice) * item.quantity;

        orderItems.push({
            product_id: updatedProduct._id,
            variant_id: item.variant_id ?? undefined,
            title: updatedProduct.title,
            image: updatedProduct.images?.[0] ?? '',
            price: discountedPrice,
            discount: updatedProduct.discount ?? 0,
            quantity: item.quantity,
        });
    }

    // ── Totals ────────────────────────────────────────────────────────────────
    const tax = parseFloat((subtotal * TAX_RATE).toFixed(2));
    const shipping = subtotal >= FREE_SHIPPING ? 0 : SHIPPING_COST;
    const total = parseFloat((subtotal + tax + shipping).toFixed(2));

    let order;
    try {
        order = await Order.create({
            user_id: userId,
            order_items: orderItems,
            shipping_address: shippingAddress,
            subtotal: parseFloat(subtotal.toFixed(2)),
            discount_amount: parseFloat(discountAmount.toFixed(2)),
            tax_amount: tax,
            shipping_cost: shipping,
            total_amount: total,
            status: 'pending',
            payment_status: 'unpaid',
            paymentProvider: 'paypal',
        });
    } catch (dbErr) {
        // Order DB write failed — release all stock locks
        await releaseLocks(locked);
        throw dbErr;
    }

    // ── Clear cart from Redis ──────────────────────────────────────────────────
    await clearRedisCart(userId);

    // ── Publish event (NOTE: stock already locked above, subscriber skips deduction) ──
    // The order.created event is now only used for: email + 24h reminder scheduling.
    // Stock was already atomically deducted during checkout.
    await rabbitMQ.publishEvent('order.created', {
        orderId: order._id,
        userId: userId,
        items: orderItems,
        totalAmount: order.total_amount,
        stockAlreadyLocked: true, // signal to worker to skip stock deduction
    });

    return order;
};

// ── 2. Get User Orders (paginated) ────────────────────────────────────────────
export const getMyOrders = async (userId: string, page = 1, limit = 10, status?: string) => {
    const query: any = { user_id: userId };
    if (status) query.status = status;

    const total = await Order.countDocuments(query);
    const orders = await Order.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

    return { orders, total, page, pages: Math.ceil(total / limit) };
};

// ── 3. Get Single Order ───────────────────────────────────────────────────────
export const getOrderById = async (orderId: string, userId: string, isAdmin = false) => {
    const order = await Order.findById(orderId).lean();
    if (!order) throw new Error('Order not found');
    if (!isAdmin && order.user_id.toString() !== userId) throw new Error('Not your order');
    return order;
};

// ── 4. Cancel Order ───────────────────────────────────────────────────────────
export const cancelOrder = async (orderId: string, userId: string, reason?: string) => {
    const order = await Order.findById(orderId);
    if (!order) throw new Error('Order not found');
    if (order.user_id.toString() !== userId) throw new Error('Not your order');

    const cancellable: OrderStatus[] = ['pending', 'paid'];
    if (!cancellable.includes(order.status)) {
        throw new Error(`Cannot cancel an order with status "${order.status}"`);
    }

    // Restore stock atomically for each item
    for (const item of order.order_items) {
        if (item.variant_id) {
            await Product.updateOne(
                { _id: item.product_id, 'variants._id': item.variant_id },
                { $inc: { 'variants.$.stock': item.quantity } }
            );
        } else {
            await Product.findByIdAndUpdate(item.product_id, { $inc: { stock: item.quantity } });
        }
    }

    order.status = 'cancelled';
    order.cancelled_at = new Date();
    order.cancellation_reason = reason ?? 'Cancelled by user';
    await order.save();
    return order;
};

// ── 5. Admin — Get All Orders ─────────────────────────────────────────────────
export const getAllOrders = async (page = 1, limit = 20, status?: string, userId?: string) => {
    const query: any = {};
    if (status) query.status = status;
    if (userId) query.user_id = userId;

    const total = await Order.countDocuments(query);
    const orders = await Order.find(query)
        .populate('user_id', 'name email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

    return { orders, total, page, pages: Math.ceil(total / limit) };
};

// ── 6. Admin — Update Order Status ───────────────────────────────────────────
export const updateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
    const order = await Order.findById(orderId);
    if (!order) throw new Error('Order not found');

    const allowed = STATUS_TRANSITIONS[order.status];
    if (!allowed.includes(newStatus)) {
        throw new Error(`Cannot transition from "${order.status}" → "${newStatus}"`);
    }

    if (newStatus === 'paid') order.payment_status = 'paid';

    // If cancelled via admin → restore stock
    if (newStatus === 'cancelled') {
        for (const item of order.order_items) {
            if (item.variant_id) {
                await Product.updateOne(
                    { _id: item.product_id, 'variants._id': item.variant_id },
                    { $inc: { 'variants.$.stock': item.quantity } }
                );
            } else {
                await Product.findByIdAndUpdate(item.product_id, { $inc: { stock: item.quantity } });
            }
        }
        order.cancelled_at = new Date();
    }

    order.status = newStatus;
    await order.save();
    return order;
};

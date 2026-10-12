"use strict";
/**
 * shipping.service.ts
 *
 * Core shipping logic:
 * - createShipment: creates shipment record from a paid order
 * - assignDriver: Redis GeoSearch → finds nearest online driver → assigns
 * - updateShipmentStatus: validates lifecycle + timestamps
 * - confirmDelivery: OTP verification → marks delivered → updates order
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectDelivery = exports.acceptDelivery = exports.getShipmentByOrder = exports.confirmDelivery = exports.updateShipmentStatus = exports.assignDriver = exports.createShipment = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Shipment_1 = require("../../models/Shipment");
const Order_1 = require("../../models/Order");
const Driver_1 = require("../../models/Driver");
const driver_service_1 = require("../drivers/driver.service");
const rabbitmq_1 = require("../../config/rabbitmq");
const socket_1 = require("../../config/socket");
// ── Valid Status Transitions ───────────────────────────────────────────────────
const STATUS_TRANSITIONS = {
    pending: ['assigned', 'failed'],
    assigned: ['picked_up', 'failed'],
    picked_up: ['out_for_delivery', 'failed'],
    out_for_delivery: ['delivered', 'failed'],
    delivered: [],
    failed: [],
};
// ── 1. Create Shipment ────────────────────────────────────────────────────────
const createShipment = async (orderId) => {
    const order = await Order_1.Order.findById(orderId);
    if (!order)
        throw new Error(`Order ${orderId} not found`);
    // Idempotent: don't create duplicate shipments
    const existing = await Shipment_1.Shipment.findOne({ order_id: orderId });
    if (existing) {
        console.log(`⚠️  Shipment already exists for order ${orderId}: ${existing.trackingCode}`);
        return existing;
    }
    // For a real system pick-up address would be the warehouse.
    // Using a placeholder here; update for your actual warehouse address.
    const warehouseAddress = {
        street: '123 ShopMate Warehouse',
        city: 'Mumbai',
        state: 'Maharashtra',
        zip: '400001',
        country: 'India',
    };
    const shipment = await Shipment_1.Shipment.create({
        order_id: order._id,
        pickupAddress: warehouseAddress,
        deliveryAddress: order.shipping_address,
        estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // +3 days
    });
    console.log(`📦 Shipment created: ${shipment.trackingCode} for order ${orderId}`);
    // Update order status to 'shipped' (we handle fulfillment now)
    await Order_1.Order.findByIdAndUpdate(orderId, { status: 'shipped' });
    // Publish event so shipment subscriber can assign a driver
    await rabbitmq_1.rabbitMQ.publishEvent('shipment.created', {
        shipmentId: shipment._id.toString(),
        orderId: orderId,
        deliveryAddress: order.shipping_address,
    });
    return shipment;
};
exports.createShipment = createShipment;
// ── 2. Assign Nearest Driver ──────────────────────────────────────────────────
// Called by shipment.subscriber when shipment.created event fires.
// Uses Redis GeoSearch to find nearest available driver.
// Fallback: warehouse lat/lng (Kolkata default for dev)
const assignDriver = async (shipmentId, pickupLat = 22.5726, pickupLng = 88.3639) => {
    const shipment = await Shipment_1.Shipment.findById(shipmentId);
    if (!shipment)
        throw new Error('Shipment not found');
    if (shipment.status !== 'pending')
        return shipment;
    const rejectedByIds = shipment.rejectedBy?.map(id => id.toString()) || [];
    const driverId = await (0, driver_service_1.findNearestDriver)(pickupLat, pickupLng, 5000, rejectedByIds);
    if (!driverId) {
        console.warn(`⚠️  No available drivers for shipment ${shipmentId} within 5000km. Will retry later.`);
        return shipment;
    }
    // Update shipment
    shipment.driver_id = new mongoose_1.default.Types.ObjectId(driverId);
    shipment.status = 'assigned';
    shipment.assignedAt = new Date();
    await shipment.save();
    // Mark driver as busy
    await Driver_1.Driver.findByIdAndUpdate(driverId, { status: 'busy', isAvailable: false });
    // Notify driver via Socket.io (room: driver:<id>)
    const io = (0, socket_1.getIO)();
    io.to(`driver:${driverId}`).emit('delivery:assigned', {
        shipmentId: shipment._id.toString(),
        trackingCode: shipment.trackingCode,
        deliveryAddress: shipment.deliveryAddress,
        otp: shipment.otp,
    });
    console.log(`🚗 Driver ${driverId} assigned to shipment ${shipment.trackingCode}`);
    return shipment;
};
exports.assignDriver = assignDriver;
// ── 3. Update Shipment Status (by driver) ────────────────────────────────────
const updateShipmentStatus = async (shipmentId, driverId, newStatus) => {
    const shipment = await Shipment_1.Shipment.findById(shipmentId);
    if (!shipment)
        throw new Error('Shipment not found');
    if (shipment.driver_id?.toString() !== driverId)
        throw new Error('Not your delivery');
    const allowed = STATUS_TRANSITIONS[shipment.status];
    if (!allowed.includes(newStatus)) {
        throw new Error(`Cannot transition: ${shipment.status} → ${newStatus}`);
    }
    // Set timestamp for each status
    if (newStatus === 'picked_up')
        shipment.pickedUpAt = new Date();
    if (newStatus === 'delivered')
        shipment.deliveredAt = new Date();
    if (newStatus === 'failed') {
        // Release driver back to available
        await Driver_1.Driver.findByIdAndUpdate(driverId, { status: 'online', isAvailable: true });
    }
    shipment.status = newStatus;
    await shipment.save();
    // Notify customer via Socket.io (room: order:<orderId>)
    const io = (0, socket_1.getIO)();
    io.to(`order:${shipment.order_id.toString()}`).emit('status:changed', {
        shipmentId: shipment._id.toString(),
        status: newStatus,
        trackingCode: shipment.trackingCode,
    });
    return shipment;
};
exports.updateShipmentStatus = updateShipmentStatus;
// ── 4. Confirm Delivery via OTP ───────────────────────────────────────────────
const confirmDelivery = async (shipmentId, driverId, otp) => {
    const shipment = await Shipment_1.Shipment.findById(shipmentId);
    if (!shipment)
        throw new Error('Shipment not found');
    if (shipment.driver_id?.toString() !== driverId)
        throw new Error('Not your delivery');
    if (shipment.status !== 'out_for_delivery') {
        throw new Error('Shipment must be "out_for_delivery" to confirm');
    }
    if (shipment.otp !== otp)
        throw new Error('Invalid OTP');
    shipment.status = 'delivered';
    shipment.deliveredAt = new Date();
    await shipment.save();
    // Update order to delivered
    await Order_1.Order.findByIdAndUpdate(shipment.order_id, { status: 'delivered' });
    // Release driver back to available
    await Driver_1.Driver.findByIdAndUpdate(driverId, { status: 'online', isAvailable: true });
    // Notify customer
    const io = (0, socket_1.getIO)();
    io.to(`order:${shipment.order_id.toString()}`).emit('status:changed', {
        status: 'delivered',
        trackingCode: shipment.trackingCode,
    });
    console.log(`✅ Shipment ${shipment.trackingCode} delivered! Order ${shipment.order_id} marked delivered.`);
    return shipment;
};
exports.confirmDelivery = confirmDelivery;
// ── 5. Get Shipment by Order ID (for customer tracking) ───────────────────────
const getShipmentByOrder = async (orderId) => {
    return Shipment_1.Shipment.findOne({ order_id: orderId })
        .populate('driver_id', 'name phone vehicleNumber vehicleType currentLocation');
};
exports.getShipmentByOrder = getShipmentByOrder;
// ── 6. Accept Delivery ────────────────────────────────────────────────────────
const acceptDelivery = async (shipmentId, driverId) => {
    const shipment = await Shipment_1.Shipment.findById(shipmentId);
    if (!shipment)
        throw new Error('Shipment not found');
    if (shipment.driver_id?.toString() !== driverId)
        throw new Error('Not your delivery');
    if (shipment.status !== 'assigned')
        throw new Error('Shipment is not in assigned state');
    // Acceptance is implicit — no status change needed; driver just starts the pickup.
    // Mark pickedUpAt to confirm they accepted.
    return shipment;
};
exports.acceptDelivery = acceptDelivery;
// ── 7. Reject Delivery ────────────────────────────────────────────────────────
const rejectDelivery = async (shipmentId, driverId) => {
    const shipment = await Shipment_1.Shipment.findById(shipmentId);
    if (!shipment)
        throw new Error('Shipment not found');
    if (shipment.driver_id?.toString() !== driverId)
        throw new Error('Not your delivery');
    if (shipment.status !== 'assigned')
        throw new Error('Cannot reject a shipment that is not in assigned state');
    // Unassign driver and reset to pending
    shipment.driver_id = undefined;
    shipment.status = 'pending';
    shipment.assignedAt = undefined;
    if (!shipment.rejectedBy)
        shipment.rejectedBy = [];
    const objId = new mongoose_1.default.Types.ObjectId(driverId);
    if (!shipment.rejectedBy.some(id => id.equals(objId))) {
        shipment.rejectedBy.push(objId);
    }
    await shipment.save();
    // Release driver back to available
    await Driver_1.Driver.findByIdAndUpdate(driverId, { status: 'online', isAvailable: true });
    // Re-publish so subscriber assigns a different driver
    await rabbitmq_1.rabbitMQ.publishEvent('shipment.created', {
        shipmentId: shipment._id.toString(),
        orderId: shipment.order_id.toString(),
        deliveryAddress: shipment.deliveryAddress,
    });
    console.log(`🔄 Driver ${driverId} rejected shipment ${shipment.trackingCode}. Re-assigning...`);
    return shipment;
};
exports.rejectDelivery = rejectDelivery;
//# sourceMappingURL=shipping.service.js.map
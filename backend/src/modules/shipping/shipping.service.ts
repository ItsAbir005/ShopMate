/**
 * shipping.service.ts
 *
 * Core shipping logic:
 * - createShipment: creates shipment record from a paid order
 * - assignDriver: Redis GeoSearch → finds nearest online driver → assigns
 * - updateShipmentStatus: validates lifecycle + timestamps
 * - confirmDelivery: OTP verification → marks delivered → updates order
 */

import mongoose from 'mongoose';
import { Shipment, ShipmentStatus } from '../../models/Shipment';
import { Order } from '../../models/Order';
import { Driver } from '../../models/Driver';
import { findNearestDriver } from '../drivers/driver.service';
import { rabbitMQ } from '../../config/rabbitmq';
import { getIO } from '../../config/socket';
import { logger } from '../../utils/logger';

// ── Valid Status Transitions ───────────────────────────────────────────────────
const STATUS_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
    pending: ['assigned', 'failed'],
    assigned: ['picked_up', 'failed'],
    picked_up: ['out_for_delivery', 'failed'],
    out_for_delivery: ['delivered', 'failed'],
    delivered: [],
    failed: [],
};

// ── 1. Create Shipment ────────────────────────────────────────────────────────
export const createShipment = async (orderId: string) => {
    const order = await Order.findById(orderId);
    if (!order) throw new Error(`Order ${orderId} not found`);

    // Idempotent: don't create duplicate shipments
    const existing = await Shipment.findOne({ order_id: orderId });
    if (existing) {
        logger.info({ orderId, trackingCode: existing.trackingCode }, '[shipping] Shipment already exists for order');
        return existing;
    }

    // Warehouse address placeholder
    const warehouseAddress = {
        street: '123 ShopMate Warehouse',
        city: 'Mumbai',
        state: 'Maharashtra',
        zip: '400001',
        country: 'India',
    };

    const shipment = await Shipment.create({
        order_id: order._id,
        pickupAddress: warehouseAddress,
        deliveryAddress: order.shipping_address,
        estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // +3 days
        status: 'pending',
    });

    logger.info({ trackingCode: shipment.trackingCode, orderId }, '[shipping] Shipment created');

    // Attempt in-process driver assignment (fails soft: order stays Paid, shipment stays pending)
    try {
        const assigned = await assignDriver(shipment._id.toString());
        if (!assigned || assigned.status === 'pending') {
            logger.warn({ shipmentId: shipment._id, orderId }, '[shipping] No available driver assigned; shipment remains pending assignment');
        }
    } catch (driverErr: any) {
        logger.warn({ err: driverErr.message, shipmentId: shipment._id, orderId }, '[shipping] Driver assignment failed soft; shipment remains pending assignment');
    }

    // Publish event as extra step only if RabbitMQ is connected
    if (rabbitMQ.isConnected()) {
        try {
            await rabbitMQ.publishEvent('shipment.created', {
                shipmentId: shipment._id.toString(),
                orderId: orderId,
                deliveryAddress: order.shipping_address,
            });
        } catch (rmqErr: any) {
            logger.warn({ err: rmqErr.message, orderId }, '[shipping] RabbitMQ publish shipment.created failed soft');
        }
    }

    return shipment;
};

// ── 2. Assign Nearest Driver ──────────────────────────────────────────────────
// Uses Redis GeoSearch to find nearest available driver.
export const assignDriver = async (
    shipmentId: string,
    pickupLat: number = 22.5726,
    pickupLng: number = 88.3639
) => {
    const shipment = await Shipment.findById(shipmentId);
    if (!shipment) throw new Error('Shipment not found');
    if (shipment.status !== 'pending') return shipment;

    const rejectedByIds = shipment.rejectedBy?.map(id => id.toString()) || [];
    const driverId = await findNearestDriver(pickupLat, pickupLng, 5000, rejectedByIds);

    if (!driverId) {
        logger.warn({ shipmentId, pickupLat, pickupLng }, '[shipping] No available drivers within radius; shipment remains pending assignment');
        return shipment;
    }

    // Update shipment
    shipment.driver_id = new mongoose.Types.ObjectId(driverId);
    shipment.status = 'assigned';
    shipment.assignedAt = new Date();
    await shipment.save();

    // Mark driver as busy
    await Driver.findByIdAndUpdate(driverId, { status: 'busy', isAvailable: false });

    // Notify driver via Socket.io (room: driver:<id>)
    try {
        const io = getIO();
        io.to(`driver:${driverId}`).emit('delivery:assigned', {
            shipmentId: shipment._id.toString(),
            trackingCode: shipment.trackingCode,
            deliveryAddress: shipment.deliveryAddress,
            otp: shipment.otp,
        });
    } catch (socketErr: any) {
        logger.warn({ err: socketErr.message, driverId }, '[shipping] Socket notify driver failed soft');
    }

    logger.info({ driverId, trackingCode: shipment.trackingCode }, '[shipping] Driver assigned to shipment');
    return shipment;
};

// ── 3. Update Shipment Status (by driver) ────────────────────────────────────
export const updateShipmentStatus = async (
    shipmentId: string,
    driverId: string,
    newStatus: ShipmentStatus
) => {
    const shipment = await Shipment.findById(shipmentId);
    if (!shipment) throw new Error('Shipment not found');
    if (shipment.driver_id?.toString() !== driverId) throw new Error('Not your delivery');

    const allowed = STATUS_TRANSITIONS[shipment.status];
    if (!allowed.includes(newStatus)) {
        throw new Error(`Cannot transition: ${shipment.status} → ${newStatus}`);
    }

    // Set timestamp for each status
    if (newStatus === 'picked_up') shipment.pickedUpAt = new Date();
    if (newStatus === 'delivered') shipment.deliveredAt = new Date();

    if (newStatus === 'failed') {
        // Release driver back to available
        await Driver.findByIdAndUpdate(driverId, { status: 'online', isAvailable: true });
    }

    shipment.status = newStatus;
    await shipment.save();

    // Notify customer via Socket.io (room: order:<orderId>)
    const io = getIO();
    io.to(`order:${shipment.order_id.toString()}`).emit('status:changed', {
        shipmentId: shipment._id.toString(),
        status: newStatus,
        trackingCode: shipment.trackingCode,
    });

    return shipment;
};

// ── 4. Confirm Delivery via OTP ───────────────────────────────────────────────
export const confirmDelivery = async (
    shipmentId: string,
    driverId: string,
    otp: string
) => {
    const shipment = await Shipment.findById(shipmentId);
    if (!shipment) throw new Error('Shipment not found');
    if (shipment.driver_id?.toString() !== driverId) throw new Error('Not your delivery');
    if (shipment.status !== 'out_for_delivery') {
        throw new Error('Shipment must be "out_for_delivery" to confirm');
    }
    if (shipment.otp !== otp) throw new Error('Invalid OTP');

    shipment.status = 'delivered';
    shipment.deliveredAt = new Date();
    await shipment.save();

    // Update order to delivered
    await Order.findByIdAndUpdate(shipment.order_id, { status: 'delivered' });

    // Release driver back to available
    await Driver.findByIdAndUpdate(driverId, { status: 'online', isAvailable: true });

    // Notify customer
    const io = getIO();
    io.to(`order:${shipment.order_id.toString()}`).emit('status:changed', {
        status: 'delivered',
        trackingCode: shipment.trackingCode,
    });

    console.log(`✅ Shipment ${shipment.trackingCode} delivered! Order ${shipment.order_id} marked delivered.`);
    return shipment;
};

// ── 5. Get Shipment by Order ID (for customer tracking) ───────────────────────
export const getShipmentByOrder = async (orderId: string) => {
    return Shipment.findOne({ order_id: orderId })
        .populate('driver_id', 'name phone vehicleNumber vehicleType currentLocation');
};

// ── 6. Accept Delivery ────────────────────────────────────────────────────────
export const acceptDelivery = async (shipmentId: string, driverId: string) => {
    const shipment = await Shipment.findById(shipmentId);
    if (!shipment) throw new Error('Shipment not found');
    if (shipment.driver_id?.toString() !== driverId) throw new Error('Not your delivery');
    if (shipment.status !== 'assigned') throw new Error('Shipment is not in assigned state');
    // Acceptance is implicit — no status change needed; driver just starts the pickup.
    // Mark pickedUpAt to confirm they accepted.
    return shipment;
};

// ── 7. Reject Delivery ────────────────────────────────────────────────────────
export const rejectDelivery = async (shipmentId: string, driverId: string) => {
    const shipment = await Shipment.findById(shipmentId);
    if (!shipment) throw new Error('Shipment not found');
    if (shipment.driver_id?.toString() !== driverId) throw new Error('Not your delivery');
    if (shipment.status !== 'assigned') throw new Error('Cannot reject a shipment that is not in assigned state');

    // Unassign driver and reset to pending
    shipment.driver_id = undefined as any;
    shipment.status = 'pending';
    shipment.assignedAt = undefined as any;
    if (!shipment.rejectedBy) shipment.rejectedBy = [];
    const objId = new mongoose.Types.ObjectId(driverId);
    if (!shipment.rejectedBy.some(id => id.equals(objId))) {
        shipment.rejectedBy.push(objId);
    }
    await shipment.save();

    // Release driver back to available
    await Driver.findByIdAndUpdate(driverId, { status: 'online', isAvailable: true });

    // Re-publish so subscriber assigns a different driver
    await rabbitMQ.publishEvent('shipment.created', {
        shipmentId: shipment._id.toString(),
        orderId: shipment.order_id.toString(),
        deliveryAddress: shipment.deliveryAddress,
    });

    console.log(`🔄 Driver ${driverId} rejected shipment ${shipment.trackingCode}. Re-assigning...`);
    return shipment;
};

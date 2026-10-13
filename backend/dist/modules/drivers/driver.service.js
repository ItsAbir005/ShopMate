"use strict";
/**
 * driver.service.ts
 *
 * Core driver business logic:
 * - Go online/offline (updates Redis GeoSet for proximity search)
 * - Update location (Redis GEOADD)
 * - Get active delivery, history
 * - Driver assignment via GeoSearch (nearest available driver within radius)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDriverProfile = exports.getDeliveryHistory = exports.getActiveDelivery = exports.findNearestDriver = exports.updateDriverLocation = exports.setDriverStatus = void 0;
const Driver_1 = require("../../models/Driver");
const Shipment_1 = require("../../models/Shipment");
const redis_1 = require("../../config/redis");
const socket_1 = require("../../config/socket");
const logger_1 = require("../../utils/logger");
const GEO_KEY = 'drivers:online'; // Redis GeoSet key
const lastLocationLogTimes = new Map();
// ── Go Online / Offline ───────────────────────────────────────────────────────
const setDriverStatus = async (driverId, status, lat, lng) => {
    const driver = await Driver_1.Driver.findById(driverId);
    if (!driver)
        throw new Error('Driver not found');
    driver.status = status === 'online' ? 'online' : 'offline';
    driver.isAvailable = status === 'online';
    if (status === 'online' && lat !== undefined && lng !== undefined) {
        driver.currentLocation = { lat, lng, updatedAt: new Date() };
        // Add to Redis GeoSet safely
        try {
            if (redis_1.redisClient.isOpen) {
                await redis_1.redisClient.geoAdd(GEO_KEY, { longitude: lng, latitude: lat, member: driverId });
            }
        }
        catch (err) {
            logger_1.logger.warn({ err, driverId }, '[driver] Failed to update Redis GeoSet on go-online');
        }
    }
    if (status === 'offline') {
        // Remove from GeoSet safely
        try {
            if (redis_1.redisClient.isOpen) {
                await redis_1.redisClient.zRem(GEO_KEY, driverId);
            }
        }
        catch (err) {
            logger_1.logger.warn({ err, driverId }, '[driver] Failed to remove from Redis GeoSet on go-offline');
        }
    }
    await driver.save();
    logger_1.logger.info({ driverId, status, lat, lng }, `[driver] Driver ${driverId} status updated to ${status}`);
    return { status: driver.status, isAvailable: driver.isAvailable };
};
exports.setDriverStatus = setDriverStatus;
// ── Update Location (called periodically from driver app) ─────────────────────
const updateDriverLocation = async (driverId, lat, lng) => {
    await Driver_1.Driver.findByIdAndUpdate(driverId, {
        'currentLocation.lat': lat,
        'currentLocation.lng': lng,
        'currentLocation.updatedAt': new Date(),
    });
    // Update position in Redis GeoSet safely
    try {
        if (redis_1.redisClient.isOpen) {
            await redis_1.redisClient.geoAdd(GEO_KEY, { longitude: lng, latitude: lat, member: driverId });
        }
    }
    catch (err) {
        logger_1.logger.warn({ err, driverId }, '[driver] Failed to update Redis GeoSet position');
    }
    // Throttle location logging to at most once per minute per driver
    const now = Date.now();
    const lastLog = lastLocationLogTimes.get(driverId) || 0;
    if (now - lastLog >= 60000) {
        lastLocationLogTimes.set(driverId, now);
        logger_1.logger.info({ driverId, lat, lng }, `[driver] Location updated for driver ${driverId}`);
    }
    // Broadcast to customer live-tracking room if active delivery exists
    try {
        const activeDelivery = await (0, exports.getActiveDelivery)(driverId);
        if (activeDelivery && activeDelivery.order_id) {
            (0, socket_1.getIO)().to(`order:${activeDelivery.order_id._id.toString()}`).emit('driver:location', { lat, lng });
        }
    }
    catch (e) {
        logger_1.logger.error({ e }, "[driver] Failed to broadcast driver location");
    }
    return { lat, lng };
};
exports.updateDriverLocation = updateDriverLocation;
// ── Find Nearest Available Driver ─────────────────────────────────────────────
// Returns the closest online driver within `radiusKm` of the given coordinates.
// Uses Redis GEOSEARCH to get member IDs sorted nearest-first, then
// verifies each driver is still online+available in MongoDB.
const findNearestDriver = async (lat, lng, radiusKm = 50, rejectedBy) => {
    let driverIds = [];
    try {
        if (redis_1.redisClient.isOpen) {
            const results = await redis_1.redisClient.geoSearchWith(GEO_KEY, { longitude: lng, latitude: lat }, { radius: radiusKm, unit: 'km' }, ['WITHDIST'], { SORT: 'ASC', COUNT: 10 });
            driverIds = results.map(r => r.member);
        }
    }
    catch (err) {
        logger_1.logger.warn({ err }, '[driver] Redis geoSearchWith failed, falling back to MongoDB query');
    }
    // If Redis had no results or failed, query MongoDB directly for any online available driver
    if (driverIds.length === 0) {
        const fallbackDrivers = await Driver_1.Driver.find({ status: 'online', isAvailable: true }).limit(10);
        driverIds = fallbackDrivers.map(d => d._id.toString());
    }
    logger_1.logger.info({ count: driverIds.length, radiusKm }, `[driver] Found candidate drivers within radius`);
    // Verify each candidate is still online + available in DB (Redis can be stale)
    for (const driverId of driverIds) {
        if (rejectedBy?.includes(driverId)) {
            logger_1.logger.info({ driverId }, `[driver] Skipping driver (previously rejected)`);
            continue;
        }
        const driver = await Driver_1.Driver.findOne({ _id: driverId, status: 'online', isAvailable: true });
        if (driver) {
            logger_1.logger.info({ driverId }, `[driver] Selected available driver for assignment`);
            return driverId;
        }
        else {
            logger_1.logger.info({ driverId }, `[driver] Driver found but offline/busy in DB`);
        }
    }
    return null;
};
exports.findNearestDriver = findNearestDriver;
// ── Get Driver's Active Delivery ──────────────────────────────────────────────
const getActiveDelivery = async (driverId) => {
    return Shipment_1.Shipment.findOne({
        driver_id: driverId,
        status: { $in: ['assigned', 'picked_up', 'out_for_delivery'] },
    }).populate('order_id', 'total_amount order_items');
};
exports.getActiveDelivery = getActiveDelivery;
// ── Get Completed Deliveries ──────────────────────────────────────────────────
const getDeliveryHistory = async (driverId, page = 1, limit = 20) => {
    const total = await Shipment_1.Shipment.countDocuments({ driver_id: driverId, status: 'delivered' });
    const deliveries = await Shipment_1.Shipment.find({ driver_id: driverId, status: 'delivered' })
        .sort({ deliveredAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('order_id', 'total_amount createdAt');
    return { deliveries, total, page, pages: Math.ceil(total / limit) };
};
exports.getDeliveryHistory = getDeliveryHistory;
// ── Get Driver Profile ────────────────────────────────────────────────────────
const getDriverProfile = async (driverId) => {
    return Driver_1.Driver.findById(driverId).select('-password');
};
exports.getDriverProfile = getDriverProfile;
//# sourceMappingURL=driver.service.js.map
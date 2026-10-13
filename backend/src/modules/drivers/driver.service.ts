/**
 * driver.service.ts
 *
 * Core driver business logic:
 * - Go online/offline (updates Redis GeoSet for proximity search)
 * - Update location (Redis GEOADD)
 * - Get active delivery, history
 * - Driver assignment via GeoSearch (nearest available driver within radius)
 */

import { Driver } from '../../models/Driver';
import { Shipment } from '../../models/Shipment';
import { redisClient } from '../../config/redis';
import { getIO } from '../../config/socket';
import { logger } from '../../utils/logger';

const GEO_KEY = 'drivers:online'; // Redis GeoSet key
const lastLocationLogTimes = new Map<string, number>();

// ── Go Online / Offline ───────────────────────────────────────────────────────
export const setDriverStatus = async (
    driverId: string,
    status: 'online' | 'offline',
    lat?: number,
    lng?: number
) => {
    const driver = await Driver.findById(driverId);
    if (!driver) throw new Error('Driver not found');

    driver.status = status === 'online' ? 'online' : 'offline';
    driver.isAvailable = status === 'online';

    if (status === 'online' && lat !== undefined && lng !== undefined) {
        driver.currentLocation = { lat, lng, updatedAt: new Date() };
        // Add to Redis GeoSet safely
        try {
            if (redisClient.isOpen) {
                await redisClient.geoAdd(GEO_KEY, { longitude: lng, latitude: lat, member: driverId });
            }
        } catch (err) {
            logger.warn({ err, driverId }, '[driver] Failed to update Redis GeoSet on go-online');
        }
    }

    if (status === 'offline') {
        // Remove from GeoSet safely
        try {
            if (redisClient.isOpen) {
                await redisClient.zRem(GEO_KEY, driverId);
            }
        } catch (err) {
            logger.warn({ err, driverId }, '[driver] Failed to remove from Redis GeoSet on go-offline');
        }
    }

    await driver.save();
    logger.info({ driverId, status, lat, lng }, `[driver] Driver ${driverId} status updated to ${status}`);
    return { status: driver.status, isAvailable: driver.isAvailable };
};

// ── Update Location (called periodically from driver app) ─────────────────────
export const updateDriverLocation = async (driverId: string, lat: number, lng: number) => {
    await Driver.findByIdAndUpdate(driverId, {
        'currentLocation.lat': lat,
        'currentLocation.lng': lng,
        'currentLocation.updatedAt': new Date(),
    });

    // Update position in Redis GeoSet safely
    try {
        if (redisClient.isOpen) {
            await redisClient.geoAdd(GEO_KEY, { longitude: lng, latitude: lat, member: driverId });
        }
    } catch (err) {
        logger.warn({ err, driverId }, '[driver] Failed to update Redis GeoSet position');
    }
    
    // Throttle location logging to at most once per minute per driver
    const now = Date.now();
    const lastLog = lastLocationLogTimes.get(driverId) || 0;
    if (now - lastLog >= 60000) {
        lastLocationLogTimes.set(driverId, now);
        logger.info({ driverId, lat, lng }, `[driver] Location updated for driver ${driverId}`);
    }

    // Broadcast to customer live-tracking room if active delivery exists
    try {
        const activeDelivery = await getActiveDelivery(driverId);
        if (activeDelivery && activeDelivery.order_id) {
            getIO().to(`order:${activeDelivery.order_id._id.toString()}`).emit('driver:location', { lat, lng });
        }
    } catch (e) {
        logger.error({ e }, "[driver] Failed to broadcast driver location");
    }
    
    return { lat, lng };
};

// ── Find Nearest Available Driver ─────────────────────────────────────────────
// Returns the closest online driver within `radiusKm` of the given coordinates.
// Uses Redis GEOSEARCH to get member IDs sorted nearest-first, then
// verifies each driver is still online+available in MongoDB.
export const findNearestDriver = async (
    lat: number,
    lng: number,
    radiusKm: number = 50,
    rejectedBy?: string[]
): Promise<string | null> => {
    let driverIds: string[] = [];

    try {
        if (redisClient.isOpen) {
            const results = await redisClient.geoSearchWith(
                GEO_KEY,
                { longitude: lng, latitude: lat },
                { radius: radiusKm, unit: 'km' },
                ['WITHDIST'],
                { SORT: 'ASC', COUNT: 10 }
            );
            driverIds = results.map(r => r.member);
        }
    } catch (err) {
        logger.warn({ err }, '[driver] Redis geoSearchWith failed, falling back to MongoDB query');
    }

    // If Redis had no results or failed, query MongoDB directly for any online available driver
    if (driverIds.length === 0) {
        const fallbackDrivers = await Driver.find({ status: 'online', isAvailable: true }).limit(10);
        driverIds = fallbackDrivers.map(d => d._id.toString());
    }

    logger.info({ count: driverIds.length, radiusKm }, `[driver] Found candidate drivers within radius`);

    // Verify each candidate is still online + available in DB (Redis can be stale)
    for (const driverId of driverIds) {
        if (rejectedBy?.includes(driverId)) {
            logger.info({ driverId }, `[driver] Skipping driver (previously rejected)`);
            continue;
        }

        const driver = await Driver.findOne({ _id: driverId, status: 'online', isAvailable: true });
        if (driver) {
            logger.info({ driverId }, `[driver] Selected available driver for assignment`);
            return driverId;
        } else {
            logger.info({ driverId }, `[driver] Driver found but offline/busy in DB`);
        }
    }
    return null;
};

// ── Get Driver's Active Delivery ──────────────────────────────────────────────
export const getActiveDelivery = async (driverId: string) => {
    return Shipment.findOne({
        driver_id: driverId,
        status: { $in: ['assigned', 'picked_up', 'out_for_delivery'] },
    }).populate('order_id', 'total_amount order_items');
};

// ── Get Completed Deliveries ──────────────────────────────────────────────────
export const getDeliveryHistory = async (driverId: string, page = 1, limit = 20) => {
    const total = await Shipment.countDocuments({ driver_id: driverId, status: 'delivered' });
    const deliveries = await Shipment.find({ driver_id: driverId, status: 'delivered' })
        .sort({ deliveredAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('order_id', 'total_amount createdAt');
    return { deliveries, total, page, pages: Math.ceil(total / limit) };
};

// ── Get Driver Profile ────────────────────────────────────────────────────────
export const getDriverProfile = async (driverId: string) => {
    return Driver.findById(driverId).select('-password');
};

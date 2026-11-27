const Location = require('../models/Location');
const User = require('../models/User');
const LiveShareSession = require('../models/LiveShareSession');
const { emitToUser, emitToShareRoom } = require('../services/notificationService');

// Values are deliberately conservative for a personal-safety tracker and can
// be adjusted here if the product needs to support aircraft or older GPS units.
const MAX_ACCURACY_METRES = 100;
const DUPLICATE_DISTANCE_METRES = 5;
const DUPLICATE_TIME_MS = 10 * 1000;
const MAX_SPEED_METRES_PER_SECOND = 55.56; // 200 km/h
const MAX_FUTURE_TIME_MS = 5 * 60 * 1000;
const MAX_LOCATION_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_HISTORY_LIMIT = 500;
const MAX_HISTORY_LIMIT = 1000;

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const distanceInMetres = (from, to) => {
    const earthRadius = 6371000;
    const toRadians = (degrees) => (degrees * Math.PI) / 180;
    const latitudeDelta = toRadians(to.latitude - from.latitude);
    const longitudeDelta = toRadians(to.longitude - from.longitude);
    const a = Math.sin(latitudeDelta / 2) ** 2
        + Math.cos(toRadians(from.latitude))
        * Math.cos(toRadians(to.latitude))
        * Math.sin(longitudeDelta / 2) ** 2;

    return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const parseDate = (value) => {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const updateLocation = async (req,res) => {
    try{
        const userRecord = await User.findById(req.user.id).select('locationTrackingConsent').lean();
        if (userRecord && userRecord.locationTrackingConsent === false) {
            return res.status(403).json({
                success: false,
                code: "CONSENT_WITHDRAWN",
                message: "Location tracking is disabled by user privacy preferences",
            });
        }

        const { latitude, longitude, altitude, speed = 0, accuracy, timestamp, recordedAt: requestRecordedAt } = req.body;
        const receivedTimestamp = timestamp ?? requestRecordedAt;
        const recordedAt = receivedTimestamp === undefined ? new Date() : new Date(receivedTimestamp);

        if (
            !isFiniteNumber(latitude) ||
            !isFiniteNumber(longitude) ||
            !isFiniteNumber(altitude) ||
            !isFiniteNumber(speed) ||
            !isFiniteNumber(accuracy)
        ) {
            return res.status(400).json({
                success: false,
                message: "Latitude, longitude, altitude, speed, and accuracy must be finite numbers",
            });
        }

        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            return res.status(400).json({ success: false, message: "Latitude or longitude is out of range" });
        }

        if (altitude < -11000 || altitude > 100000 || speed < 0 || speed > 100) {
            return res.status(400).json({ success: false, message: "Altitude or speed is out of range" });
        }

        if (accuracy < 0 || accuracy > MAX_ACCURACY_METRES) {
            return res.status(422).json({
                success: false,
                code: "UNRELIABLE_GPS",
                message: `GPS accuracy must be between 0 and ${MAX_ACCURACY_METRES} metres`,
            });
        }

        if (Number.isNaN(recordedAt.getTime())) {
            return res.status(400).json({ success: false, message: "Timestamp is invalid" });
        }

        const now = Date.now();
        if (recordedAt.getTime() > now + MAX_FUTURE_TIME_MS || recordedAt.getTime() < now - MAX_LOCATION_AGE_MS) {
            return res.status(400).json({ success: false, message: "Timestamp is outside the accepted time range" });
        }

        const previousLocation = await Location.findOne({ user: req.user.id })
            .sort({ recordedAt: -1 })
            .select('latitude longitude recordedAt');

        if (previousLocation) {
            const elapsedMs = recordedAt.getTime() - previousLocation.recordedAt.getTime();
            if (elapsedMs < 0) {
                return res.status(409).json({
                    success: false,
                    code: "STALE_LOCATION",
                    message: "Location timestamp is older than the latest recorded location",
                });
            }

            const distance = distanceInMetres(previousLocation, { latitude, longitude });
            if (distance <= DUPLICATE_DISTANCE_METRES && elapsedMs <= DUPLICATE_TIME_MS) {
                return res.status(409).json({
                    success: false,
                    code: "DUPLICATE_LOCATION",
                    message: "A matching location was recently recorded",
                });
            }

            const impliedSpeed = elapsedMs === 0 ? Infinity : distance / (elapsedMs / 1000);
            if (impliedSpeed > MAX_SPEED_METRES_PER_SECOND) {
                return res.status(422).json({
                    success: false,
                    code: "IMPLAUSIBLE_MOVEMENT",
                    message: "Location was rejected because it implies an impossible GPS jump",
                });
            }
        }

        const location = await Location.create({
            user: req.user.id,
            latitude,
            longitude,
            altitude,
            speed,
            accuracy,
            recordedAt,
        });

        const livePayload = {
            latitude,
            longitude,
            speed,
            accuracy,
            recordedAt: recordedAt.toISOString(),
        };
        emitToUser(req.user.id, "location:updated", livePayload);

        // Broadcast to any active live-share viewers and keep lastLocation fresh.
        const activeShare = await LiveShareSession.findOneAndUpdate(
            { user: req.user.id, status: "active", expiresAt: { $gt: new Date() } },
            { $set: { lastLocation: livePayload } },
            { new: true }
        ).lean();
        if (activeShare) {
            emitToShareRoom(activeShare.shareToken, "live-share:location", livePayload);
        }

        res.status(201).json({
            success: true,
            message: "Location stored successfully",
            location,
        });
    } catch (error){
        res.status(500).json({
            success:false,
            message: error.message || "Server error",
        });
    }
};

// GET /api/location/history?startDate=...&endDate=...&limit=...&cursor=...
// Without date filters this returns the latest rolling 30 days of locations.
const getLocationHistory = async (req, res) => {
    try {
        const { startDate, endDate, cursor, limit: requestedLimit } = req.query;
        const end = endDate === undefined ? new Date() : parseDate(endDate);
        const start = startDate === undefined
            ? new Date(end?.getTime() - HISTORY_WINDOW_MS)
            : parseDate(startDate);
        const cursorDate = cursor === undefined ? null : parseDate(cursor);
        const limit = requestedLimit === undefined ? DEFAULT_HISTORY_LIMIT : Number(requestedLimit);

        if (!start || !end || (cursor !== undefined && !cursorDate)) {
            return res.status(400).json({
                success: false,
                message: "startDate, endDate, and cursor must be valid ISO-8601 dates or timestamps",
            });
        }
        if (start > end) {
            return res.status(400).json({ success: false, message: "startDate must be before endDate" });
        }
        if (!Number.isInteger(limit) || limit < 1 || limit > MAX_HISTORY_LIMIT) {
            return res.status(400).json({
                success: false,
                message: `limit must be an integer between 1 and ${MAX_HISTORY_LIMIT}`,
            });
        }

        const recordedAt = { $gte: start, $lte: end };
        if (cursorDate) recordedAt.$lt = cursorDate;

        // The { user: 1, recordedAt: -1 } index satisfies this filter and sort.
        const locations = await Location.find({ user: req.user.id, recordedAt })
            .select('latitude longitude altitude speed accuracy recordedAt createdAt')
            .sort({ recordedAt: -1 })
            .limit(limit + 1)
            .lean();

        const hasMore = locations.length > limit;
        if (hasMore) locations.pop();

        return res.status(200).json({
            success: true,
            count: locations.length,
            dateRange: { startDate: start, endDate: end },
            locations,
            pagination: {
                hasMore,
                nextCursor: hasMore ? locations[locations.length - 1].recordedAt.toISOString() : null,
            },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to retrieve location history",
        });
    }
};

module.exports = {
    updateLocation,
    getLocationHistory,
};

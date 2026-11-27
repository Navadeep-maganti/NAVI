const { getLocationRisk, learnBehaviorProfile, analyzeBehavior, assessAreaSafety } = require("../services/mlService");
const Location = require("../models/Location");
const BehaviorProfile = require("../models/BehaviorProfile");
const { findActiveAreaZones } = require("./areaRiskController");

const predictLocationRisk = async (req, res) => {
  const { latitude, longitude, accuracy, speed, timestamp } = req.body;

  try {
    const prediction = await getLocationRisk({
      latitude,
      longitude,
      accuracy,
      speed,
      timestamp,
    });

    return res.status(200).json({ success: true, prediction });
  } catch (error) {
    // Invalid inference input is a client error; connectivity/service faults are upstream errors.
    const status = error.status === 422 ? 400 : 502;
    return res.status(status).json({
      success: false,
      message: status === 400 ? "Invalid location-risk request" : "ML service is unavailable",
      error: error.message,
    });
  }
};

const learnMyBehaviorProfile = async (req, res) => {
  const days = req.query.days === undefined ? 30 : Number(req.query.days);
  if (!Number.isInteger(days) || days < 7 || days > 90) {
    return res.status(400).json({ success: false, message: "days must be an integer from 7 to 90" });
  }

  try {
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const history = await Location.find({ user: req.user.id, recordedAt: { $gte: from } })
      .select("latitude longitude speed accuracy recordedAt")
      .sort({ recordedAt: 1 })
      .limit(10000)
      .lean();
    const result = await learnBehaviorProfile(history.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
      speed: point.speed,
      accuracy: point.accuracy,
      timestamp: point.recordedAt.toISOString(),
    })));

    if (!result.isReady) {
      return res.status(200).json({ success: true, profileReady: false, ...result });
    }

    const profile = await BehaviorProfile.findOneAndUpdate(
      { user: req.user.id },
      { user: req.user.id, learnedAt: new Date(), ...result },
      { new: true, upsert: true, runValidators: true }
    );
    return res.status(200).json({ success: true, profileReady: true, profile });
  } catch (error) {
    return res.status(error.status === 422 ? 400 : 502).json({
      success: false,
      message: error.status === 422 ? "Invalid historical location data" : "Behavior learning service is unavailable",
      error: error.message,
    });
  }
};

const analyzeMyBehavior = async (req, res) => {
  const { latitude, longitude, speed, accuracy, timestamp } = req.body;
  const recordedAt = timestamp === undefined ? new Date() : new Date(timestamp);
  if (Number.isNaN(recordedAt.getTime())) {
    return res.status(400).json({ success: false, message: "timestamp is invalid" });
  }

  try {
    const profile = await BehaviorProfile.findOne({ user: req.user.id })
      .select("regularPlaces routineRoutes activityPatterns movementBaseline")
      .lean();
    if (!profile) {
      return res.status(409).json({
        success: false,
        message: "A behavioral profile is required before anomaly detection",
      });
    }

    const recentHistory = await Location.find({
      user: req.user.id,
      recordedAt: { $lt: recordedAt },
    })
      .select("latitude longitude speed accuracy recordedAt")
      .sort({ recordedAt: -1 })
      .limit(10)
      .lean();
    const toMlPoint = (point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
      speed: point.speed,
      accuracy: point.accuracy,
      timestamp: point.recordedAt.toISOString(),
    });
    const result = await analyzeBehavior({
      currentLocation: { latitude, longitude, speed, accuracy, timestamp: recordedAt.toISOString() },
      recentLocations: recentHistory.reverse().map(toMlPoint),
      profile,
    });
    return res.status(200).json({ success: true, analysis: result });
  } catch (error) {
    return res.status(error.status === 422 ? 400 : 502).json({
      success: false,
      message: error.status === 422 ? "Invalid behavior analysis request" : "Behavior analysis service is unavailable",
      error: error.message,
    });
  }
};

const assessMySafety = async (req, res) => {
  const { latitude, longitude, speed = 0, accuracy = 10, timestamp } = req.body;
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || typeof longitude !== "number" || !Number.isFinite(longitude)) {
    return res.status(400).json({ success: false, message: "latitude and longitude must be finite numbers" });
  }
  const recordedAt = timestamp === undefined ? new Date() : new Date(timestamp);
  if (Number.isNaN(recordedAt.getTime())) {
    return res.status(400).json({ success: false, message: "timestamp is invalid" });
  }

  try {
    const [areaZones, profile, recentHistory] = await Promise.all([
      findActiveAreaZones(latitude, longitude, 2000),
      BehaviorProfile.findOne({ user: req.user.id })
        .select("regularPlaces routineRoutes activityPatterns movementBaseline")
        .lean(),
      Location.find({ user: req.user.id, recordedAt: { $lt: recordedAt } })
        .select("latitude longitude speed accuracy recordedAt")
        .sort({ recordedAt: -1 })
        .limit(10)
        .lean(),
    ]);

    const toMlPoint = (point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
      speed: point.speed,
      accuracy: point.accuracy,
      timestamp: point.recordedAt.toISOString(),
    });

    const assessment = await assessAreaSafety({
      currentLocation: { latitude, longitude, speed, accuracy, timestamp: recordedAt.toISOString() },
      recentLocations: profile ? recentHistory.reverse().map(toMlPoint) : [],
      areaZones,
      profile: profile || null,
    });
    return res.status(200).json({ success: true, assessment });
  } catch (error) {
    return res.status(error.status === 422 ? 400 : 502).json({
      success: false,
      message: error.status === 422 ? "Invalid safety assessment request" : "Safety assessment service is unavailable",
      error: error.message,
    });
  }
};

module.exports = { predictLocationRisk, learnMyBehaviorProfile, analyzeMyBehavior, assessMySafety };

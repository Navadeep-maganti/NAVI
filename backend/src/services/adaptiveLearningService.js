const Location = require("../models/Location");
const BehaviorProfile = require("../models/BehaviorProfile");
const SafetyAlert = require("../models/SafetyAlert");
const { adaptBehaviorProfile } = require("./mlService");
const { formatLocalIso } = require("../utils/time");

const buildExcludedWindows = (alerts = []) =>
  alerts.map((alert) => {
    const startMs = new Date(alert.createdAt).getTime() - 15 * 60 * 1000;
    const endRef = alert.escalatedAt || alert.updatedAt || alert.createdAt;
    const endMs = new Date(endRef).getTime() + 30 * 60 * 1000;
    return {
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
    };
  });

const reclusterUserProfile = async (
  userId,
  { windowDays = 30, adaptationRate = 0.35 } = {}
) => {
  const from = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const [history, previousProfile, anomalyAlerts] = await Promise.all([
    Location.find({ user: userId, recordedAt: { $gte: from } })
      .select("latitude longitude speed accuracy recordedAt timezoneOffsetMinutes")
      .sort({ recordedAt: 1 })
      .limit(10000)
      .lean(),
    BehaviorProfile.findOne({ user: userId })
      .select("activityPatterns movementBaseline regularPlaces")
      .lean(),
    SafetyAlert.find({
      user: userId,
      createdAt: { $gte: from },
      $or: [{ status: "escalated" }, { userResponse: "need_help" }],
    })
      .select("createdAt escalatedAt updatedAt")
      .lean(),
  ]);

  if (history.length === 0) {
    return { profileReady: false, reason: "no_recent_locations" };
  }

  const result = await adaptBehaviorProfile({
    locations: history.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
      speed: point.speed,
      accuracy: point.accuracy,
      timestamp: formatLocalIso(point.recordedAt, point.timezoneOffsetMinutes || 0),
    })),
    previousProfile: previousProfile || null,
    excludedWindows: buildExcludedWindows(anomalyAlerts),
    windowDays,
    adaptationRate,
  });

  if (!result.isReady) {
    return { profileReady: false, ...result };
  }

  const profile = await BehaviorProfile.findOneAndUpdate(
    { user: userId },
    {
      user: userId,
      learnedAt: new Date(),
      profileVersion: "dbscan-adaptive-v1",
      ...result,
    },
    { new: true, upsert: true, runValidators: true }
  );

  return { profileReady: true, profile };
};

const runPeriodicReclustering = async ({ staleAfterHours = 24, batchLimit = 25 } = {}) => {
  const staleBefore = new Date(Date.now() - staleAfterHours * 60 * 60 * 1000);
  const staleProfiles = await BehaviorProfile.find({ learnedAt: { $lte: staleBefore } })
    .select("user")
    .limit(batchLimit)
    .lean();

  let updated = 0;
  for (const entry of staleProfiles) {
    try {
      const res = await reclusterUserProfile(entry.user);
      if (res.profileReady) updated += 1;
    } catch (error) {
      console.error(`Periodic re-clustering failed for user ${entry.user}:`, error.message);
    }
  }

  return { checked: staleProfiles.length, updated };
};

module.exports = {
  buildExcludedWindows,
  reclusterUserProfile,
  runPeriodicReclustering,
};


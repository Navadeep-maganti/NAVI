const SafetyAlert = require("../models/SafetyAlert");
const Preference = require("../models/Preference");
const { emitToUser, emitEmergencyStatus, notifyTrustedContacts, sendPushToUser } = require("./notificationService");

const DEFAULT_CHECKIN_TIMEOUT_SECONDS = 120;
const ESCALATED_COOLDOWN_MS = 30 * 60 * 1000;
const DEFAULT_SAFE_COOLDOWN_MINUTES = 45;
const DEFAULT_SAFE_PERIMETER_METRES = 300;
const RISK_SPIKE_OVERRIDE_DELTA = 0.25;
const HYSTERESIS_WINDOW_MS = 3 * 60 * 1000;
const EXTREME_RISK_IMMEDIATE_THRESHOLD = 0.85;
const EARTH_RADIUS_METRES = 6371000;

const elevatedStreakByUser = new Map();

const distanceMetres = (a, b) => {
  if (
    typeof a?.latitude !== "number" ||
    typeof a?.longitude !== "number" ||
    typeof b?.latitude !== "number" ||
    typeof b?.longitude !== "number"
  ) {
    return Infinity;
  }
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const isWithinSafeCooldown = ({ recentSafeAlert, currentLocation, decision, now = new Date() }) => {
  if (!recentSafeAlert || !recentSafeAlert.cooldownUntil) return false;
  if (now >= new Date(recentSafeAlert.cooldownUntil)) return false;

  const radius = recentSafeAlert.cooldownRadiusMetres || DEFAULT_SAFE_PERIMETER_METRES;
  const dist = distanceMetres(currentLocation, recentSafeAlert.location);
  if (dist > radius) return false;

  // Escape hatch: allow re-checking if risk spiked sharply since user tapped "I'm Safe".
  const prevScore = recentSafeAlert.decisionSnapshot?.contextualRiskScore;
  const currScore = decision?.contextualRiskScore;
  if (
    typeof prevScore === "number" &&
    typeof currScore === "number" &&
    currScore >= prevScore + RISK_SPIKE_OVERRIDE_DELTA
  ) {
    return false;
  }

  return true;
};

const shouldGenerateCheckin = (decision, hasRecentEscalation = false) =>
  !hasRecentEscalation &&
  (decision?.recommendedAction === "user_checkin" || decision?.recommendedAction === "confirm_sos");

const resolveCheckinTimeoutSeconds = (decision) =>
  decision?.recommendedAction === "confirm_sos" ? 60 : DEFAULT_CHECKIN_TIMEOUT_SECONDS;

const evaluateTimeoutEscalation = (alert, preferences, now = new Date()) => {
  if (!alert || alert.status !== "pending_checkin" || !alert.checkinDeadline) {
    return { shouldEscalate: false, shouldNotifyContacts: false };
  }
  if (now < new Date(alert.checkinDeadline)) {
    return { shouldEscalate: false, shouldNotifyContacts: false };
  }
  const autoAlert = preferences?.autoAlertTrustedContacts !== false;
  return {
    shouldEscalate: true,
    shouldNotifyContacts: autoAlert,
    reason: "checkin_timeout",
  };
};

const evaluateCheckinHysteresis = ({
  userId,
  decision,
  now = new Date(),
  tracker = elevatedStreakByUser,
}) => {
  const key = String(userId);
  if (!shouldGenerateCheckin(decision)) {
    tracker.delete(key);
    return { shouldTrigger: false, streak: 0 };
  }

  // Extreme critical risk bypasses 2-reading hysteresis so urgent danger is never delayed.
  if (
    decision?.contextualRiskLevel === "critical" &&
    (decision?.contextualRiskScore ?? 0) >= EXTREME_RISK_IMMEDIATE_THRESHOLD
  ) {
    tracker.delete(key);
    return { shouldTrigger: true, streak: 1, immediate: true };
  }

  const nowMs = now.getTime();
  const prev = tracker.get(key);
  if (prev && nowMs - prev.lastSeenAt <= HYSTERESIS_WINDOW_MS) {
    tracker.delete(key);
    return { shouldTrigger: true, streak: prev.count + 1 };
  }

  tracker.set(key, { count: 1, lastSeenAt: nowMs });
  return { shouldTrigger: false, streak: 1 };
};

const createCheckinFromDecision = async ({ userId, currentLocation, decision }) => {
  if (!shouldGenerateCheckin(decision)) {
    elevatedStreakByUser.delete(String(userId));
    return null;
  }

  const now = new Date();
  const existingActive = await SafetyAlert.findOne({
    user: userId,
    $or: [
      { status: "pending_checkin", checkinDeadline: { $gt: now } },
      { status: "escalated", escalatedAt: { $gte: new Date(now.getTime() - ESCALATED_COOLDOWN_MS) } },
    ],
  });
  if (existingActive) {
    // Do not open a duplicate check-in while one is pending or an emergency is already escalated.
    return existingActive.status === "pending_checkin" ? existingActive : null;
  }

  const recentSafeAlert = await SafetyAlert.findOne({
    user: userId,
    status: "resolved_safe",
    cooldownUntil: { $gt: now },
  })
    .sort({ respondedAt: -1 })
    .lean();

  if (isWithinSafeCooldown({ recentSafeAlert, currentLocation, decision, now })) {
    return null;
  }

  const hysteresis = evaluateCheckinHysteresis({ userId, decision, now });
  if (!hysteresis.shouldTrigger) {
    return null;
  }

  const timeoutSec = resolveCheckinTimeoutSeconds(decision);
  const alert = await SafetyAlert.create({
    user: userId,
    type: "checkin",
    status: "pending_checkin",
    triggerReason: decision.recommendedAction,
    location: {
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
      speed: currentLocation.speed,
      accuracy: currentLocation.accuracy,
      timestamp: currentLocation.timestamp ? new Date(currentLocation.timestamp) : now,
    },
    decisionSnapshot: {
      contextualRiskScore: decision.contextualRiskScore,
      contextualRiskLevel: decision.contextualRiskLevel,
      environmentalScore: decision.environmentalScore,
      adjustedBehavioralScore: decision.adjustedBehavioralScore,
    },
    checkinDeadline: new Date(now.getTime() + timeoutSec * 1000),
  });

  emitToUser(userId, "checkin:prompt", {
    alertId: String(alert._id),
    contextualRiskLevel: decision.contextualRiskLevel,
    recommendedAction: decision.recommendedAction,
    checkinDeadline: alert.checkinDeadline.toISOString(),
  });
  await sendPushToUser({
    userId,
    title: "NAVI Safety Check-In",
    body: "Unusual activity detected. Tap to confirm you are safe.",
    data: {
      type: "checkin_prompt",
      alertId: String(alert._id),
      riskLevel: decision.contextualRiskLevel,
    },
  });
  await emitEmergencyStatus(userId, {
    alertId: String(alert._id),
    type: alert.type,
    status: alert.status,
    triggerReason: alert.triggerReason,
    timestamp: now.toISOString(),
  });

  return alert;
};

const respondToAlert = async ({ userId, alertId, response, safeDurationMinutes }) => {
  const alert = await SafetyAlert.findOne({ _id: alertId, user: userId });
  if (!alert) return { notFound: true };

  if (alert.status !== "pending_checkin") {
    return { conflict: true, alert };
  }

  const now = new Date();
  alert.respondedAt = now;

  if (response === "safe" || response === "cancel") {
    const mins =
      safeDurationMinutes !== undefined && Number.isFinite(Number(safeDurationMinutes))
        ? Math.max(5, Math.min(720, Number(safeDurationMinutes)))
        : DEFAULT_SAFE_COOLDOWN_MINUTES;
    alert.status = response === "safe" ? "resolved_safe" : "cancelled";
    alert.userResponse = "safe";
    if (response === "safe") {
      alert.cooldownUntil = new Date(now.getTime() + mins * 60 * 1000);
      alert.cooldownRadiusMetres = DEFAULT_SAFE_PERIMETER_METRES;
    }
    await alert.save();
    await emitEmergencyStatus(userId, {
      alertId: String(alert._id),
      type: alert.type,
      status: alert.status,
      triggerReason: alert.triggerReason,
      timestamp: now.toISOString(),
    });
    return { alert };
  }

  // User responded "need_help" -> escalate immediately and notify trusted contacts.
  alert.status = "escalated";
  alert.type = "escalated_emergency";
  alert.userResponse = "need_help";
  alert.triggerReason = "user_requested_help";
  alert.escalatedAt = now;
  alert.notifiedContacts = await notifyTrustedContacts({ userId, alert });
  await alert.save();
  await emitEmergencyStatus(userId, {
    alertId: String(alert._id),
    type: alert.type,
    status: alert.status,
    triggerReason: alert.triggerReason,
    timestamp: now.toISOString(),
  });

  return { alert };
};

const triggerManualSOS = async ({ userId, location = {}, notes }) => {
  const now = new Date();
  const alert = await SafetyAlert.create({
    user: userId,
    type: "manual_sos",
    status: "escalated",
    triggerReason: "manual_sos",
    location: {
      latitude: location.latitude,
      longitude: location.longitude,
      speed: location.speed,
      accuracy: location.accuracy,
      timestamp: location.timestamp ? new Date(location.timestamp) : now,
    },
    notes,
    escalatedAt: now,
  });

  alert.notifiedContacts = await notifyTrustedContacts({ userId, alert });
  await alert.save();
  await emitEmergencyStatus(userId, {
    alertId: String(alert._id),
    type: alert.type,
    status: alert.status,
    triggerReason: alert.triggerReason,
    location: alert.location,
    timestamp: now.toISOString(),
  });
  return alert;
};

const processExpiredCheckins = async (now = new Date()) => {
  const overdueAlerts = await SafetyAlert.find({
    status: "pending_checkin",
    checkinDeadline: { $lte: now },
  }).limit(100);

  let escalatedCount = 0;
  for (const alert of overdueAlerts) {
    const prefs = await Preference.findOne({ user: alert.user }).lean();
    const evaluation = evaluateTimeoutEscalation(alert, prefs, now);
    if (!evaluation.shouldEscalate) continue;

    alert.status = "escalated";
    alert.type = "escalated_emergency";
    alert.userResponse = "no_response";
    alert.triggerReason = evaluation.reason;
    alert.escalatedAt = now;
    if (evaluation.shouldNotifyContacts) {
      alert.notifiedContacts = await notifyTrustedContacts({ userId: alert.user, alert });
    }
    await alert.save();
    await emitEmergencyStatus(alert.user, {
      alertId: String(alert._id),
      type: alert.type,
      status: alert.status,
      triggerReason: alert.triggerReason,
      timestamp: now.toISOString(),
    });
    escalatedCount += 1;
  }

  return { checked: overdueAlerts.length, escalatedCount };
};

const resolveEscalatedAlert = async ({ userId, alertId }) => {
  const alert = await SafetyAlert.findOne({ _id: alertId, user: userId });
  if (!alert) return { notFound: true };
  if (alert.status !== "escalated") return { conflict: true, alert };

  const now = new Date();
  alert.status = "resolved_safe";
  alert.userResponse = "safe";
  alert.respondedAt = now;
  await alert.save();

  await emitEmergencyStatus(userId, {
    alertId: String(alert._id),
    type: alert.type,
    status: alert.status,
    triggerReason: "user_resolved_safe",
    timestamp: now.toISOString(),
  });
  return { alert };
};

module.exports = {
  shouldGenerateCheckin,
  resolveCheckinTimeoutSeconds,
  evaluateTimeoutEscalation,
  isWithinSafeCooldown,
  evaluateCheckinHysteresis,
  createCheckinFromDecision,
  respondToAlert,
  resolveEscalatedAlert,
  triggerManualSOS,
  processExpiredCheckins,
};


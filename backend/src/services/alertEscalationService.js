const SafetyAlert = require("../models/SafetyAlert");
const Preference = require("../models/Preference");
const { emitToUser, emitEmergencyStatus, notifyTrustedContacts } = require("./notificationService");

const DEFAULT_CHECKIN_TIMEOUT_SECONDS = 120;

const shouldGenerateCheckin = (decision) =>
  decision?.recommendedAction === "user_checkin" || decision?.recommendedAction === "confirm_sos";

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

const createCheckinFromDecision = async ({ userId, currentLocation, decision }) => {
  if (!shouldGenerateCheckin(decision)) return null;

  const now = new Date();
  const existingPending = await SafetyAlert.findOne({
    user: userId,
    status: "pending_checkin",
    checkinDeadline: { $gt: now },
  });
  if (existingPending) {
    return existingPending;
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
  await emitEmergencyStatus(userId, {
    alertId: String(alert._id),
    type: alert.type,
    status: alert.status,
    triggerReason: alert.triggerReason,
    timestamp: now.toISOString(),
  });

  return alert;
};

const respondToAlert = async ({ userId, alertId, response }) => {
  const alert = await SafetyAlert.findOne({ _id: alertId, user: userId });
  if (!alert) return { notFound: true };

  if (alert.status !== "pending_checkin") {
    return { conflict: true, alert };
  }

  const now = new Date();
  alert.respondedAt = now;

  if (response === "safe" || response === "cancel") {
    alert.status = response === "safe" ? "resolved_safe" : "cancelled";
    alert.userResponse = "safe";
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

module.exports = {
  shouldGenerateCheckin,
  resolveCheckinTimeoutSeconds,
  evaluateTimeoutEscalation,
  createCheckinFromDecision,
  respondToAlert,
  triggerManualSOS,
  processExpiredCheckins,
};


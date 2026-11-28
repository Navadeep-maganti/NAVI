/**
 * Context-aware safety decision engine.
 * Combines environmental area risk and personal behavioral anomaly with
 * user preferences and declared safe sessions to avoid false emergency alerts.
 */

const EARTH_RADIUS_METRES = 6371000;

const clamp01 = (value) => Number(Math.max(0, Math.min(1, value)).toFixed(3));

const distanceMetres = (a, b) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const SIGNAL_WEIGHTS = {
  unusualLocation: 0.35,
  unusualTravelTime: 0.2,
  unusualRoute: 0.25,
  abnormalMovement: 0.2,
};

const adjustBehavioralScore = (
  behavioralRisk,
  currentLocation,
  preferences,
  activeSession,
  { isDaytime = false, travelRoaming = false } = {}
) => {
  if (!behavioralRisk) return { adjustedScore: null, suppressedSignals: [] };

  const suppressedSignals = [];
  const signals = behavioralRisk.signals || [];
  const abnormalMovementScore =
    signals.find((s) => s.type === "abnormalMovement")?.score ?? 0;
  let weightedSum = 0;
  let totalWeight = 0;

  for (const signal of signals) {
    const weight = SIGNAL_WEIGHTS[signal.type] ?? 0.2;
    let score = signal.score ?? 0;

    if (
      (signal.type === "unusualLocation" || signal.type === "unusualRoute") &&
      travelRoaming
    ) {
      score = 0;
      suppressedSignals.push("travelModeRoaming");
    } else if (
      signal.type === "unusualLocation" &&
      (!preferences.enableUnknownAreaAlerts || activeSession?.suppressLocationAlerts)
    ) {
      score = 0;
      suppressedSignals.push("unusualLocation");
    } else if (signal.type === "unusualLocation" && isDaytime && abnormalMovementScore < 0.3) {
      // Daytime errands in new places with normal speed are far less likely to be emergencies.
      score *= 0.75;
      suppressedSignals.push("daytimeLocationDampened");
    }
    if (signal.type === "unusualTravelTime" && activeSession?.suppressTimeAlerts) {
      score = 0;
      suppressedSignals.push("unusualTravelTime");
    }
    if (
      signal.type === "abnormalMovement" &&
      activeSession?.expectedMaxSpeedMps != null &&
      currentLocation.speed <= activeSession.expectedMaxSpeedMps
    ) {
      score = 0;
      suppressedSignals.push("abnormalMovement");
    }

    weightedSum += score * weight;
    totalWeight += weight;
  }

  let adjusted = totalWeight > 0 ? weightedSum / totalWeight : behavioralRisk.deviationScore || 0;

  // If the user is within their declared session anchor radius, dampen residual anomaly.
  if (
    activeSession?.anchorLocation?.latitude != null &&
    activeSession?.anchorLocation?.longitude != null
  ) {
    const dist = distanceMetres(currentLocation, activeSession.anchorLocation);
    const radius = activeSession.anchorLocation.radiusMetres || 1000;
    if (dist <= radius) {
      adjusted *= 0.6;
      suppressedSignals.push("withinDeclaredSessionAnchor");
    }
  }

  // Scale by user's deviationSensitivity (default 0.7; 1.0 = full weight, 0.3 = tolerant).
  const sensitivity = Math.max(0.1, Math.min(1.0, preferences.deviationSensitivity ?? 0.7));
  adjusted = clamp01(adjusted * (0.5 + 0.5 * sensitivity));

  return { adjustedScore: adjusted, suppressedSignals };
};

const evaluateSafetyDecision = ({
  assessment,
  currentLocation,
  preferences = {},
  activeSession = null,
  travelMode = null,
}) => {
  const prefs = {
    lateNightThreshold: preferences?.lateNightThreshold ?? 23,
    enableUnknownAreaAlerts: preferences?.enableUnknownAreaAlerts ?? true,
    deviationSensitivity: preferences?.deviationSensitivity ?? 0.7,
    autoAlertTrustedContacts: preferences?.autoAlertTrustedContacts ?? true,
  };

  let envScore = assessment?.environmentalRisk?.score ?? 0;
  const hour = assessment?.environmentalRisk?.timeContext?.hour ?? new Date(currentLocation.timestamp).getUTCHours();
  const matchedZones = assessment?.environmentalRisk?.matchedZones || [];
  const contextAdjustments = [];

  // Respect user's personal lateNightThreshold when no physical hazard zones are matched.
  if (matchedZones.length === 0 && hour >= 22 && hour < prefs.lateNightThreshold) {
    envScore = clamp01(Math.max(0, envScore - 0.1));
    contextAdjustments.push("before_user_late_night_threshold");
  }
  if (activeSession?.suppressTimeAlerts && matchedZones.length === 0) {
    envScore = clamp01(Math.max(0, envScore - 0.1));
    contextAdjustments.push("session_suppresses_time_alerts");
  }

  const isDaytime = hour >= 6 && hour < prefs.lateNightThreshold;
  const travelRoaming = Boolean(travelMode?.active && travelMode?.mode === "roaming");
  const { adjustedScore: behScore, suppressedSignals } = adjustBehavioralScore(
    assessment?.behavioralRisk,
    currentLocation,
    prefs,
    activeSession,
    { isDaytime, travelRoaming }
  );

  // Fuse environmental risk + adjusted behavioral score.
  let contextualScore =
    behScore === null ? envScore : clamp01(0.55 * envScore + 0.45 * behScore);

  // If both environment and behavior agree on elevated risk, apply a small corroboration boost.
  const corroborated = behScore !== null && envScore >= 0.4 && behScore >= 0.4;
  if (corroborated) {
    contextualScore = clamp01(contextualScore + 0.08);
    contextAdjustments.push("corroborated_env_and_behavior");
  }

  let contextualRiskLevel = "low";
  if (contextualScore >= 0.78) contextualRiskLevel = "critical";
  else if (contextualScore >= 0.55) contextualRiskLevel = "elevated";
  else if (contextualScore >= 0.3) contextualRiskLevel = "moderate";

  // Avoid unnecessary emergency alerts: require corroboration or extreme risk before SOS confirmation.
  let recommendedAction = "none";
  if (contextualRiskLevel === "moderate") {
    recommendedAction = "log_only";
  } else if (contextualRiskLevel === "elevated") {
    recommendedAction = "user_checkin";
  } else if (contextualRiskLevel === "critical") {
    const strongEnough =
      corroborated || envScore >= 0.75 || (behScore !== null && behScore >= 0.8);
    recommendedAction =
      strongEnough && prefs.autoAlertTrustedContacts ? "confirm_sos" : "user_checkin";
  }

  return {
    contextualRiskScore: contextualScore,
    contextualRiskLevel,
    recommendedAction,
    shouldTriggerEmergencyAlert: recommendedAction === "confirm_sos",
    environmentalScore: envScore,
    adjustedBehavioralScore: behScore,
    activeSession: activeSession
      ? { id: String(activeSession._id || activeSession.id || ""), activityType: activeSession.activityType }
      : null,
    appliedPreferences: prefs,
    suppressedSignals,
    contextAdjustments,
  };
};

module.exports = { evaluateSafetyDecision, adjustBehavioralScore };


const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateSafetyDecision } = require("../src/services/safetyDecisionEngine");

const baseLocation = {
  latitude: 40.0015,
  longitude: 116.3248,
  speed: 4.5,
  accuracy: 10,
  timestamp: "2026-11-28T23:30:00Z",
};

const sampleAssessment = {
  environmentalRisk: {
    score: 0.6,
    timeContext: { hour: 23, isNight: true, isWeekend: false },
    matchedZones: [{ id: "z1", name: "Dark alley", effectiveRisk: 0.6 }],
  },
  behavioralRisk: {
    deviationScore: 0.72,
    signals: [
      { type: "unusualLocation", score: 0.8 },
      { type: "unusualTravelTime", score: 0.7 },
      { type: "abnormalMovement", score: 0.6 },
    ],
  },
};

test("combines area risk and anomaly to recommend confirm_sos when corroborated", () => {
  const result = evaluateSafetyDecision({
    assessment: sampleAssessment,
    currentLocation: baseLocation,
    preferences: { deviationSensitivity: 1.0, autoAlertTrustedContacts: true },
  });

  assert.equal(result.contextualRiskLevel, "elevated");
  assert.equal(result.recommendedAction, "user_checkin");
  assert.equal(result.shouldTriggerEmergencyAlert, false);

  // Higher env + behavioral score triggers critical + confirm_sos
  const highAssessment = {
    environmentalRisk: { ...sampleAssessment.environmentalRisk, score: 0.8 },
    behavioralRisk: {
      deviationScore: 0.85,
      signals: [
        { type: "unusualLocation", score: 0.9 },
        { type: "unusualTravelTime", score: 0.8 },
        { type: "abnormalMovement", score: 0.85 },
      ],
    },
  };
  const critical = evaluateSafetyDecision({
    assessment: highAssessment,
    currentLocation: baseLocation,
    preferences: { deviationSensitivity: 1.0, autoAlertTrustedContacts: true },
  });
  assert.equal(critical.contextualRiskLevel, "critical");
  assert.equal(critical.recommendedAction, "confirm_sos");
  assert.equal(critical.shouldTriggerEmergencyAlert, true);
});

test("active safe session (jogging / night_shift) suppresses expected signals to avoid false alerts", () => {
  const result = evaluateSafetyDecision({
    assessment: sampleAssessment,
    currentLocation: baseLocation,
    preferences: { deviationSensitivity: 0.7 },
    activeSession: {
      id: "sess1",
      activityType: "night_shift",
      expectedMaxSpeedMps: 6,
      suppressTimeAlerts: true,
      suppressLocationAlerts: true,
    },
  });

  assert.equal(result.adjustedBehavioralScore, 0);
  assert.deepEqual(result.suppressedSignals.sort(), [
    "abnormalMovement",
    "unusualLocation",
    "unusualTravelTime",
  ]);
  assert.equal(result.shouldTriggerEmergencyAlert, false);
  assert.equal(result.recommendedAction, "log_only");
});

test("autoAlertTrustedContacts=false prevents emergency SOS recommendation even at critical risk", () => {
  const highAssessment = {
    environmentalRisk: { ...sampleAssessment.environmentalRisk, score: 0.85 },
    behavioralRisk: {
      deviationScore: 0.9,
      signals: [{ type: "unusualLocation", score: 0.95 }],
    },
  };
  const result = evaluateSafetyDecision({
    assessment: highAssessment,
    currentLocation: baseLocation,
    preferences: { deviationSensitivity: 1.0, autoAlertTrustedContacts: false },
  });

  assert.equal(result.contextualRiskLevel, "critical");
  assert.equal(result.recommendedAction, "user_checkin");
  assert.equal(result.shouldTriggerEmergencyAlert, false);
});

test("daytime unfamiliar location with normal movement is dampened compared to late night", () => {
  const daytimeAssessment = {
    environmentalRisk: { score: 0.45, timeContext: { hour: 14, isNight: false }, matchedZones: [{ id: "z1" }] },
    behavioralRisk: {
      deviationScore: 0.5,
      signals: [
        { type: "unusualLocation", score: 1.0 },
        { type: "unusualTravelTime", score: 0.1 },
        { type: "abnormalMovement", score: 0.0 },
      ],
    },
  };
  const nightAssessment = {
    ...daytimeAssessment,
    environmentalRisk: { score: 0.45, timeContext: { hour: 23, isNight: true }, matchedZones: [{ id: "z1" }] },
  };

  const dayRes = evaluateSafetyDecision({
    assessment: daytimeAssessment,
    currentLocation: { ...baseLocation, timestamp: "2026-11-28T14:00:00+05:30" },
  });
  const nightRes = evaluateSafetyDecision({
    assessment: nightAssessment,
    currentLocation: { ...baseLocation, timestamp: "2026-11-28T23:30:00+05:30" },
  });

  assert.ok(dayRes.suppressedSignals.includes("daytimeLocationDampened"));
  assert.ok(dayRes.adjustedBehavioralScore < nightRes.adjustedBehavioralScore);
  assert.ok(dayRes.contextualRiskScore < nightRes.contextualRiskScore);
});


const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateTravelState } = require("../src/services/travelModeService");
const { evaluateSafetyDecision } = require("../src/services/safetyDecisionEngine");

const homeProfile = {
  regularPlaces: [{ clusterId: 0, latitude: 16.8333, longitude: 81.5277 }],
};

test("evaluateTravelState prompts when user is >25 km away and auto-returns when back within 5 km", () => {
  const now = new Date("2026-11-28T18:00:00.000Z");

  // ~35 km away -> prompt_travel
  const far = evaluateTravelState({
    currentLocation: { latitude: 17.15, longitude: 81.5277 },
    homeProfile,
    travelMode: { active: false },
    now,
  });
  assert.equal(far.action, "prompt_travel");
  assert.ok(far.distanceKm > 25);

  // Already prompted recently -> none
  const recentlyPrompted = evaluateTravelState({
    currentLocation: { latitude: 17.15, longitude: 81.5277 },
    homeProfile,
    travelMode: { active: false, lastPromptedAt: new Date(now.getTime() - 60_000) },
    now,
  });
  assert.equal(recentlyPrompted.action, "none");

  // Returned within 5 km while travelMode active -> auto_return_home
  const returned = evaluateTravelState({
    currentLocation: { latitude: 16.84, longitude: 81.53 },
    homeProfile,
    travelMode: { active: true, mode: "roaming" },
    now,
  });
  assert.equal(returned.action, "auto_return_home");
});

test("travelMode roaming suppresses home location/route novelty while keeping area risk active", () => {
  const assessment = {
    environmentalRisk: { score: 0.75, timeContext: { hour: 23, isNight: true }, matchedZones: [{ id: "z1" }] },
    behavioralRisk: {
      deviationScore: 0.8,
      signals: [
        { type: "unusualLocation", score: 1.0 },
        { type: "unusualRoute", score: 1.0 },
        { type: "abnormalMovement", score: 0.0 },
      ],
    },
  };

  const res = evaluateSafetyDecision({
    assessment,
    currentLocation: { latitude: 17.385, longitude: 78.4867, speed: 1.2, timestamp: "2026-11-28T23:00:00+05:30" },
    travelMode: { active: true, mode: "roaming" },
  });

  assert.ok(res.suppressedSignals.includes("travelModeRoaming"));
  assert.equal(res.adjustedBehavioralScore, 0);
  // Area risk still contributes to score (0.55 * 0.75 = 0.413 -> moderate)
  assert.equal(res.contextualRiskLevel, "moderate");
});

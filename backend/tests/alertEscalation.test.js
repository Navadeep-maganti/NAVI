const test = require("node:test");
const assert = require("node:assert/strict");
const {
  shouldGenerateCheckin,
  resolveCheckinTimeoutSeconds,
  evaluateTimeoutEscalation,
  isWithinSafeCooldown,
  evaluateCheckinHysteresis,
} = require("../src/services/alertEscalationService");
const { buildEmergencyEmail } = require("../src/services/notificationService");

test("shouldGenerateCheckin only triggers on user_checkin or confirm_sos unless recently escalated", () => {
  assert.equal(shouldGenerateCheckin({ recommendedAction: "none" }), false);
  assert.equal(shouldGenerateCheckin({ recommendedAction: "log_only" }), false);
  assert.equal(shouldGenerateCheckin({ recommendedAction: "user_checkin" }), true);
  assert.equal(shouldGenerateCheckin({ recommendedAction: "confirm_sos" }), true);
  assert.equal(shouldGenerateCheckin({ recommendedAction: "confirm_sos" }, true), false);
});

test("confirm_sos uses shorter checkin timeout than user_checkin", () => {
  assert.equal(resolveCheckinTimeoutSeconds({ recommendedAction: "confirm_sos" }), 60);
  assert.equal(resolveCheckinTimeoutSeconds({ recommendedAction: "user_checkin" }), 120);
});

test("evaluateTimeoutEscalation escalates overdue pending checkins and respects autoAlertTrustedContacts", () => {
  const pastDeadline = new Date(Date.now() - 10_000);
  const futureDeadline = new Date(Date.now() + 60_000);

  const notDue = evaluateTimeoutEscalation(
    { status: "pending_checkin", checkinDeadline: futureDeadline },
    { autoAlertTrustedContacts: true }
  );
  assert.equal(notDue.shouldEscalate, false);

  const overdueAutoAlert = evaluateTimeoutEscalation(
    { status: "pending_checkin", checkinDeadline: pastDeadline },
    { autoAlertTrustedContacts: true }
  );
  assert.equal(overdueAutoAlert.shouldEscalate, true);
  assert.equal(overdueAutoAlert.shouldNotifyContacts, true);
  assert.equal(overdueAutoAlert.reason, "checkin_timeout");

  const overdueNoAutoAlert = evaluateTimeoutEscalation(
    { status: "pending_checkin", checkinDeadline: pastDeadline },
    { autoAlertTrustedContacts: false }
  );
  assert.equal(overdueNoAutoAlert.shouldEscalate, true);
  assert.equal(overdueNoAutoAlert.shouldNotifyContacts, false);
});

test("buildEmergencyEmail includes user name, maps pin, and live tracking URL", () => {
  const email = buildEmergencyEmail({
    userName: "Aarav",
    triggerReason: "manual_sos",
    mapsUrl: "https://maps.google.com/?q=12.9716,77.5946",
    liveShareUrl: "http://localhost:5000/api/live-share/view/abc123",
    notes: "Walking home late",
  });

  assert.match(email.subject, /NAVI Emergency Alert.*Aarav/);
  assert.match(email.text, /manual_sos/);
  assert.match(email.text, /maps\.google\.com\/\?q=12\.9716,77\.5946/);
  assert.match(email.html, /\/api\/live-share\/view\/abc123/);
});

test("isWithinSafeCooldown suppresses repeat checkins inside 300m until expired, left, or risk spikes", () => {
  const now = new Date("2026-11-28T18:00:00.000Z");
  const safeAlert = {
    location: { latitude: 16.83334, longitude: 81.52774 },
    cooldownUntil: new Date("2026-11-28T18:45:00.000Z"),
    cooldownRadiusMetres: 300,
    decisionSnapshot: { contextualRiskScore: 0.6 },
  };

  // Same spot, similar risk -> suppressed
  assert.equal(
    isWithinSafeCooldown({
      recentSafeAlert: safeAlert,
      currentLocation: { latitude: 16.8335, longitude: 81.5278 },
      decision: { contextualRiskScore: 0.62 },
      now,
    }),
    true
  );

  // Moved >300m away -> not suppressed
  assert.equal(
    isWithinSafeCooldown({
      recentSafeAlert: safeAlert,
      currentLocation: { latitude: 16.838, longitude: 81.5278 },
      decision: { contextualRiskScore: 0.62 },
      now,
    }),
    false
  );

  // Risk spiked by +0.25 -> not suppressed
  assert.equal(
    isWithinSafeCooldown({
      recentSafeAlert: safeAlert,
      currentLocation: { latitude: 16.8335, longitude: 81.5278 },
      decision: { contextualRiskScore: 0.88 },
      now,
    }),
    false
  );
});

test("evaluateCheckinHysteresis requires 2 consecutive elevated readings unless critical >= 0.85", () => {
  const tracker = new Map();
  const t0 = new Date("2026-11-28T18:00:00.000Z");
  const t1 = new Date("2026-11-28T18:00:20.000Z");
  const elevated = { recommendedAction: "user_checkin", contextualRiskLevel: "elevated", contextualRiskScore: 0.62 };
  const low = { recommendedAction: "none", contextualRiskLevel: "low", contextualRiskScore: 0.15 };
  const extreme = { recommendedAction: "confirm_sos", contextualRiskLevel: "critical", contextualRiskScore: 0.88 };

  // 1st elevated reading -> suppressed (streak = 1)
  assert.deepEqual(
    evaluateCheckinHysteresis({ userId: "u1", decision: elevated, now: t0, tracker }),
    { shouldTrigger: false, streak: 1 }
  );
  // 2nd consecutive elevated reading within 3m -> triggers
  assert.deepEqual(
    evaluateCheckinHysteresis({ userId: "u1", decision: elevated, now: t1, tracker }),
    { shouldTrigger: true, streak: 2 }
  );

  // Low reading resets streak
  evaluateCheckinHysteresis({ userId: "u1", decision: elevated, now: t0, tracker });
  assert.deepEqual(
    evaluateCheckinHysteresis({ userId: "u1", decision: low, now: t1, tracker }),
    { shouldTrigger: false, streak: 0 }
  );

  // Extreme critical >= 0.85 triggers immediately
  assert.deepEqual(
    evaluateCheckinHysteresis({ userId: "u1", decision: extreme, now: t0, tracker }),
    { shouldTrigger: true, streak: 1, immediate: true }
  );
});


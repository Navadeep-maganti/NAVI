const test = require("node:test");
const assert = require("node:assert/strict");
const {
  shouldGenerateCheckin,
  resolveCheckinTimeoutSeconds,
  evaluateTimeoutEscalation,
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


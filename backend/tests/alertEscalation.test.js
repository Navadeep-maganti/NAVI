const test = require("node:test");
const assert = require("node:assert/strict");
const {
  shouldGenerateCheckin,
  resolveCheckinTimeoutSeconds,
  evaluateTimeoutEscalation,
} = require("../src/services/alertEscalationService");

test("shouldGenerateCheckin only triggers on user_checkin or confirm_sos", () => {
  assert.equal(shouldGenerateCheckin({ recommendedAction: "none" }), false);
  assert.equal(shouldGenerateCheckin({ recommendedAction: "log_only" }), false);
  assert.equal(shouldGenerateCheckin({ recommendedAction: "user_checkin" }), true);
  assert.equal(shouldGenerateCheckin({ recommendedAction: "confirm_sos" }), true);
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


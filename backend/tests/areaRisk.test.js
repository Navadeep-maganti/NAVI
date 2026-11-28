const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveCrowdExpiry } = require("../src/controllers/areaRiskController");

test("resolveCrowdExpiry defaults to +30 days when expiresAt is omitted or null", () => {
  const now = new Date("2026-11-28T00:00:00.000Z");
  const expiry = resolveCrowdExpiry(undefined, now);
  assert.equal(expiry.toISOString(), "2026-12-28T00:00:00.000Z");

  const custom = resolveCrowdExpiry("2026-12-05T12:00:00.000Z", now);
  assert.equal(custom.toISOString(), "2026-12-05T12:00:00.000Z");
});

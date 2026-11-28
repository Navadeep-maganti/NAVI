const test = require("node:test");
const assert = require("node:assert/strict");
const { parseOffsetMinutesFromIso, formatLocalIso } = require("../src/utils/time");

test("parseOffsetMinutesFromIso parses positive, negative, and Z offsets", () => {
  assert.equal(parseOffsetMinutesFromIso("2026-11-28T23:15:00+05:30"), 330);
  assert.equal(parseOffsetMinutesFromIso("2026-11-28T12:00:00-05:00"), -300);
  assert.equal(parseOffsetMinutesFromIso("2026-11-28T17:45:00Z"), 0);
  assert.equal(parseOffsetMinutesFromIso(undefined), null);
});

test("formatLocalIso preserves local hour for ML service instead of converting to UTC Z", () => {
  const utcDate = new Date("2026-11-28T17:45:00.000Z");
  assert.equal(formatLocalIso(utcDate, 330), "2026-11-28T23:15:00+05:30");
  assert.equal(formatLocalIso(utcDate, -300), "2026-11-28T12:45:00-05:00");
  assert.equal(formatLocalIso(utcDate, 0), "2026-11-28T17:45:00.000Z");
});

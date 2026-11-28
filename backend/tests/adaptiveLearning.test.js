const test = require("node:test");
const assert = require("node:assert/strict");
const { buildExcludedWindows } = require("../src/services/adaptiveLearningService");

test("buildExcludedWindows pads alert timestamps by -15m and +30m to exclude anomalous episodes", () => {
  const createdAt = new Date("2026-11-28T10:00:00.000Z");
  const escalatedAt = new Date("2026-11-28T10:05:00.000Z");
  const windows = buildExcludedWindows([{ createdAt, escalatedAt }]);

  assert.equal(windows.length, 1);
  assert.equal(windows[0].start, "2026-11-28T09:45:00.000Z");
  assert.equal(windows[0].end, "2026-11-28T10:35:00.000Z");
});

test("buildExcludedWindows includes completed TravelMode trip windows to keep home profile clean", () => {
  const windows = buildExcludedWindows([], [
    { start: new Date("2026-11-20T08:00:00.000Z"), end: new Date("2026-11-25T20:00:00.000Z") },
  ]);

  assert.equal(windows.length, 1);
  assert.equal(windows[0].start, "2026-11-20T08:00:00.000Z");
  assert.equal(windows[0].end, "2026-11-25T20:00:00.000Z");
});


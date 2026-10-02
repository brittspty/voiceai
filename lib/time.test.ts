import assert from "node:assert/strict";
import test from "node:test";
import { startOfWeekMonday, withinWindow, zonedParts, zonedTimeToUtc } from "./time";

test("converts an Eastern wall time to UTC during daylight saving", () => {
  const instant = zonedTimeToUtc("2026-09-30T00:24:00", "America/New_York");
  assert.equal(instant.toISOString(), "2026-09-30T04:24:00.000Z");
});

test("week containing Friday Oct 2 2026 starts Monday Sep 28", () => {
  const friday = zonedTimeToUtc("2026-10-02T12:00:00", "America/New_York");
  assert.equal(startOfWeekMonday(friday, "America/New_York"), "2026-09-28");
  assert.equal(zonedParts(friday, "America/New_York").weekday, 5);
});

test("supports a window that crosses midnight", () => {
  const parts = zonedParts(zonedTimeToUtc("2026-10-02T23:30:00", "America/New_York"), "America/New_York");
  assert.equal(withinWindow(parts, "20:00", "02:00", [5]), true);
  assert.equal(withinWindow(parts, "09:00", "20:00", [5]), false);
});

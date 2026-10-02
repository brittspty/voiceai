import assert from "node:assert/strict";
import test from "node:test";
import { evaluateGates } from "./gates";
import { DEFAULT_POLICY, type CallingPolicy } from "./types";
import { zonedTimeToUtc } from "./time";

const policy: CallingPolicy = { ...DEFAULT_POLICY, dailyCap: 3, maxAttempts: 2 };

function at(wall: string) {
  return zonedTimeToUtc(wall, "America/New_York");
}

test("blocks a call with no consent", () => {
  const result = evaluateGates({
    now: at("2026-10-02T10:30:00"),
    timeZone: "America/New_York",
    consent: "none",
    onDoNotCall: false,
    dialsToday: 0,
    attemptsForContact: 0,
    policy,
  });
  assert.equal(result.passed, false);
  assert.equal(result.checks.find((c) => c.id === "consent")?.passed, false);
});

test("blocks a number on the do-not-call list", () => {
  const result = evaluateGates({
    now: at("2026-10-02T10:30:00"),
    timeZone: "America/New_York",
    consent: "high",
    onDoNotCall: true,
    dialsToday: 0,
    attemptsForContact: 0,
    policy,
  });
  assert.equal(result.passed, false);
  assert.match(result.checks.find((c) => c.id === "dnc")?.detail || "", /do-not-call/i);
});

test("blocks outside the lead's local calling window", () => {
  const early = evaluateGates({
    now: at("2026-10-02T08:15:00"),
    timeZone: "America/New_York",
    consent: "high",
    onDoNotCall: false,
    dialsToday: 0,
    attemptsForContact: 0,
    policy,
  });
  assert.equal(early.checks.find((c) => c.id === "hours")?.passed, false);

  const sunday = evaluateGates({
    now: at("2026-10-04T11:00:00"),
    timeZone: "America/New_York",
    consent: "high",
    onDoNotCall: false,
    dialsToday: 0,
    attemptsForContact: 0,
    policy,
  });
  assert.equal(sunday.checks.find((c) => c.id === "hours")?.passed, false);
});

test("uses the lead timezone, not the server clock", () => {
  const instant = at("2026-10-02T09:30:00");
  const east = evaluateGates({
    now: instant,
    timeZone: "America/New_York",
    consent: "high",
    onDoNotCall: false,
    dialsToday: 0,
    attemptsForContact: 0,
    policy,
  });
  const west = evaluateGates({
    now: instant,
    timeZone: "America/Los_Angeles",
    consent: "high",
    onDoNotCall: false,
    dialsToday: 0,
    attemptsForContact: 0,
    policy,
  });
  assert.equal(east.checks.find((c) => c.id === "hours")?.passed, true);
  assert.equal(west.checks.find((c) => c.id === "hours")?.passed, false);
});

test("blocks at the daily cap and the retry limit", () => {
  const capped = evaluateGates({
    now: at("2026-10-02T10:30:00"),
    timeZone: "America/New_York",
    consent: "medium",
    onDoNotCall: false,
    dialsToday: 3,
    attemptsForContact: 0,
    policy,
  });
  assert.equal(capped.checks.find((c) => c.id === "daily_cap")?.passed, false);
  const retries = evaluateGates({
    now: at("2026-10-02T10:30:00"),
    timeZone: "America/New_York",
    consent: "low",
    onDoNotCall: false,
    dialsToday: 1,
    attemptsForContact: 2,
    policy,
  });
  assert.equal(retries.checks.find((c) => c.id === "attempts")?.passed, false);
});

test("passes when consent, hours, dnc, cap, and attempts are clear", () => {
  const result = evaluateGates({
    now: at("2026-10-02T15:00:00"),
    timeZone: "America/New_York",
    consent: "high",
    onDoNotCall: false,
    dialsToday: 1,
    attemptsForContact: 1,
    policy,
  });
  assert.equal(result.passed, true);
  assert.equal(result.checks.every((c) => c.passed), true);
});

test("turned-off compliance switches do not block", () => {
  const result = evaluateGates({
    now: at("2026-10-04T02:00:00"),
    timeZone: "America/New_York",
    consent: null,
    onDoNotCall: true,
    dialsToday: 0,
    attemptsForContact: 0,
    policy: { ...policy, requireConsent: false, enforceDnc: false, enforceCallingHours: false },
  });
  assert.equal(result.passed, true);
});

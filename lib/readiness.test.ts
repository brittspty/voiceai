import assert from "node:assert/strict";
import test from "node:test";
import { readinessItems, type ReadinessInput } from "./readiness";

const ready: ReadinessInput = {
  testMode: false,
  scheduleEnabled: true,
  integrationsMode: "live",
  hasGhlKey: true,
  hasGhlLocation: true,
  hasElevenKey: true,
  hasElevenAgent: true,
  hasTwilioSid: true,
  hasTwilioToken: true,
  hasTwilioNumber: true,
  agentPublished: true,
  voicePublished: true,
  rulesPublished: true,
  requireConsent: true,
  enforceDnc: true,
  enforceHours: true,
  liveKnowledge: true,
  officeReady: true,
  anyTotp: true,
  webhookSecrets: true,
};

test("a fresh test-mode install is not production ready", () => {
  const items = readinessItems({ ...ready, testMode: true, integrationsMode: "mock", scheduleEnabled: false, hasGhlKey: false });
  assert.equal(items.find((i) => i.id === "test-mode")?.ok, false);
  assert.equal(items.find((i) => i.id === "mode")?.ok, false);
  assert.equal(items.find((i) => i.id === "ghl")?.ok, false);
  assert.ok(items.some((i) => !i.ok));
});

test("every item passes when the pilot switches and keys are in place", () => {
  assert.equal(readinessItems(ready).every((item) => item.ok), true);
});

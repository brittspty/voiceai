import assert from "node:assert/strict";
import test from "node:test";
import { goLiveBlockReason, goLiveProgress, periodLabel, presentIntegration } from "./customer-copy";
import { readinessItems, type ReadinessInput } from "./readiness";

const ready: ReadinessInput = {
  testMode: true,
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

test("go-live can be offered while test mode is still on", () => {
  const progress = goLiveProgress(readinessItems(ready));
  assert.equal(progress.ready, true);
  assert.equal(progress.remaining, 0);
  assert.equal(progress.done, progress.total - 1);
});

test("a missing connection is the next go-live step", () => {
  const progress = goLiveProgress(readinessItems({ ...ready, integrationsMode: "mock", hasGhlKey: false }));
  assert.equal(progress.ready, false);
  assert.ok(progress.remaining >= 2);
  assert.equal(progress.nextTitle, "Live connections turned on");
});

test("integration status does not call a missing key healthy", () => {
  const shown = presentIntegration({
    label: "GoHighLevel",
    status: "healthy",
    detail: "Lead sync",
    checkedAt: new Date(),
    testMode: true,
    keysReady: false,
  });
  assert.equal(shown.status, "Not connected");
  assert.match(shown.sentence, /isn't linked yet/);
});

test("a fresh test-mode connection is labeled test only", () => {
  const shown = presentIntegration({
    label: "Twilio",
    status: "healthy",
    detail: "Phone carrier",
    checkedAt: new Date(),
    testMode: true,
    keysReady: true,
  });
  assert.equal(shown.status, "Test only");
  assert.equal(shown.tone, "amber");
});

test("a day-old check is unknown until someone checks again", () => {
  const shown = presentIntegration({
    label: "ElevenLabs",
    status: "healthy",
    detail: "Conversational AI",
    checkedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    testMode: false,
    keysReady: true,
  });
  assert.equal(shown.status, "Unknown");
  assert.equal(shown.stale, true);
});

test("leaving test mode needs the phrase and a finished checklist", () => {
  const readyItems = readinessItems(ready);
  assert.equal(goLiveBlockReason({ confirm: undefined, items: readyItems }), "Type GO LIVE to confirm.");
  assert.equal(goLiveBlockReason({ confirm: "go live", items: readyItems }), "Type GO LIVE to confirm.");
  assert.equal(goLiveBlockReason({ confirm: "GO LIVE", items: readyItems }), null);
  const blocked = readinessItems({ ...ready, hasGhlKey: false, integrationsMode: "mock" });
  assert.match(goLiveBlockReason({ confirm: "GO LIVE", items: blocked }) || "", /Finish \d+ more steps/);
});

test("period labels follow the overview dropdown", () => {
  assert.equal(periodLabel("today"), "Today");
  assert.equal(periodLabel("7d"), "Last 7 days");
  assert.equal(periodLabel("30d"), "Last 30 days");
});

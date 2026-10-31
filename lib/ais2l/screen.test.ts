import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { callSummaryText, exampleAis2lCalls, ghlSyncLabel, isTestNumber, presentCallDetail, testDialDecision, testPill, voiceTestActive } from "./screen";

test("the TEST pill is on while voice is in test mode and off only when live", () => {
  assert.equal(voiceTestActive(true, { INTEGRATIONS_MODE: "live" }), true);
  assert.equal(voiceTestActive(false, {}), true);
  assert.equal(voiceTestActive(false, { INTEGRATIONS_MODE: "mock" }), true);
  assert.equal(voiceTestActive(false, { INTEGRATIONS_MODE: "live" }), false);
  const on = testPill(true, { INTEGRATIONS_MODE: "live" });
  assert.equal(on.show, true);
  assert.equal(on.enforced, true);
  assert.equal(on.label, "TEST");
  assert.match(on.text, /TEST MODE/);
  assert.match(on.text, /test numbers/);
  assert.equal(testPill(false, { INTEGRATIONS_MODE: "live" }).show, false);
});

test("a non-test number is refused on the server while voice is in test mode", () => {
  assert.equal(isTestNumber("+19195550100"), true);
  assert.equal(isTestNumber("+12125550199"), true);
  assert.equal(isTestNumber("+15551230000"), true);
  assert.equal(isTestNumber("+13128675309"), false);
  assert.equal(isTestNumber("+442079460123"), false);
  const live = { INTEGRATIONS_MODE: "live" };
  assert.equal(testDialDecision({ orgTestMode: false, phone: "+13128675309", env: live }).allowed, true);
  assert.equal(testDialDecision({ orgTestMode: true, phone: "+13128675309", env: live }).allowed, false);
  assert.equal(testDialDecision({ orgTestMode: true, phone: "+19195550100", env: live }).allowed, true);
  assert.match(testDialDecision({ orgTestMode: false, phone: "+13128675309", env: {} }).reason, /test mode/i);
  const dialer = readFileSync(new URL("../dialer.ts", import.meta.url), "utf8");
  const gateAt = dialer.indexOf("testDialDecision");
  const placeAt = dialer.indexOf("placeIfAllowed");
  assert.ok(gateAt > 0 && gateAt < placeAt);
  assert.match(dialer, /decision\.allowed/);
});

test("call detail is a summary until the transcript is requested, and each call has a GoHighLevel status", () => {
  const summary = callSummaryText({ contactName: "Ray S.", outcome: "booked", durationSec: 40 });
  assert.match(summary, /Ray S\./);
  assert.match(summary, /booked/);
  assert.equal(summary.includes("SECRET TRANSCRIPT"), false);
  const detail = presentCallDetail(
    { id: "1", summary, transcript: [{ speaker: "contact" as const, text: "SECRET TRANSCRIPT", atSec: 1 }], ghlSync: ghlSyncLabel("succeeded") },
    { includeTranscript: false },
  );
  assert.equal(detail.summaryFirst, true);
  assert.equal(detail.transcriptAvailable, true);
  assert.deepEqual(detail.transcript, []);
  assert.equal(detail.ghlSync.label, "Synced to GoHighLevel");
  const opened = presentCallDetail(detail, { includeTranscript: false });
  assert.equal(opened.transcript.length, 0);
  const withText = presentCallDetail(
    { id: "1", summary, transcript: [{ speaker: "agent" as const, text: "Hello", atSec: 0 }] },
    { includeTranscript: true },
  );
  assert.equal(withText.transcript[0]?.text, "Hello");
  assert.equal(ghlSyncLabel("pending").label, "Waiting to sync to GoHighLevel");
  assert.equal(ghlSyncLabel("failed").status, "failed");
  assert.match(ghlSyncLabel(null).label, /Not synced/);
  const example = exampleAis2lCalls()[0];
  assert.equal(example?.example, true);
  assert.match(example?.ghl.label || "", /GoHighLevel/);
  assert.equal((example?.summary || "").includes(example?.transcript || "nope"), false);
});

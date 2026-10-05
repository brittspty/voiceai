import assert from "node:assert/strict";
import test from "node:test";
import { consentSnapshot, decideConsent } from "./consent";
import { runDialAttempt, type CrmPort, type VoicePort } from "./pipeline";
import { DEFAULT_POLICY } from "./types";
import { zonedTimeToUtc } from "./time";

const allowed = decideConsent(consentSnapshot({ tierRaw: "High" }), "+19195550100");

const gate = {
  now: zonedTimeToUtc("2026-10-02T11:00:00", "America/New_York"),
  timeZone: "America/New_York",
  consent: "high" as const,
  onDoNotCall: false,
  dialsToday: 0,
  attemptsForContact: 0,
  policy: DEFAULT_POLICY,
};

test("does not dial when a gate fails", async () => {
  let called = false;
  const voice: VoicePort = {
    async placeCall() {
      called = true;
      throw new Error("should not dial");
    },
  };
  const crm: CrmPort = { async writeOutcome() { return { externalId: "x" }; } };
  const result = await runDialAttempt({
    gate: { ...gate, onDoNotCall: true },
    consent: allowed,
    voice,
    crm,
    voiceInput: { to: "+19195550100", contactName: "Demo", agentName: "Karen", openingLine: "Hi" },
    crmInput: { contactName: "Demo", phone: "+19195550100", agentName: "Karen" },
  });
  assert.equal(result.kind, "blocked");
  assert.equal(called, false);
});

test("dials, then writes the outcome, and plans a meeting when booked", async () => {
  const order: string[] = [];
  const voice: VoicePort = {
    async placeCall(input) {
      order.push("voice");
      assert.equal(input.consentScope, "full");
      return {
        conversationId: "conv_test",
        callSid: "CA_test",
        outcome: input.simulatedOutcome || "callback_requested",
        durationSec: 48,
        costCents: 16,
        transcript: [{ speaker: "agent", text: "Hello", atSec: 0 }],
      };
    },
  };
  const crm: CrmPort = {
    async writeOutcome(input) {
      order.push("crm");
      assert.match(input.summary, /booked/i);
      return { externalId: "note_1" };
    },
  };
  const result = await runDialAttempt({
    gate,
    consent: allowed,
    voice,
    crm,
    voiceInput: { to: "+19195550100", contactName: "Demo", agentName: "Karen", openingLine: "Hi", simulatedOutcome: "booked" },
    crmInput: { contactName: "Demo", phone: "+19195550100", agentName: "Karen" },
  });
  assert.equal(result.kind, "completed");
  if (result.kind === "completed") {
    assert.equal(result.createAppointment, true);
    assert.equal(result.crmId, "note_1");
    assert.equal(result.vendorCalled, true);
  }
  assert.deepEqual(order, ["voice", "crm"]);
});

test("keeps the call result when the CRM write fails", async () => {
  const voice: VoicePort = {
    async placeCall() {
      return {
        conversationId: "conv_test",
        callSid: "CA_test",
        outcome: "callback_requested",
        durationSec: 30,
        costCents: 10,
        transcript: [],
      };
    },
  };
  const crm: CrmPort = {
    async writeOutcome() {
      throw new Error("GoHighLevel 503");
    },
  };
  const result = await runDialAttempt({
    gate,
    consent: allowed,
    voice,
    crm,
    voiceInput: { to: "+19195550100", contactName: "Demo", agentName: "Karen", openingLine: "Hi" },
    crmInput: { contactName: "Demo", phone: "+19195550100", agentName: "Karen", forceFail: true },
  });
  assert.equal(result.kind, "completed");
  if (result.kind === "completed") assert.match(result.crmError || "", /503/);
});

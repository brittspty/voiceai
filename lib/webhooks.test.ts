import assert from "node:assert/strict";
import test from "node:test";
import { mapVendorOutcome, parseEleven, parseGhl, parseTwilio, signBody, verifySignature } from "./webhook-parse";

test("parses a GoHighLevel contact and an appointment", () => {
  const contact = parseGhl({
    type: "ContactCreate",
    contact: { id: "ghl_1", firstName: "Eva", lastName: "Ng", phone: "+1 (919) 555-0144", email: "eva@example.com", tags: ["medicare"] },
  });
  assert.equal(contact.kind, "contact");
  if (contact.kind === "contact") {
    assert.equal(contact.name, "Eva Ng");
    assert.equal(contact.phone, "+19195550144");
    assert.deepEqual(contact.tags, ["medicare"]);
  }
  const appointment = parseGhl({ type: "AppointmentCreate", appointment: { id: "a1", startTime: "2026-10-03T14:00:00Z", contactId: "ghl_1" }, contact: { id: "ghl_1" } });
  assert.equal(appointment.kind, "appointment");
});

test("parses ElevenLabs and Twilio callbacks", () => {
  const eleven = parseEleven({
    conversation_id: "conv_1",
    analysis: { outcome: "booked" },
    metadata: { call_duration_secs: 54, cost: 0.18 },
    transcript: [{ role: "agent", message: "Hello", time_in_call_secs: 1 }],
  });
  assert.equal(eleven?.conversationId, "conv_1");
  assert.equal(mapVendorOutcome(eleven?.outcome), "booked");
  assert.equal(eleven?.costCents, 18);
  const twilio = parseTwilio({ CallSid: "CA1", CallStatus: "no-answer", CallDuration: "0" });
  assert.equal(twilio?.status, "no-answer");
  assert.equal(mapVendorOutcome("no-answer"), "no_answer");
});

test("checks webhook signatures and allows unsigned mock traffic", () => {
  const body = "{\"ok\":true}";
  const sig = signBody("secret", body);
  assert.equal(verifySignature("secret", body, sig, "live"), true);
  assert.equal(verifySignature("secret", body, "nope", "live"), false);
  assert.equal(verifySignature(undefined, body, null, "mock"), true);
  assert.equal(verifySignature(undefined, body, null, "live"), false);
});

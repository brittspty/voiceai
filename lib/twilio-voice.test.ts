import assert from "node:assert/strict";
import test from "node:test";
import { signBody } from "./webhook-parse";
import { readGhlConsent } from "./voice-consent";
import {
  ELEVENLABS_REGISTER_CALL_URL,
  elevenLabsInboundConfigured,
  elevenLabsOutboundPayload,
  emptyTwiml,
  handleTwilioWebhook,
  politeHangupTwiml,
  reduceTwilioCallStatus,
  signTwilioRequest,
  twilioValidationUrls,
  twilioWebhookKind,
  type CallSnapshot,
  type TwilioWebhookDeps,
} from "./twilio";

const NOW = "2026-10-13T15:00:00.000Z";

function blank(over: Partial<CallSnapshot> = {}): CallSnapshot {
  return {
    status: "queued",
    outcome: null,
    startedAt: null,
    endedAt: null,
    dialedAt: null,
    durationSec: 0,
    failureReason: null,
    ...over,
  };
}

function deps(over: Partial<TwilioWebhookDeps> = {}): TwilioWebhookDeps & { logged: Record<string, string>[]; statuses: unknown[] } {
  const logged: Record<string, string>[] = [];
  const statuses: unknown[] = [];
  return {
    mode: "live",
    authToken: "auth-token",
    webhookSecret: "internal-secret",
    appUrl: "https://voiceai.specificityinc.com",
    testMode: true,
    companyName: "Specificity Inc",
    logged,
    statuses,
    applyStatus: async (body) => {
      statuses.push(body);
      return { ok: true };
    },
    logInbound: async (params) => {
      logged.push(params);
      return { ok: true, callId: "call_1" };
    },
    ...over,
  };
}

test("matches Twilio's published HMAC-SHA1 example", () => {
  const url = "https://example.com/myapp.php?foo=1&bar=2";
  const params: [string, string][] = [
    ["Digits", "1234"],
    ["To", "+18005551212"],
    ["From", "+14158675310"],
    ["Caller", "+14158675310"],
    ["CallSid", "CA1234567890ABCDE"],
  ];
  assert.equal(signTwilioRequest("12345", url, params), "L/OH5YylLD5NRKLltdqwSvS0BnU=");
});

test("builds the public URL from APP_URL and the proxy host", () => {
  const urls = twilioValidationUrls({
    requestUrl: "http://127.0.0.1:43123/api/webhooks/twilio",
    appUrl: "https://voiceai.specificityinc.com",
    forwardedProto: "https,http",
    forwardedHost: "voiceai.specificityinc.com",
  });
  assert.ok(urls.includes("https://voiceai.specificityinc.com/api/webhooks/twilio"));
  assert.ok(urls.includes("https://voiceai.specificityinc.com:443/api/webhooks/twilio"));
  assert.ok(urls.includes("http://127.0.0.1:43123/api/webhooks/twilio"));
});

test("accepts a Twilio signature over APP_URL when the request host is internal", async () => {
  const form = new URLSearchParams({
    CallSid: "CA_IN_1",
    CallStatus: "ringing",
    Direction: "inbound",
    From: "+14155550100",
    To: "+18005550199",
  });
  const signedUrl = "https://voiceai.specificityinc.com/api/webhooks/twilio";
  const signature = signTwilioRequest("auth-token", signedUrl, form);
  const harness = deps();
  const response = await handleTwilioWebhook(
    new Request("http://127.0.0.1:43123/api/webhooks/twilio", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-twilio-signature": signature,
        "x-forwarded-proto": "https",
        "x-forwarded-host": "voiceai.specificityinc.com",
        "x-webhook-secret": "internal-secret",
      },
      body: form.toString(),
    }),
    harness,
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/xml/);
  const xml = await response.text();
  assert.match(xml, /<Say>/);
  assert.match(xml, /Specificity Inc/);
  assert.match(xml, /<Hangup\/>/);
  assert.equal(xml.includes("<Message"), false);
  assert.equal(xml.includes("<Sms"), false);
  assert.equal(harness.logged.length, 1);
  assert.equal(harness.logged[0].CallSid, "CA_IN_1");
  assert.equal(harness.statuses.length, 1);
});

test("rejects a bad Twilio signature even when the internal secret matches", async () => {
  const form = new URLSearchParams({ CallSid: "CA_BAD", Direction: "inbound", CallStatus: "ringing", From: "+14155550100", To: "+18005550199" });
  const harness = deps();
  const response = await handleTwilioWebhook(
    new Request("http://127.0.0.1:43123/api/webhooks/twilio", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-twilio-signature": "not-a-signature",
        "x-webhook-secret": "internal-secret",
      },
      body: form.toString(),
    }),
    harness,
  );
  assert.equal(response.status, 401);
  assert.match(response.headers.get("content-type") || "", /text\/xml/);
  assert.equal(harness.logged.length, 0);
  assert.equal(harness.statuses.length, 0);
});

test("keeps x-webhook-secret and x-voiceops-signature for internal callers", async () => {
  const shared = deps();
  const sharedResponse = await handleTwilioWebhook(
    new Request("http://127.0.0.1:43123/api/webhooks/twilio", {
      method: "POST",
      headers: { "content-type": "application/json", "x-webhook-secret": "internal-secret" },
      body: JSON.stringify({ CallSid: "CA_INT", CallStatus: "busy" }),
    }),
    shared,
  );
  assert.equal(sharedResponse.status, 200);
  assert.match(sharedResponse.headers.get("content-type") || "", /application\/json/);
  assert.deepEqual(await sharedResponse.json(), { ok: true });
  assert.equal(shared.statuses.length, 1);
  assert.equal(shared.logged.length, 0);

  const raw = JSON.stringify({ CallSid: "CA_SIG", CallStatus: "ringing" });
  const signed = deps();
  const signedResponse = await handleTwilioWebhook(
    new Request("http://127.0.0.1:43123/api/webhooks/twilio", {
      method: "POST",
      headers: { "content-type": "application/json", "x-voiceops-signature": signBody("internal-secret", raw) },
      body: raw,
    }),
    signed,
  );
  assert.equal(signedResponse.status, 200);
  assert.equal(signed.statuses.length, 1);
});

test("returns connect TwiML from a mocked ElevenLabs register-call when voice is configured", async () => {
  const form = new URLSearchParams({
    CallSid: "CA_LIVE",
    CallStatus: "ringing",
    Direction: "inbound",
    From: "+14155550123",
    To: "+18005550199",
  });
  const signature = signTwilioRequest("auth-token", "https://voiceai.specificityinc.com/api/webhooks/twilio", form);
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="wss://api.elevenlabs.io/v1/convai/conversation"/></Connect></Response>`;
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(twiml), { status: 200 });
  };
  const response = await handleTwilioWebhook(
    new Request("http://127.0.0.1:43123/api/webhooks/twilio", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": signature },
      body: form.toString(),
    }),
    deps({
      mode: "live",
      testMode: false,
      agentId: "agent_123",
      elevenKey: "xi-test",
      fetchImpl,
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), twiml);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, ELEVENLABS_REGISTER_CALL_URL);
  const body = JSON.parse(String(calls[0].init?.body));
  assert.deepEqual(body, {
    agent_id: "agent_123",
    from_number: "+14155550123",
    to_number: "+18005550199",
    direction: "inbound",
  });
  assert.equal(JSON.stringify(body).toLowerCase().includes("sms"), false);
  const headers = new Headers(calls[0].init?.headers);
  assert.equal(headers.get("xi-api-key"), "xi-test");
});

test("test mode and a failed register-call stay on the polite hangup", async () => {
  assert.equal(elevenLabsInboundConfigured({ agentId: "agent_123", apiKey: "xi-test", mode: "live", testMode: true }), false);
  assert.equal(elevenLabsInboundConfigured({ agentId: "agent_123", apiKey: "xi-test", mode: "mock", testMode: false }), false);
  assert.equal(elevenLabsInboundConfigured({ agentId: "", apiKey: "xi-test", mode: "live", testMode: false }), false);
  const polite = politeHangupTwiml("Specificity & Co");
  assert.match(polite, /Specificity &amp; Co/);
  assert.equal(polite.includes("<Message"), false);
  let called = false;
  const resolved = await handleTwilioWebhook(
    new Request("https://voiceai.specificityinc.com/api/webhooks/twilio", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-twilio-signature": signTwilioRequest(
          "auth-token",
          "https://voiceai.specificityinc.com/api/webhooks/twilio",
          new URLSearchParams({ CallSid: "CA_T", Direction: "inbound", CallStatus: "ringing", From: "+1", To: "+2" }),
        ),
      },
      body: new URLSearchParams({ CallSid: "CA_T", Direction: "inbound", CallStatus: "ringing", From: "+1", To: "+2" }).toString(),
    }),
    deps({
      mode: "live",
      testMode: false,
      agentId: "agent_123",
      elevenKey: "xi-test",
      companyName: "Specificity & Co",
      fetchImpl: async () => {
        called = true;
        return new Response("upstream down", { status: 503 });
      },
    }),
  );
  assert.equal(called, true);
  assert.equal(await resolved.text(), politeHangupTwiml("Specificity & Co"));
});

test("status callbacks return empty TwiML and do not open an inbound call for outbound events", async () => {
  const form = new URLSearchParams({
    CallSid: "CA_OUT",
    CallStatus: "answered",
    Direction: "outbound-api",
    CallbackSource: "call-progress-events",
    SequenceNumber: "2",
    From: "+18005550199",
    To: "+14155550100",
  });
  const signature = signTwilioRequest("auth-token", "https://voiceai.specificityinc.com:443/api/webhooks/twilio", form);
  const harness = deps();
  const response = await handleTwilioWebhook(
    new Request("http://app:43123/api/webhooks/twilio", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": signature },
      body: form.toString(),
    }),
    harness,
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), emptyTwiml());
  assert.equal(harness.logged.length, 0);
  assert.equal(harness.statuses.length, 1);
  assert.equal(twilioWebhookKind({ CallSid: "CA1", Direction: "inbound", CallStatus: "ringing" }), "inbound");
  assert.equal(twilioWebhookKind({ CallSid: "CA1", Direction: "inbound", CallStatus: "completed", CallbackSource: "call-progress-events" }), "status");
});

test("applies each Twilio status once and does not move backwards", () => {
  let state = blank();
  const steps = [
    { status: "initiated", expect: "dialing", changed: true },
    { status: "ringing", expect: "dialing", changed: false },
    { status: "answered", expect: "in_progress", changed: true },
    { status: "completed", expect: "wrap_up", changed: true },
  ] as const;
  for (const step of steps) {
    const first = reduceTwilioCallStatus(state, { status: step.status, durationSec: step.status === "completed" ? 36 : undefined }, NOW);
    assert.equal(first.changed, step.changed, step.status);
    assert.equal(first.next.status, step.expect);
    const again = reduceTwilioCallStatus(first.next, { status: step.status, durationSec: step.status === "completed" ? 36 : undefined }, "2026-10-13T16:00:00.000Z");
    assert.equal(again.changed, false, `${step.status} replay`);
    assert.equal(again.next.endedAt, first.next.endedAt);
    state = first.next;
  }
  assert.equal(state.durationSec, 36);
  assert.equal(state.startedAt, NOW);
  const lateRing = reduceTwilioCallStatus(state, { status: "ringing" }, "2026-10-13T17:00:00.000Z");
  assert.equal(lateRing.changed, false);
  assert.equal(lateRing.next.status, "wrap_up");

  const progress = reduceTwilioCallStatus(blank({ status: "dialing", dialedAt: NOW }), { status: "in-progress" }, NOW);
  assert.equal(progress.next.status, "in_progress");
  assert.equal(reduceTwilioCallStatus(progress.next, { status: "in-progress" }, "later").changed, false);
});

test("terminal Twilio failures are idempotent", () => {
  for (const status of ["busy", "no-answer", "failed", "canceled"] as const) {
    const first = reduceTwilioCallStatus(blank({ status: "dialing", dialedAt: NOW }), { status }, NOW);
    assert.equal(first.next.status, "failed");
    assert.equal(first.next.outcome, status === "no-answer" ? "no_answer" : "failed");
    assert.equal(first.next.failureReason, `Twilio reported ${status}`);
    assert.equal(first.next.endedAt, NOW);
    const again = reduceTwilioCallStatus(first.next, { status }, "2026-10-13T18:00:00.000Z");
    assert.equal(again.changed, false);
    assert.equal(again.next.endedAt, NOW);
  }
  const afterComplete = reduceTwilioCallStatus(blank({ status: "wrap_up", endedAt: NOW }), { status: "busy" }, "later");
  assert.equal(afterComplete.changed, false);
  assert.equal(afterComplete.next.status, "wrap_up");
});

test("maps consent tiers to ElevenLabs dynamic variables", () => {
  const medium = readGhlConsent({
    tags: ["avery_dial_ok"],
    customFields: [{ fieldKey: "contact.consent_tier", value: "medium" }, { name: "consent_revoked", value: "0" }],
  });
  assert.equal(medium.tier, "medium");
  assert.equal(medium.revoked, false);
  assert.equal(medium.averyDialOk, true);
  assert.equal(medium.scope, "scheduling only");

  const high = readGhlConsent({ customField: { consent_tier: "high", consent_revoked: false } });
  assert.equal(high.scope, "product/service conversation");
  assert.equal(high.averyDialOk, false);

  const blocked = readGhlConsent({ consent_tier: "low", tags: ["avery_dial_ok"] });
  assert.equal(blocked.scope, null);
  assert.equal(blocked.averyDialOk, true);

  const revoked = readGhlConsent({ consent_tier: "high", consent_revoked: true, tags: ["avery_dial_ok"] });
  assert.equal(revoked.revoked, true);
  assert.equal(revoked.scope, null);

  const payload = elevenLabsOutboundPayload({
    agentId: "agent_123",
    agentPhoneNumberId: "phnum_123",
    to: "+14155550100",
    openingLine: "Hi, this is Avery.",
    consentScope: "scheduling only",
  });
  assert.deepEqual(payload.conversation_initiation_client_data.dynamic_variables, { consent_scope: "scheduling only" });
  const highPayload = elevenLabsOutboundPayload({
    agentId: "agent_123",
    agentPhoneNumberId: "phnum_123",
    to: "+14155550100",
    openingLine: "Hi, this is Avery.",
    consentScope: "product/service conversation",
  });
  assert.equal(highPayload.conversation_initiation_client_data.dynamic_variables?.consent_scope, "product/service conversation");
  assert.equal(JSON.stringify(payload).toLowerCase().includes("sms"), false);
});

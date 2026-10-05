import assert from "node:assert/strict";
import test from "node:test";
import { mockVoice, voiceIsMocked } from "./adapters";
import { consentFieldConfig } from "./client-config";
import {
  CONSENT_SCOPE_VARIABLE,
  consentAuditAction,
  consentPhoneMismatches,
  consentSnapshot,
  createMemoryFieldCache,
  decideConsent,
  keysMatch,
  loadConsentSnapshot,
  parseCustomFieldDefs,
  queueConsentView,
  reviewContactConsent,
  unreadableSnapshot,
} from "./consent";
import { elevenLabsOutboundPayload } from "./elevenlabs";
import { placeIfAllowed, type VoicePort } from "./pipeline";
import { DEFAULT_POLICY } from "./types";
import { zonedTimeToUtc } from "./time";

const phone = "+19195550100";
const config = consentFieldConfig({});

function fieldsPayload() {
  return {
    customFields: [
      { id: "f_tier", fieldKey: "contact.consent_tier" },
      { id: "f_revoked", fieldKey: "contact.consent_revoked_at" },
      { id: "f_purpose", fieldKey: "contact.consent_purpose" },
      { id: "f_ts", fieldKey: "contact.consent_timestamp" },
      { id: "f_url", fieldKey: "contact.consent_source_url" },
      { id: "f_ver", fieldKey: "contact.consent_version" },
      { id: "f_phone", fieldKey: "contact.consent_phone" },
      { id: "f_method", fieldKey: "contact.consent_method" },
      { id: "f_ip", fieldKey: "contact.consent_ip" },
      { id: "f_ua", fieldKey: "contact.consent_user_agent" },
      { id: "f_cookie", fieldKey: "contact.cookie_consent_categories" },
    ],
  };
}

function contactPayload(values: Record<string, unknown>, tags: unknown[] = []) {
  return {
    contact: {
      id: "c1",
      phone,
      tags,
      customFields: Object.entries(values).map(([id, value]) => ({ id, value })),
    },
  };
}

const auditValues = {
  f_purpose: "scheduling",
  f_ts: "2026-04-01T12:00:00Z",
  f_url: "https://example.com/book",
  f_ver: "v3",
  f_method: "web_form",
  f_ip: "203.0.113.8",
  f_ua: "TestAgent",
  f_cookie: "necessary, marketing",
};

function highContact(extra: Record<string, unknown> = {}, tags: unknown[] = []) {
  return contactPayload({ f_tier: "High", f_revoked: "", ...auditValues, ...extra }, tags);
}

function fakeFetch(handlers: Record<string, () => unknown | Promise<unknown>>) {
  const calls: string[] = [];
  const fetchImpl = async (path: string) => {
    calls.push(path);
    const key = Object.keys(handlers).find((item) => path.includes(item));
    if (!key) throw new Error(`unexpected ${path}`);
    return handlers[key]();
  };
  return { fetchImpl, calls };
}

async function load(handlers: Record<string, () => unknown | Promise<unknown>>, cache = createMemoryFieldCache()) {
  const fake = fakeFetch(handlers);
  const snapshot = await loadConsentSnapshot({
    contactId: "c1",
    locationId: "loc_1",
    config,
    fetchImpl: fake.fetchImpl,
    cache,
  });
  return { snapshot, calls: fake.calls };
}

const gate = {
  now: zonedTimeToUtc("2026-10-02T11:00:00", "America/New_York"),
  timeZone: "America/New_York",
  consent: "low" as const,
  onDoNotCall: false,
  dialsToday: 0,
  attemptsForContact: 0,
  policy: DEFAULT_POLICY,
};

async function dial(decision: ReturnType<typeof decideConsent>) {
  let scope: string | null = null;
  const voice: VoicePort = {
    async placeCall(input) {
      scope = input.consentScope;
      return {
        conversationId: "conv",
        callSid: "CA",
        outcome: "callback_requested",
        durationSec: 10,
        costCents: 1,
        transcript: [],
      };
    },
  };
  const result = await placeIfAllowed({
    gate,
    consent: decision,
    voice,
    voiceInput: { to: phone, contactName: "Ada", agentName: "Avery", openingLine: "Hi" },
  });
  return { result, scope };
}

test("Low cookie consent does not dial", () => {
  const decision = decideConsent(consentSnapshot({ tierRaw: "Low" }), phone);
  assert.equal(decision.allow, false);
  assert.equal(decision.tier, "low");
  assert.equal(decision.scope, null);
  assert.match(decision.reason, /cookie consent only/i);
});

test("Medium allows scheduling only", () => {
  const decision = decideConsent(consentSnapshot({ tierRaw: "Medium", version: "v3", timestamp: "2026-04-01T12:00:00Z" }), phone);
  assert.equal(decision.allow, true);
  assert.equal(decision.scope, "scheduling_only");
  assert.equal(decision.tier, "medium");
  assert.match(decision.reason, /scheduling only/i);
  assert.match(decision.reason, /no product or service/i);
  assert.match(consentAuditAction(decision), /tier medium, scope scheduling_only, version v3, timestamp 2026-04-01T12:00:00Z/);
});

test("High allows a full conversation", () => {
  const decision = decideConsent(consentSnapshot({ tierRaw: " high " }), phone);
  assert.equal(decision.allow, true);
  assert.equal(decision.scope, "full");
  assert.equal(decision.tier, "high");
});

test("a missing, empty, or unknown tier is treated as Low", () => {
  for (const tierRaw of [null, "", "   ", "gold", "none"]) {
    const decision = decideConsent(consentSnapshot({ tierRaw }), phone);
    assert.equal(decision.allow, false, `tier ${JSON.stringify(tierRaw)}`);
    assert.equal(decision.tier, "low");
    assert.match(decision.reason, /Treated as Low|cookie consent only/);
  }
});

test("an unreadable consent payload fails closed", () => {
  const decision = decideConsent(unreadableSnapshot("GoHighLevel 503"), phone);
  assert.equal(decision.allow, false);
  assert.equal(decision.tier, "low");
  assert.match(decision.reason, /could not be read/);
  assert.match(decision.reason, /503/);
  assert.match(decision.reason, /Consent version none/);
});

test("a revoked timestamp blocks every tier and is do-not-call", () => {
  const decision = decideConsent(consentSnapshot({ tierRaw: "High", revokedAt: "2026-05-01T00:00:00Z", version: "v9" }), phone);
  assert.equal(decision.allow, false);
  assert.equal(decision.revoked, true);
  assert.equal(decision.tier, "high");
  assert.match(decision.reason, /do-not-call/i);
  assert.match(consentAuditAction(decision), /tier high/);
  assert.match(consentAuditAction(decision), /version v9/);
  const blank = decideConsent(consentSnapshot({ tierRaw: "High", revokedAt: "   " }), phone);
  assert.equal(blank.allow, true);
});

test("the consent_revoked tag blocks and avery_dial_ok does not override Low or a missing tier", () => {
  const tagged = decideConsent(consentSnapshot({ tierRaw: "High", tags: ["Consent_Revoked"] }), phone);
  assert.equal(tagged.allow, false);
  assert.equal(tagged.revoked, true);
  assert.match(tagged.reason, /consent_revoked/);

  const low = decideConsent(consentSnapshot({ tierRaw: "Low", tags: ["avery_dial_ok"] }), phone);
  assert.equal(low.allow, false);
  assert.equal(low.dialOkTag, true);
  assert.match(low.reason, /does not override/);

  const missing = decideConsent(consentSnapshot({ tierRaw: "", tags: ["avery_dial_ok"] }), phone);
  assert.equal(missing.allow, false);
  assert.match(missing.reason, /does not override/);

  const high = decideConsent(consentSnapshot({ tierRaw: "High", tags: ["avery_dial_ok"] }), phone);
  assert.equal(high.allow, true);
  assert.equal(high.dialOkTag, true);
  assert.equal(high.reason.includes("does not override"), false);
});

test("a consent phone must match the dialed number in E.164", () => {
  assert.equal(consentPhoneMismatches("", phone), false);
  assert.equal(consentPhoneMismatches(null, phone), false);
  const match = decideConsent(consentSnapshot({ tierRaw: "High", phone: "(919) 555-0100" }), "+1 919-555-0100");
  assert.equal(match.allow, true);
  const mismatch = decideConsent(consentSnapshot({ tierRaw: "High", phone: "+19195550199", version: "v1", timestamp: "2026-01-01T00:00:00Z" }), phone);
  assert.equal(mismatch.allow, false);
  assert.equal(mismatch.phoneMismatch, true);
  assert.match(mismatch.reason, /does not match/);
  assert.match(consentAuditAction(mismatch), /version v1, timestamp 2026-01-01T00:00:00Z/);
  const garbage = decideConsent(consentSnapshot({ tierRaw: "Medium", phone: "not-a-number" }), phone);
  assert.equal(garbage.allow, false);
});

test("custom tag names are configurable and the dial-ok tag still cannot grant a call", () => {
  const tags = { revokedTag: "stop_calls", dialOkTag: "ok_to_call" };
  const revoked = decideConsent(consentSnapshot({ tierRaw: "High", tags: ["stop_calls"] }), phone, tags);
  assert.equal(revoked.allow, false);
  const ignored = decideConsent(consentSnapshot({ tierRaw: "Low", tags: ["ok_to_call"] }), phone, tags);
  assert.equal(ignored.allow, false);
  assert.match(ignored.reason, /ok_to_call/);
});

test("field keys match the location custom field key, including the contact prefix", () => {
  assert.equal(keysMatch("contact.consent_tier", "contact.consent_tier"), true);
  assert.equal(keysMatch("contact.consent_tier", "consent_tier"), true);
  assert.equal(keysMatch("consent_tier", "contact.consent_tier"), true);
  assert.equal(keysMatch("contact.other", "contact.consent_tier"), false);
  const parsed = parseCustomFieldDefs(fieldsPayload());
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.fields.find((field) => field.fieldKey === "contact.consent_tier")?.id, "f_tier");
  assert.equal(parseCustomFieldDefs({ error: "nope" }).ok, false);
});

test("the loader resolves field ids, caches them, and still refetches the contact", async () => {
  const cache = createMemoryFieldCache();
  const first = await load({ customFields: () => fieldsPayload(), "/contacts/": () => highContact({ f_phone: "+1 (919) 555-0100" }) }, cache);
  const second = await load({ customFields: () => fieldsPayload(), "/contacts/": () => highContact() }, cache);
  assert.equal(first.calls.filter((path) => path.includes("customFields")).length, 1);
  assert.equal(second.calls.filter((path) => path.includes("customFields")).length, 0);
  assert.equal(second.calls.filter((path) => path.includes("/contacts/")).length, 1);
  const decision = decideConsent(first.snapshot, phone);
  assert.equal(decision.allow, true);
  assert.equal(decision.scope, "full");
  assert.equal(decision.version, "v3");
  assert.equal(decision.timestamp, "2026-04-01T12:00:00Z");
  assert.equal(decision.purpose, "scheduling");
  assert.equal(decision.cookieCategories, "necessary, marketing");
});

test("a missing tier field or a contact API error fails closed", async () => {
  const missing = await load({
    customFields: () => ({ customFields: [{ id: "f_revoked", fieldKey: "contact.consent_revoked_at" }] }),
    "/contacts/": () => highContact(),
  });
  const missingDecision = decideConsent(missing.snapshot, phone);
  assert.equal(missingDecision.allow, false);
  assert.equal(missingDecision.tier, "low");
  assert.match(missingDecision.reason, /not found/);

  const errored = await load({
    customFields: () => {
      throw new Error("GoHighLevel 500");
    },
  });
  const errorDecision = decideConsent(errored.snapshot, phone);
  assert.equal(errorDecision.allow, false);
  assert.match(errorDecision.reason, /500/);

  const contactError = await load({
    customFields: () => fieldsPayload(),
    "/contacts/": () => {
      throw new Error("GoHighLevel 404");
    },
  });
  assert.match(decideConsent(contactError.snapshot, phone).reason, /404/);
});

test("contact values can arrive as field_value and tags can be objects", async () => {
  const loaded = await load({
    customFields: () => fieldsPayload(),
    "/contacts/": () => ({
      contact: {
        id: "c1",
        tags: [{ name: "consent_revoked" }],
        customFields: [{ id: "f_tier", field_value: "High" }, { id: "f_revoked", field_value: "" }],
      },
    }),
  });
  const decision = decideConsent(loaded.snapshot, phone);
  assert.equal(decision.allow, false);
  assert.equal(decision.revoked, true);
});

test("review reads GoHighLevel when a contact id exists and fails closed without one on a live dial", async () => {
  let fetches = 0;
  const env = { GHL_API_KEY: "key", GHL_LOCATION_ID: "loc_1" };
  const fetchImpl = async (path: string) => {
    fetches += 1;
    if (path.includes("customFields")) return fieldsPayload();
    return highContact({ f_tier: "Medium" });
  };
  const live = await reviewContactConsent(
    { ghlContactId: "c1", phone, storedConsent: "low", mocked: false },
    { env, fetchImpl, cache: createMemoryFieldCache() },
  );
  assert.equal(live.allow, true);
  assert.equal(live.scope, "scheduling_only");
  assert.ok(fetches >= 2);

  const noContact = await reviewContactConsent(
    { ghlContactId: null, phone, storedConsent: "high", mocked: false },
    { env, fetchImpl },
  );
  assert.equal(noContact.allow, false);
  assert.match(noContact.reason, /contact id is missing/);

  const noKeys = await reviewContactConsent(
    { ghlContactId: "c1", phone, storedConsent: "high", mocked: true },
    { env: {}, fetchImpl },
  );
  assert.equal(noKeys.allow, false);
  assert.match(noKeys.reason, /API key or location id is missing/);
});

test("a mocked dial with no GoHighLevel id uses the stored tier and still fails closed for Low", async () => {
  const low = await reviewContactConsent({ ghlContactId: null, phone, storedConsent: "low", mocked: true }, { env: {} });
  assert.equal(low.allow, false);
  const none = await reviewContactConsent({ ghlContactId: null, phone, storedConsent: "none", mocked: true }, { env: {} });
  assert.equal(none.allow, false);
  assert.equal(none.tier, "low");
  const high = await reviewContactConsent({ ghlContactId: null, phone, storedConsent: "high", mocked: true }, { env: {} });
  assert.equal(high.allow, true);
  assert.equal(high.scope, "full");
});

test("placeIfAllowed does not dial Low, revoked, mismatched, or unreadable consent", async () => {
  const cases = [
    consentSnapshot({ tierRaw: "Low" }),
    consentSnapshot({ tierRaw: "High", revokedAt: "yesterday" }),
    consentSnapshot({ tierRaw: "High", phone: "+19195550000" }),
    consentSnapshot({ tierRaw: null }),
    unreadableSnapshot("field not found"),
    consentSnapshot({ tierRaw: "High", tags: ["consent_revoked"] }),
    consentSnapshot({ tierRaw: "Low", tags: ["avery_dial_ok"] }),
  ];
  for (const snapshot of cases) {
    const { result, scope } = await dial(decideConsent(snapshot, phone));
    assert.equal(result.kind, "blocked");
    assert.equal(result.vendorCalled, false);
    assert.equal(scope, null);
    assert.equal(result.checks.find((check) => check.id === "consent")?.passed, false);
  }
});

test("Medium and High pass consent_scope through to the voice port", async () => {
  const medium = await dial(decideConsent(consentSnapshot({ tierRaw: "Medium" }), phone));
  assert.equal(medium.result.kind, "completed");
  assert.equal(medium.scope, "scheduling_only");
  const high = await dial(decideConsent(consentSnapshot({ tierRaw: "High", tags: ["avery_dial_ok"] }), phone));
  assert.equal(high.result.kind, "completed");
  assert.equal(high.scope, "full");
});

test("the ElevenLabs payload names the dynamic variable consent_scope", () => {
  const body = elevenLabsOutboundPayload({
    agentId: "agent",
    agentPhoneNumberId: "phone",
    to: phone,
    openingLine: "Hi",
    consentScope: "scheduling_only",
  });
  assert.equal(CONSENT_SCOPE_VARIABLE, "consent_scope");
  assert.equal(body.conversation_initiation_client_data.dynamic_variables.consent_scope, "scheduling_only");
  assert.equal(body.conversation_initiation_client_data.conversation_config_override.agent.first_message, "Hi");
});

test("the mock voice refuses a call that has no consent scope", async () => {
  await assert.rejects(
    () => mockVoice.placeCall({ to: phone, contactName: "Ada", agentName: "Avery", openingLine: "Hi", consentScope: "wide" as "full" }),
    /consent scope/,
  );
});

test("test mode keeps the live voice port unselected", () => {
  const previous = process.env.INTEGRATIONS_MODE;
  process.env.INTEGRATIONS_MODE = "live";
  try {
    assert.equal(voiceIsMocked(true), true);
    assert.equal(voiceIsMocked(false), false);
  } finally {
    if (previous === undefined) delete process.env.INTEGRATIONS_MODE;
    else process.env.INTEGRATIONS_MODE = previous;
  }
});

test("the queue shows a skip reason and does not treat an unread live contact as eligible", () => {
  const unread = queueConsentView({
    mocked: false,
    ghlContactId: "c1",
    storedConsent: "high",
    phone,
    consentCheckedAt: null,
    consentHoldReason: null,
    consentScope: null,
  });
  assert.equal(unread.blocked, true);
  assert.match(unread.reason, /has not been read/);

  const skipped = queueConsentView({
    mocked: false,
    ghlContactId: "c1",
    storedConsent: "low",
    phone,
    consentCheckedAt: new Date(),
    consentHoldReason: "Consent tier is Low (cookie consent only). Call not placed.",
    consentScope: null,
  });
  assert.equal(skipped.status, "Skipped");
  assert.match(skipped.reason, /cookie consent only/);

  const preview = queueConsentView({
    mocked: true,
    ghlContactId: null,
    storedConsent: "medium",
    phone,
    consentCheckedAt: null,
    consentHoldReason: null,
    consentScope: null,
  });
  assert.equal(preview.blocked, false);
  assert.match(preview.reason, /scheduling only/i);
});

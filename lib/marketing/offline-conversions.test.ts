import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { offlineConversionsEnabled, offlineConversionsLiveEnabled } from "./config";
import { clientViewerAllowed } from "./client-gate";
import { connectPageModel, conversionAccess, googleOAuthStartUrl, renderConnectPopup } from "./offline/access";
import { extractAttribution, parseOpportunity } from "./offline/click-ids";
import { applyDecision, decisionCardCopy, finalizeDecision, newTurnOnDecision, stagesReady, undoToast, UNDO_MS } from "./offline/decision";
import { hashEmailForGoogle, hashEmailForMeta, hashPhoneForGoogle, hashPhoneForMeta, sha256Hex } from "./offline/hash";
import { conversionLogLine, payloadHasRawPii, redactForLog } from "./offline/log";
import { buildGooglePayload, buildMetaPayload, googleConversionDateTime, metaEventsUrl, googleUploadUrl } from "./offline/payloads";
import { planCycle, planIngest } from "./offline/pipeline";
import { assertConversionUploadUrl, buildWireRequest, executeUploads, isAllowedConversionUpload } from "./offline/send";
import { emptyAttribution, type ClientRecord, type CycleState, type EventRecord, type StageMap } from "./offline/types";
import { buildConversionFeedbackView, matchHint, stoppedSentence } from "./offline/view";
import { parseGhl } from "../webhook-parse";

const NOW = new Date("2026-10-29T16:00:00.000Z");
const EMAIL = "mary.ann@gmail.com";
const PHONE = "+1 (919) 555-0144";
const ROOT = path.resolve(import.meta.dirname, "../..");

function stage(partial: Partial<StageMap> & Pick<StageMap, "kind" | "ghlStageName" | "metaEventName" | "googleAction">): StageMap {
  return {
    id: partial.id ?? partial.kind,
    ghlStageId: partial.ghlStageId ?? "",
    ghlStageName: partial.ghlStageName,
    kind: partial.kind,
    valueCents: partial.valueCents ?? null,
    currency: partial.currency ?? "USD",
    metaEventName: partial.metaEventName,
    googleAction: partial.googleAction,
  };
}

function client(enabledAt: string | null = NOW.toISOString()): ClientRecord {
  return {
    id: "client-1",
    name: "Acme Marine",
    ghlLocationId: "loc_1",
    enabledAt,
    stages: [
      stage({ kind: "qualified", ghlStageName: "Qualified", ghlStageId: "st_qual", metaEventName: "Lead", googleAction: "Qualified lead" }),
      stage({ kind: "booked", ghlStageName: "Booked", ghlStageId: "st_booked", metaEventName: "Schedule", googleAction: "customers/1234567890/conversionActions/111", valueCents: 15000 }),
      stage({ kind: "sold", ghlStageName: "Sold", ghlStageId: "st_sold", metaEventName: "Purchase", googleAction: "customers/1234567890/conversionActions/222", valueCents: 250000 }),
    ],
  };
}

function opportunityBody() {
  return {
    type: "OpportunityStageUpdate",
    locationId: "loc_1",
    id: "opp_1",
    pipelineStageId: "st_booked",
    pipelineStageName: "Booked",
    monetaryValue: 320,
    contact: {
      id: "ghl_1",
      email: EMAIL,
      phone: PHONE,
      attributionSource: {
        fbclid: "IwAR123",
        gclid: "Cj0KCQclick",
        gbraid: "0AAAA",
        wbraid: "wbraid-1",
        utm_source: "google",
        utm_medium: "cpc",
        utm_campaign: "spring",
      },
      customFields: [{ key: "fbp", value: "fb.1.9.999" }],
    },
  };
}

function eventFrom(planEvent: NonNullable<ReturnType<typeof planIngest>["event"]>): EventRecord {
  return planEvent;
}

function emptyState(overrides: Partial<CycleState> = {}): CycleState {
  return { clients: [], decisions: [], events: [], uploads: [], issues: [], alerts: [], ...overrides };
}

test("offline conversion switches default off", () => {
  assert.equal(offlineConversionsEnabled({}), false);
  assert.equal(offlineConversionsLiveEnabled({}), false);
  assert.equal(offlineConversionsLiveEnabled({ MARKETING_OFFLINE_CONVERSIONS_LIVE: "on" }), false);
  assert.equal(offlineConversionsEnabled({ MARKETING_OFFLINE_CONVERSIONS: "on" }), true);
  assert.equal(offlineConversionsLiveEnabled({ MARKETING_OFFLINE_CONVERSIONS: "on", MARKETING_OFFLINE_CONVERSIONS_LIVE: "on" }), true);
});

test("hashes email and phone and never returns the raw value", () => {
  assert.equal(hashEmailForMeta(` ${EMAIL} `), sha256Hex(EMAIL));
  assert.equal(hashEmailForGoogle(EMAIL), sha256Hex("maryann@gmail.com"));
  assert.notEqual(hashEmailForMeta(EMAIL), hashEmailForGoogle(EMAIL));
  assert.equal(hashPhoneForMeta(PHONE), sha256Hex("19195550144"));
  assert.equal(hashPhoneForGoogle(PHONE), sha256Hex("+19195550144"));
  assert.equal(hashEmailForMeta("not-an-email"), "");
  assert.equal(hashPhoneForMeta("123"), "");
  for (const hash of [hashEmailForMeta(EMAIL), hashPhoneForGoogle(PHONE)]) {
    assert.match(hash, /^[a-f0-9]{64}$/);
    assert.equal(hash.includes(EMAIL), false);
    assert.equal(hash.includes("5550144"), false);
  }
});

test("captures click ids and utms from a GoHighLevel opportunity", () => {
  const parsed = parseGhl(opportunityBody());
  assert.equal(parsed.kind, "opportunity");
  if (parsed.kind !== "opportunity") return;
  assert.equal(parsed.opportunityId, "opp_1");
  assert.equal(parsed.stageId, "st_booked");
  assert.equal(parsed.valueCents, 32000);
  assert.equal(parsed.attribution.gclid, "Cj0KCQclick");
  assert.equal(parsed.attribution.fbclid, "IwAR123");
  assert.equal(parsed.attribution.fbp, "fb.1.9.999");
  assert.equal(parsed.attribution.gbraid, "0AAAA");
  assert.equal(parsed.attribution.wbraid, "wbraid-1");
  assert.equal(parsed.attribution.utmSource, "google");
  assert.equal(parsed.attribution.utmMedium, "cpc");
  assert.equal(parsed.attribution.utmCampaign, "spring");
  assert.match(parsed.attribution.fbc, /^fb\.1\.\d+\.IwAR123$/);
  const fromUrl = extractAttribution({ landing: "https://example.com/form?utm_term=repair&utm_content=ad" });
  assert.equal(fromUrl.utmTerm, "repair");
  assert.equal(fromUrl.utmContent, "ad");
});

test("builds Meta and Google payloads with hashes only", () => {
  const parsed = parseOpportunity(opportunityBody(), NOW);
  assert.ok(parsed);
  const plan = planIngest({
    opportunity: parsed!,
    email: EMAIL,
    phone: PHONE,
    clients: [client()],
    contactId: "contact-1",
    existingKeys: [],
    env: { MARKETING_OFFLINE_CONVERSIONS: "on" },
    now: NOW,
    eventId: "evt_1",
  });
  assert.equal(plan.status, "created");
  const event = eventFrom(plan.event!);
  const text = JSON.stringify(plan);
  assert.equal(text.includes(EMAIL), false);
  assert.equal(text.includes("555-0144"), false);
  assert.equal(text.includes("19195550144"), false);
  const meta = buildMetaPayload(event, "Schedule");
  const google = buildGooglePayload(event, "customers/1234567890/conversionActions/111", "1234567890", "America/New_York");
  const payloads = JSON.stringify({ meta, google });
  assert.equal(payloads.includes(EMAIL), false);
  assert.equal(payloads.includes("555-0144"), false);
  assert.equal(payloads.includes("19195550144"), false);
  assert.equal(payloads.includes("mary"), false);
  assert.deepEqual(meta.user_data.em, [hashEmailForMeta(EMAIL)]);
  assert.deepEqual(meta.user_data.ph, [hashPhoneForMeta(PHONE)]);
  assert.equal(meta.event_name, "Schedule");
  assert.equal(meta.action_source, "system_generated");
  assert.equal((meta.custom_data as { value: number }).value, 320);
  const conversion = (google.conversions as { hashedEmail?: string; conversionValue?: number; gclid?: string; userIdentifiers?: { hashedEmail?: string; hashedPhoneNumber?: string }[] }[])[0];
  assert.equal(conversion.gclid, "Cj0KCQclick");
  assert.equal(conversion.conversionValue, 320);
  assert.equal(conversion.userIdentifiers?.[0]?.hashedEmail, hashEmailForGoogle(EMAIL));
  assert.equal(conversion.userIdentifiers?.[1]?.hashedPhoneNumber, hashPhoneForGoogle(PHONE));
  assert.equal(googleConversionDateTime(new Date("2026-10-28T19:10:00.000Z"), "America/New_York"), "2026-10-28 15:10:00-04:00");
});

test("dry run logs the payload and does not call the network", async () => {
  const parsed = parseOpportunity(opportunityBody(), NOW);
  const plan = planIngest({
    opportunity: parsed!,
    email: EMAIL,
    phone: PHONE,
    clients: [client()],
    contactId: null,
    existingKeys: [],
    env: { MARKETING_OFFLINE_CONVERSIONS: "on" },
    now: NOW,
    eventId: "evt_dry",
  });
  const cycle = planCycle(
    emptyState({ clients: [client()], events: [plan.event!] }),
    { MARKETING_OFFLINE_CONVERSIONS: "on", MARKETING_OFFLINE_CONVERSIONS_LIVE: "on" },
    NOW,
    () => "upl",
  );
  assert.equal(cycle.uploads.length, 2);
  assert.equal(cycle.uploads.every((upload) => upload.send === false), true);
  const lines: string[] = [];
  let called = false;
  const result = await executeUploads({
    uploads: cycle.uploads,
    env: { MARKETING_OFFLINE_CONVERSIONS: "on" },
    fetchImpl: async () => {
      called = true;
      throw new Error("network");
    },
    log: (line) => lines.push(line),
    now: NOW,
  });
  assert.equal(called, false);
  assert.equal(result.sent, 0);
  assert.ok(lines.length >= 2);
  const joined = lines.join("\n");
  assert.match(joined, /dry_run/);
  assert.match(joined, /evt_dry/);
  assert.equal(joined.includes(EMAIL), false);
  assert.equal(joined.includes("555-0144"), false);
  assert.equal(joined.toLowerCase().includes("access_token"), false);
  assert.equal(result.uploads.every((upload) => upload.status === "dry_run"), true);
});

test("live send posts only conversion uploads and blocks raw contact details", async () => {
  const parsed = parseOpportunity(opportunityBody(), NOW);
  const ingested = planIngest({
    opportunity: parsed!,
    email: EMAIL,
    phone: PHONE,
    clients: [client()],
    contactId: null,
    existingKeys: [],
    env: { MARKETING_OFFLINE_CONVERSIONS: "on" },
    now: NOW,
    eventId: "evt_live",
  });
  const env = {
    MARKETING_OFFLINE_CONVERSIONS: "on",
    MARKETING_OFFLINE_CONVERSIONS_LIVE: "on",
    META_DATASET_ID: "1099",
    META_CAPI_ACCESS_TOKEN: "meta-token-secret",
    GOOGLE_ADS_DEVELOPER_TOKEN: "dev-token-secret",
    GOOGLE_ADS_CUSTOMER_ID: "123-456-7890",
    GOOGLE_ADS_ACCESS_TOKEN: "google-token-secret",
    GOOGLE_ADS_API_VERSION: "v18",
  };
  const cycle = planCycle(emptyState({ clients: [client()], events: [ingested.event!] }), env, NOW, () => "upl-live");
  assert.equal(cycle.uploads.every((upload) => upload.send), true);
  const urls: string[] = [];
  const lines: string[] = [];
  const result = await executeUploads({
    uploads: cycle.uploads,
    env,
    fetchImpl: async (input, init) => {
      const url = String(input);
      urls.push(url);
      assertConversionUploadUrl(url);
      const body = JSON.parse(String(init?.body));
      assert.equal(JSON.stringify(body).includes(EMAIL), false);
      const headers = JSON.stringify(init?.headers ?? {});
      if (url.includes("googleads.googleapis.com")) assert.match(headers, /dev-token-secret/);
      else assert.equal(headers.includes("dev-token-secret"), false);
      return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
    },
    log: (line) => lines.push(line),
    now: NOW,
  });
  assert.equal(result.sent, 2);
  assert.deepEqual(urls.sort(), [
    "https://googleads.googleapis.com/v18/customers/1234567890:uploadClickConversions",
    "https://graph.facebook.com/v23.0/1099/events",
  ].sort());
  const joined = lines.join("\n");
  assert.equal(joined.includes(EMAIL), false);
  assert.equal(joined.includes("meta-token-secret"), false);
  assert.equal(joined.includes("google-token-secret"), false);
  assert.equal(joined.includes("dev-token-secret"), false);
  const wire = buildWireRequest("meta", cycle.uploads[0].payload, env, env.META_CAPI_ACCESS_TOKEN);
  assert.equal("url" in wire, true);
  if ("url" in wire) {
    assert.equal(isAllowedConversionUpload(wire.url), true);
    assert.equal(JSON.stringify(wire.logBody).includes("meta-token-secret"), false);
  }
  const blocked = await executeUploads({
    uploads: [{ ...cycle.uploads[0], id: "bad", payload: { user_data: { em: [EMAIL] } }, send: true }],
    env,
    fetchImpl: async () => {
      throw new Error("should not send");
    },
    log: () => {},
    now: NOW,
  });
  assert.equal(blocked.uploads[0]?.errorCode, "raw_pii_blocked");
  assert.equal(blocked.sent, 0);
});

test("refuses every ad-account change that is not a conversion upload", () => {
  const refused = [
    "https://googleads.googleapis.com/v18/customers/123/campaignBudgets:mutate",
    "https://googleads.googleapis.com/v18/customers/123/campaigns:mutate",
    "https://googleads.googleapis.com/v18/customers/123/adGroupCriteria:mutate",
    "https://googleads.googleapis.com/v18/customers/123:uploadConversionAdjustments",
    "https://graph.facebook.com/v23.0/act_1/campaigns",
    "https://graph.facebook.com/v23.0/1099/events?access_token=secret",
    "http://graph.facebook.com/v23.0/1099/events",
    "https://googleads.googleapis.com.evil.com/v18/customers/1:uploadClickConversions",
    "https://evil.googleads.googleapis.com/v18/customers/1:uploadClickConversions",
  ];
  for (const url of refused) {
    assert.equal(isAllowedConversionUpload(url), false, url);
    assert.throws(() => assertConversionUploadUrl(url), /conversion upload/);
  }
  assert.equal(isAllowedConversionUpload(metaEventsUrl({ META_DATASET_ID: "1099" })), true);
  assert.equal(isAllowedConversionUpload(googleUploadUrl({ GOOGLE_ADS_CUSTOMER_ID: "1234567890" })), true);
  const offlineDir = path.join(ROOT, "lib/marketing/offline");
  const banned = ["campaignBudgets", "adGroupCriteria", "campaigns:mutate", "uploadConversionAdjustments", "keywords:mutate"];
  for (const file of readdirSync(offlineDir)) {
    const source = readFileSync(path.join(offlineDir, file), "utf8");
    for (const word of banned) assert.equal(source.includes(word), false, `${file} ${word}`);
    if (file !== "log.ts") assert.equal(source.includes("console.log"), false, file);
  }
});

test("the yes card does nothing until the undo window closes", () => {
  const decision = newTurnOnDecision("client-1", NOW, "dec-1");
  assert.equal(stagesReady(["qualified", "booked", "sold"]), true);
  assert.equal(stagesReady(["qualified"]), false);
  const copy = decisionCardCopy("Acme Marine", true);
  assert.match(copy.headline, /Acme Marine/);
  assert.match(`${copy.tag} ${copy.fix} ${copy.impact} ${copy.confidence} ${copy.evidence}`, /Show evidence|stage map|hashed/i);
  const approved = applyDecision(decision, "approve", NOW, "user-1");
  assert.equal(approved.status, "accepted");
  assert.equal(finalizeDecision(approved, new Date(NOW.getTime() + UNDO_MS - 1000)).enable, false);
  const undone = applyDecision(approved, "undo", new Date(NOW.getTime() + 10_000), "user-1");
  assert.equal(undone.status, "pending");
  assert.equal(finalizeDecision(undone, new Date(NOW.getTime() + UNDO_MS + 1000)).enable, false);
  const again = applyDecision(undone, "approve", NOW, "user-1");
  const finished = finalizeDecision(again, new Date(NOW.getTime() + UNDO_MS + 1));
  assert.equal(finished.enable, true);
  assert.equal(finished.decision.undoUntil, null);
  const declined = applyDecision(decision, "decline", NOW, "user-1");
  assert.equal(finalizeDecision(declined, new Date(NOW.getTime() + UNDO_MS + 1)).enable, false);
  assert.equal(undoToast(30), "Approved. Undo · 30s");
  const state = emptyState({
    clients: [client(null)],
    decisions: [again],
  });
  const waiting = planCycle(state, { MARKETING_OFFLINE_CONVERSIONS: "on" }, new Date(NOW.getTime() + 1000));
  assert.equal(waiting.enabled.length, 0);
  const ready = planCycle(state, { MARKETING_OFFLINE_CONVERSIONS: "on" }, new Date(NOW.getTime() + UNDO_MS + 1));
  assert.equal(ready.enabled[0]?.clientId, "client-1");
});

test("a client stays dark until it is turned on, and unmapped stages are counted", () => {
  const parsed = parseOpportunity(opportunityBody(), NOW)!;
  const off = planIngest({
    opportunity: parsed,
    email: EMAIL,
    phone: PHONE,
    clients: [client(null)],
    contactId: "c1",
    existingKeys: [],
    env: { MARKETING_OFFLINE_CONVERSIONS: "on" },
    now: NOW,
  });
  assert.equal(off.status, "not_enabled");
  assert.equal(off.event, null);
  const unmapped = planIngest({
    opportunity: { ...parsed, stageId: "st_other", stageName: "Nurture" },
    email: EMAIL,
    phone: PHONE,
    clients: [client()],
    contactId: "c1",
    existingKeys: [],
    env: { MARKETING_OFFLINE_CONVERSIONS: "on" },
    now: NOW,
  });
  assert.equal(unmapped.status, "unmapped");
  assert.equal(unmapped.issue?.code, "unmapped_stage");
  assert.equal(JSON.stringify(unmapped).includes(EMAIL), false);
  const flagged = planIngest({
    opportunity: parsed,
    email: EMAIL,
    phone: PHONE,
    clients: [client()],
    contactId: null,
    existingKeys: [],
    env: {},
    now: NOW,
  });
  assert.equal(flagged.status, "flag_off");
});

test("match rate, errors, and values stay staff-only", () => {
  assert.equal(matchHint(78), "Good: above 70%");
  assert.equal(matchHint(40), "Low: below 70%");
  assert.match(stoppedSentence("Google", new Date("2026-10-28T19:10:00.000Z"), "America/New_York"), /Google stopped accepting our updates on Oct 28 at 3:10 PM ET\. Reconnect to resume\./);
  const parsed = parseOpportunity({ ...opportunityBody(), contact: { id: "ghl_2", email: "", phone: "" } }, NOW)!;
  const bare = planIngest({
    opportunity: { ...parsed, opportunityId: "opp_bare" },
    email: "",
    phone: "",
    clients: [client()],
    contactId: null,
    existingKeys: [],
    env: { MARKETING_OFFLINE_CONVERSIONS: "on" },
    now: NOW,
    eventId: "evt_bare",
  });
  const rich = planIngest({
    opportunity: parseOpportunity(opportunityBody(), NOW)!,
    email: EMAIL,
    phone: PHONE,
    clients: [client()],
    contactId: null,
    existingKeys: [],
    env: { MARKETING_OFFLINE_CONVERSIONS: "on" },
    now: NOW,
    eventId: "evt_rich",
  });
  const state = emptyState({
    clients: [client()],
    events: [bare.event!, rich.event!],
    issues: [{ id: "iss", clientId: "client-1", code: "unmapped_stage", platform: "", occurredAt: NOW.toISOString() }],
  });
  const staff = buildConversionFeedbackView({ state, env: { MARKETING_OFFLINE_CONVERSIONS: "on" }, now: NOW, seesValue: true });
  const hidden = buildConversionFeedbackView({ state, env: { MARKETING_OFFLINE_CONVERSIONS: "on" }, now: NOW, seesValue: false });
  const meta = staff.platforms.find((row) => row.platform === "meta");
  assert.equal(meta?.statusLabel, "Dry run");
  assert.equal(meta?.matchRate, 50);
  assert.equal(meta?.matchHint, "Low: below 70%");
  assert.match(meta?.errors.find((error) => error.code === "no_email_or_phone")?.cause ?? "", /1 lead had no email or phone/);
  assert.match(meta?.errors.find((error) => error.code === "no_email_or_phone")?.fix ?? "", /Make phone required on the form/);
  assert.match(meta?.technicalDetails ?? "", /no_email_or_phone 1/);
  assert.equal((meta?.technicalDetails ?? "").includes(EMAIL), false);
  assert.equal((meta?.technicalDetails ?? "").includes("payload"), false);
  assert.match(JSON.stringify(staff), /valueCents|Value \$/);
  const hiddenText = JSON.stringify(hidden);
  assert.equal(hiddenText.includes("valueCents"), false);
  assert.equal(hiddenText.includes("Value $"), false);
  assert.equal(hiddenText.includes("$"), false);
  assert.equal(staff.emptyCopy, "Send your qualified leads back to Meta and Google so they find more people like them.");
  const clients = ["client_viewer", "owner", "admin", "viewer"];
  for (const role of clients) assert.equal(conversionAccess({ role, email: `${role}@example.com` }).ok, false, role);
  const manager = conversionAccess({ role: "account_manager", email: "am@example.com" });
  const admin = conversionAccess({ role: "super_admin", email: "sa@example.com" });
  assert.equal(manager.ok && manager.seesValue && manager.edit === false && manager.reconnectGoogle === false, true);
  assert.equal(admin.ok && admin.edit && admin.seesValue && admin.reconnectGoogle, true);
  for (const route of ["/settings/conversions", "/api/marketing/conversions", "/api/marketing/conversions/connect/meta", "/api/marketing/conversions/connect/google/callback"]) {
    assert.equal(clientViewerAllowed(route), false, route);
  }
});

test("alerts cool down for a day and rise when sending stops", () => {
  const base = client();
  const events = [];
  for (let i = 0; i < 5; i += 1) {
    events.push(sampleEvent(`old-${i}`, new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(), true));
    events.push(sampleEvent(`new-${i}`, new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(), i < 2));
  }
  const env = { MARKETING_OFFLINE_CONVERSIONS: "on" };
  const first = planCycle(emptyState({ clients: [base], events }), env, NOW, sequence());
  const warning = first.alerts.find((alert) => alert.code === "match_rate_drop");
  assert.equal(warning?.severity, "warning");
  const second = planCycle(emptyState({ clients: [base], events, alerts: first.alerts }), env, new Date(NOW.getTime() + 60_000), sequence());
  assert.equal(second.alerts.length, 0);
  const sentAt = new Date(NOW.getTime() - 7 * 60 * 60 * 1000).toISOString();
  const liveEnv = {
    ...env,
    MARKETING_OFFLINE_CONVERSIONS_LIVE: "on",
    META_DATASET_ID: "1099",
    META_CAPI_ACCESS_TOKEN: "token",
  };
  const stopped = planCycle(
    emptyState({
      clients: [base],
      events,
      uploads: [
        {
          id: "sent-1",
          eventId: events[0]!.id,
          platform: "meta",
          status: "sent",
          payload: {},
          attempts: 1,
          errorCode: "",
          errorMessage: "",
          createdAt: sentAt,
          sentAt,
        },
      ],
    }),
    liveEnv,
    NOW,
    sequence(),
  );
  assert.equal(stopped.alerts.some((alert) => alert.code === "sending_stopped" && alert.severity === "critical"), true);
});

test("reconnect never asks for a password", () => {
  const access = conversionAccess({ role: "super_admin", email: "sa@example.com" });
  assert.equal(access.ok, true);
  if (!access.ok) return;
  const google = connectPageModel("google", access, { GOOGLE_ADS_CLIENT_ID: "client" }, "https://app.example.com/callback");
  const html = renderConnectPopup(google);
  assert.equal(google.asksForPassword, false);
  assert.equal(/type="password"/i.test(html), false);
  assert.equal(/<input/i.test(html), false);
  assert.match(html, /never asks for your password/i);
  const start = googleOAuthStartUrl({ GOOGLE_ADS_CLIENT_ID: "client" }, "https://app.example.com/callback");
  assert.match(start ?? "", /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
  const scope = new URL(start ?? "").searchParams.get("scope");
  assert.equal(scope, "https://www.googleapis.com/auth/adwords");
  const manager = conversionAccess({ role: "account_manager", email: "am@example.com" });
  if (!manager.ok) return;
  const blocked = connectPageModel("google", manager, { GOOGLE_ADS_CLIENT_ID: "client" }, "https://app.example.com/callback");
  assert.equal(blocked.redirectUrl, null);
  assert.match(blocked.body, /super admin reconnects Google/);
});

test("the migration only adds columns and tables", () => {
  const sql = readFileSync(path.join(ROOT, "prisma/migrations/20261029230000_offline_conversions/migration.sql"), "utf8");
  assert.match(sql, /ADD COLUMN "gclid"/);
  assert.match(sql, /ADD COLUMN "fbclid"/);
  assert.match(sql, /CREATE TABLE "ConversionEvent"/);
  assert.match(sql, /CREATE TABLE "ConversionUpload"/);
  assert.equal(/\bDROP\b|\bDELETE FROM\b|\bTRUNCATE\b|ALTER COLUMN/i.test(sql), false);
});

test("redaction removes raw contact details from a log line", () => {
  const line = conversionLogLine({
    mode: "dry_run",
    platform: "meta",
    status: "dry_run",
    eventId: "evt",
    uploadId: "upl",
    payload: { user_data: { em: [hashEmailForMeta(EMAIL)] }, email: EMAIL, access_token: "secret", note: `reach ${EMAIL}` },
  });
  assert.equal(line.includes(EMAIL), false);
  assert.equal(line.includes("secret"), false);
  assert.equal(line.includes(hashEmailForMeta(EMAIL)), true);
  assert.equal(payloadHasRawPii({ email: EMAIL }), true);
  assert.equal(payloadHasRawPii({ em: [hashEmailForMeta(EMAIL)] }), false);
  assert.equal(JSON.stringify(redactForLog({ phone: PHONE })).includes("555"), false);
});

function sampleEvent(id: string, occurredAt: string, matched: boolean): EventRecord {
  return {
    id,
    clientId: "client-1",
    contactId: null,
    source: "ghl",
    externalId: id,
    kind: "booked",
    stageName: "Booked",
    valueCents: 1000,
    currency: "USD",
    ...emptyAttribution(),
    fbc: matched ? "fb.1.1.click" : "",
    emailHashMeta: matched ? "a".repeat(64) : "",
    emailHashGoogle: "",
    phoneHashMeta: "",
    phoneHashGoogle: "",
    occurredAt,
  };
}

function sequence() {
  let n = 0;
  return () => `id-${n++}`;
}

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { acceptAgencyWaitlist } from "./agency-waitlist";
import {
  WAITLIST_ALERT_SUBJECT,
  WAITLIST_GHL_SOURCE,
  WAITLIST_GHL_TAGS,
  backfillAgencyWaitlist,
  syncAgencyWaitlist,
  waitlistAlertMessage,
  waitlistNote,
  type AgencyWaitlistLead,
  type AgencyWaitlistSyncPatch,
} from "./agency-waitlist-sync";
import { GHL_UPSERT_URL, type SyncLog } from "./homepage-contact-sync";

const KEY = "ghl-api-key-value";
const RESEND = "re_test_key_value";
const NOW = new Date("2026-11-12T15:00:00.000Z");

const lead: AgencyWaitlistLead = {
  id: "wait-1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  agencyName: "North",
  website: "https://north.example",
  clientCount: "6-20",
  monthlySpend: "Under 25,000",
  message: "We run client campaigns.",
};

function env(extra: Record<string, string | undefined> = {}) {
  return {
    PUBLIC_HOMEPAGE: "on",
    GHL_API_KEY: KEY,
    GHL_LOCATION_ID: "loc_test",
    DEMO_ALERT_TO: "Jason@SpecificityInc.com, britt@specificityinc.com",
    RESEND_API_KEY: RESEND,
    MAIL_FROM: "jai@specificityinc.com",
    ...extra,
  };
}

function header(init: RequestInit | undefined, name: string) {
  return new Headers(init?.headers).get(name);
}

function bodyOf(init: RequestInit | undefined) {
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

type Call = { url: string; init?: RequestInit };

function harness(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const updates: AgencyWaitlistSyncPatch[] = [];
  const log: SyncLog = {
    warn(message) {
      warnings.push(message);
    },
    error(message) {
      errors.push(message);
    },
  };
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const call = { url, init };
    calls.push(call);
    return handler(call);
  };
  return {
    calls,
    warnings,
    errors,
    updates,
    options: {
      env: env(),
      fetchImpl,
      log,
      now: () => NOW,
      update: async (_id: string, data: AgencyWaitlistSyncPatch) => {
        updates.push(data);
      },
    },
  };
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function okFetch(call: Call) {
  if (call.url === GHL_UPSERT_URL) return json({ contact: { id: "ghl_wait_1" } });
  if (call.url.endsWith("/notes")) return json({ id: "note_1" });
  if (call.url === "https://api.resend.com/emails") return json({ id: "email_1" });
  return new Response("missing", { status: 404 });
}

test("the waitlist note and alert use only collected fields", () => {
  assert.equal(waitlistNote({ clientCount: "", monthlySpend: "", message: "" }), "");
  assert.match(waitlistNote(lead), /Clients: 6-20/);
  assert.match(waitlistNote(lead), /Monthly ad spend: Under 25,000/);
  assert.match(waitlistNote(lead), /We run client campaigns\./);
  const mail = waitlistAlertMessage({ ...lead, website: "", clientCount: "", monthlySpend: "", message: "" });
  assert.equal(mail.subject, WAITLIST_ALERT_SUBJECT);
  assert.match(mail.text, /Website: not provided/);
  assert.match(mail.text, /Clients: not provided/);
  assert.match(mail.text, /Message:\nnot provided/);
  assert.equal(mail.text.includes("—"), false);
  assert.equal(mail.text.includes("jai-demo"), false);
});

test("a saved waitlist signup upserts GoHighLevel with the waitlist tag and emails the alert list", async () => {
  const { calls, warnings, errors, updates, options } = harness(okFetch);
  const result = await syncAgencyWaitlist(lead, options);
  assert.equal(result.ghlContactId, "ghl_wait_1");
  assert.equal(result.ghlError, null);
  assert.equal(result.alertSent, true);
  assert.equal(warnings.length, 0);
  assert.equal(errors.length, 0);

  const upsert = calls.find((call) => call.url === GHL_UPSERT_URL);
  assert.ok(upsert);
  assert.equal(header(upsert.init, "authorization"), `Bearer ${KEY}`);
  assert.deepEqual(bodyOf(upsert.init), {
    locationId: "loc_test",
    email: "ada@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
    name: "Ada Lovelace",
    companyName: "North",
    website: "https://north.example",
    tags: [...WAITLIST_GHL_TAGS],
    source: WAITLIST_GHL_SOURCE,
  });
  assert.equal(JSON.stringify(bodyOf(upsert.init)).includes("jai-demo"), false);
  assert.equal("phone" in bodyOf(upsert.init), false);

  const note = calls.find((call) => call.url.endsWith("/notes"));
  assert.match(String(bodyOf(note?.init).body), /Clients: 6-20/);
  assert.match(String(bodyOf(note?.init).body), /We run client campaigns\./);

  const mailed = bodyOf(calls.find((call) => call.url === "https://api.resend.com/emails")?.init);
  assert.deepEqual(mailed.to, ["jason@specificityinc.com", "britt@specificityinc.com"]);
  assert.equal(mailed.subject, "New jAI agency waitlist signup");
  assert.match(String(mailed.text), /Agency: North/);
  assert.match(String(mailed.text), /https:\/\/north\.example/);
  assert.match(String(mailed.text), /Under 25,000/);
  assert.deepEqual(updates, [{
    ghlContactId: "ghl_wait_1",
    ghlSyncedAt: NOW,
    ghlError: null,
    alertSentAt: NOW,
  }]);

  const bare = harness((call) => {
    if (call.url === GHL_UPSERT_URL) return json({ contact: { id: "ghl_wait_2" } });
    return json({});
  });
  await syncAgencyWaitlist(
    { ...lead, id: "wait-2", name: "Ada", website: "", clientCount: "", monthlySpend: "", message: "" },
    { ...bare.options, env: env({ DEMO_ALERT_TO: "" }) },
  );
  const second = bodyOf(bare.calls.find((call) => call.url === GHL_UPSERT_URL)?.init);
  assert.equal("website" in second, false);
  assert.equal("lastName" in second, false);
  assert.equal(second.companyName, "North");
  assert.deepEqual(second.tags, ["jai-agency-waitlist", "website"]);
  assert.equal(second.source, WAITLIST_GHL_SOURCE);
  assert.equal(bare.calls.some((call) => call.url.endsWith("/notes")), false);
  assert.equal(bare.calls.some((call) => call.url.includes("resend.com")), false);
});

test("a GoHighLevel or mail failure still accepts the visitor", async () => {
  const failed = harness((call) => {
    if (call.url === GHL_UPSERT_URL) return new Response("nope", { status: 503 });
    if (call.url === "https://api.resend.com/emails") return json({ id: "email_1" });
    return new Response("unexpected", { status: 500 });
  });
  const saved: string[] = [];
  const form = await acceptAgencyWaitlist({
    fields: {
      name: " Ada Lovelace ",
      email: "Ada@Example.com",
      agency: " North ",
      website: "north.example",
      clients: "6-20",
      spend: "Under 25,000",
      message: " We run client campaigns. ",
    },
    form: true,
    env: env(),
    store: {
      create: async () => {
        saved.push("save");
        return { id: "wait-1" };
      },
    },
    sync: failed.options,
    now: 20_000,
    ip: "203.0.113.77",
    limits: new Map(),
  });
  assert.deepEqual(form, { status: 303, location: "/?waitlist=saved#agency-waitlist" });
  assert.deepEqual(saved, ["save"]);
  assert.equal(failed.updates[0]?.ghlError, "GoHighLevel upsert failed (503)");
  assert.equal(failed.updates[0]?.alertSentAt?.toISOString(), NOW.toISOString());
  assert.equal(failed.calls.some((call) => call.url.includes("resend.com")), true);

  const mailDown = harness((call) => {
    if (call.url === GHL_UPSERT_URL) return json({ contact: { id: "ghl_wait_3" } });
    if (call.url.endsWith("/notes")) return json({});
    return new Response("nope", { status: 502 });
  });
  const jsonResult = await acceptAgencyWaitlist({
    fields: { name: "Ada", email: "ada@example.com", agency: "North" },
    env: env(),
    store: { create: async () => ({ id: "wait-3" }) },
    sync: mailDown.options,
    now: 30_000,
    ip: "203.0.113.78",
    limits: new Map(),
  });
  assert.deepEqual(jsonResult, { status: 200, id: "wait-3" });
  assert.equal(mailDown.updates[0]?.ghlContactId, "ghl_wait_3");
  assert.equal(mailDown.updates[0]?.ghlError, null);
  assert.equal("alertSentAt" in (mailDown.updates[0] || {}), false);

  const honeypotCalls: string[] = [];
  const hidden = await acceptAgencyWaitlist({
    fields: { name: "Ada", email: "ada@example.com", agency: "North", company_fax: "bot" },
    env: env(),
    store: { create: async () => ({ id: "should-not" }) },
    sync: {
      fetchImpl: async (input) => {
        honeypotCalls.push(String(input));
        return json({});
      },
    },
    now: 40_000,
    ip: "203.0.113.79",
    limits: new Map(),
  });
  assert.deepEqual(hidden, { status: 400, error: "invalid" });
  assert.deepEqual(honeypotCalls, []);
});

test("backfill defaults to a dry run and does not email when applied", async () => {
  const rows = [lead];
  const dry = await backfillAgencyWaitlist({
    apply: false,
    env: env(),
    load: async () => rows,
    fetchImpl: async () => {
      throw new Error("dry run must not call the network");
    },
  });
  assert.deepEqual(dry, { apply: false, candidates: 1, synced: 0, failed: 0 });

  const calls: string[] = [];
  const applied = await backfillAgencyWaitlist({
    apply: true,
    env: env(),
    load: async () => rows,
    log: { warn() {}, error() {} },
    update: async () => {},
    fetchImpl: async (input) => {
      const url = String(input);
      calls.push(url);
      if (url === GHL_UPSERT_URL) return json({ contact: { id: "ghl_backfill" } });
      if (url.endsWith("/notes")) return json({});
      throw new Error(`unexpected ${url}`);
    },
  });
  assert.deepEqual(applied, { apply: true, candidates: 1, synced: 1, failed: 0 });
  assert.equal(calls.some((url) => url.includes("resend.com")), false);

  const source = readFileSync(new URL("./agency-waitlist-sync.ts", import.meta.url), "utf8");
  assert.equal(source.includes("jai-demo"), false);
  assert.match(source, /jai-agency-waitlist/);
  assert.match(source, /jai\.specificityinc\.com Agency waitlist/);
});

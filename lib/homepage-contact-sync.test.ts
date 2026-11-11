import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { acceptHomepageContact } from "./homepage-contact";
import {
  GHL_API_VERSION,
  GHL_SOURCE,
  GHL_UPSERT_URL,
  backfillHomepageContacts,
  demoAlertRecipients,
  splitContactName,
  syncHomepageContact,
  type HomepageContactSyncPatch,
  type SyncLog,
} from "./homepage-contact-sync";

const ROOT = path.resolve(import.meta.dirname, "..");
const TOKEN = "pit-test-token-value";
const RESEND = "re_test_key_value";
const NOW = new Date("2026-11-11T15:00:00.000Z");

const lead = {
  id: "row-1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  company: "North",
  message: "Please show me the demo.",
};

function env(extra: Record<string, string | undefined> = {}) {
  return {
    GHL_API_TOKEN: TOKEN,
    GHL_LOCATION_ID: "loc_test",
    DEMO_ALERT_TO: "Jason@SpecificityInc.com, britt@specificityinc.com, jason@specificityinc.com",
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
  const updates: HomepageContactSyncPatch[] = [];
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
      update: async (_id: string, data: HomepageContactSyncPatch) => {
        updates.push(data);
      },
    },
  };
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function okFetch(call: Call) {
  if (call.url === GHL_UPSERT_URL) return json({ new: true, contact: { id: "ghl_1" } });
  if (call.url === "https://services.leadconnectorhq.com/contacts/ghl_1/notes") return json({ id: "note_1" });
  if (call.url === "https://api.resend.com/emails") return json({ id: "email_1" });
  return new Response("missing", { status: 404 });
}

test("splits a name and a comma-separated alert list", () => {
  assert.deepEqual(splitContactName(" Ada Lovelace "), { firstName: "Ada", lastName: "Lovelace" });
  assert.deepEqual(splitContactName("Ada"), { firstName: "Ada", lastName: "" });
  assert.deepEqual(splitContactName("Mary Anne Smith"), { firstName: "Mary", lastName: "Anne Smith" });
  assert.deepEqual(demoAlertRecipients(" Jason@SpecificityInc.com, britt@specificityinc.com, jason@specificityinc.com, "), [
    "jason@specificityinc.com",
    "britt@specificityinc.com",
  ]);
  assert.deepEqual(demoAlertRecipients("  , not-an-email "), []);
  assert.deepEqual(demoAlertRecipients(undefined), []);
});

test("a saved demo request upserts GoHighLevel and emails every recipient", async () => {
  const { calls, warnings, errors, updates, options } = harness(okFetch);
  const result = await syncHomepageContact(lead, options);
  assert.equal(result.ghlContactId, "ghl_1");
  assert.equal(result.ghlError, null);
  assert.equal(result.alertSent, true);
  assert.equal(warnings.length, 0);
  assert.equal(errors.length, 0);

  const upsert = calls.find((call) => call.url === GHL_UPSERT_URL);
  assert.ok(upsert);
  assert.equal(upsert.init?.method, "POST");
  assert.equal(header(upsert.init, "authorization"), `Bearer ${TOKEN}`);
  assert.equal(header(upsert.init, "version"), GHL_API_VERSION);
  assert.deepEqual(bodyOf(upsert.init), {
    locationId: "loc_test",
    email: "ada@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
    name: "Ada Lovelace",
    companyName: "North",
    tags: ["jai-demo", "website"],
    source: GHL_SOURCE,
  });

  const note = calls.find((call) => call.url.endsWith("/notes"));
  assert.equal(note?.init?.method, "POST");
  assert.equal(header(note?.init, "version"), GHL_API_VERSION);
  assert.deepEqual(bodyOf(note?.init), { body: "Please show me the demo." });

  const mail = calls.find((call) => call.url === "https://api.resend.com/emails");
  const mailed = bodyOf(mail?.init);
  assert.deepEqual(mailed.to, ["jason@specificityinc.com", "britt@specificityinc.com"]);
  assert.equal(mailed.subject, "New demo request from Ada Lovelace");
  assert.match(String(mailed.text), /ada@example.com/);
  assert.match(String(mailed.text), /North/);
  assert.match(String(mailed.text), /Please show me the demo\./);
  assert.deepEqual(updates, [{
    ghlContactId: "ghl_1",
    ghlSyncedAt: NOW,
    ghlError: null,
    alertSentAt: NOW,
  }]);

  const plain = harness((call) => {
    if (call.url === GHL_UPSERT_URL) return json({ contact: { id: "ghl_2" } });
    if (call.url.endsWith("/notes")) return json({});
    return json({});
  });
  await syncHomepageContact({ ...lead, id: "row-2", name: "Ada", company: "" }, { ...plain.options, env: env({ DEMO_ALERT_TO: "" }) });
  const second = bodyOf(plain.calls.find((call) => call.url === GHL_UPSERT_URL)?.init);
  assert.equal(second.firstName, "Ada");
  assert.equal("lastName" in second, false);
  assert.equal("companyName" in second, false);
  assert.equal(plain.calls.some((call) => call.url.includes("resend.com")), false);
  assert.match(plain.warnings.join("\n"), /DEMO_ALERT_TO is unset/);
});

test("a GoHighLevel failure still alerts and still accepts the visitor", async () => {
  const { calls, errors, updates, options } = harness((call) => {
    if (call.url === GHL_UPSERT_URL) return new Response("nope", { status: 503 });
    if (call.url === "https://api.resend.com/emails") return json({ id: "email_1" });
    return new Response("unexpected", { status: 500 });
  });
  const saved: string[] = [];
  let savedFirst = false;
  const form = await acceptHomepageContact({
    fields: { name: " Ada Lovelace ", email: "Ada@Example.com", company: "North", message: " Please show me the demo. " },
    form: true,
    env: { ...env(), PUBLIC_HOMEPAGE: "on" },
    store: {
      create: async () => {
        savedFirst = true;
        saved.push("save");
        return { id: "row-1" };
      },
    },
    sync: {
      ...options,
      fetchImpl: async (input, init) => {
        assert.equal(savedFirst, true);
        return options.fetchImpl(input, init);
      },
    },
  });
  assert.deepEqual(form, { status: 303, location: "/?contact=saved" });
  assert.deepEqual(saved, ["save"]);
  assert.equal(calls.some((call) => call.url.endsWith("/notes")), false);
  assert.equal(calls.some((call) => call.url === "https://api.resend.com/emails"), true);
  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.ghlContactId, null);
  assert.equal(updates[0]?.ghlSyncedAt, null);
  assert.equal(updates[0]?.ghlError, "GoHighLevel upsert failed (503)");
  assert.equal(updates[0]?.alertSentAt, NOW);
  assert.match(errors.join("\n"), /upsert failed \(503\)/);
  assert.equal(errors.join("\n").includes(TOKEN), false);

  const jsonResult = await acceptHomepageContact({
    fields: { name: "Ada", email: "ada@example.com", message: "Hello" },
    env: { ...env(), PUBLIC_HOMEPAGE: "on" },
    store: { create: async () => ({ id: "row-9" }) },
    sync: {
      ...options,
      fetchImpl: async () => {
        throw new Error(`connect failed ${TOKEN}`);
      },
    },
  });
  assert.deepEqual(jsonResult, { status: 200, id: "row-9" });
  const leaked = JSON.stringify(updates) + errors.join("\n");
  assert.equal(leaked.includes(TOKEN), false);
  assert.match(updates[updates.length - 1]?.ghlError || "", /\[redacted\]/);
});

test("a mail failure still keeps the GoHighLevel contact", async () => {
  const { calls, errors, updates, options } = harness((call) => {
    if (call.url === GHL_UPSERT_URL) return json({ contact: { id: "ghl_1" } });
    if (call.url.endsWith("/notes")) return json({ id: "note_1" });
    return new Response("nope", { status: 502 });
  });
  const result = await syncHomepageContact(lead, options);
  assert.equal(result.ghlContactId, "ghl_1");
  assert.equal(result.ghlError, null);
  assert.equal(result.alertSent, false);
  assert.equal(calls.filter((call) => call.url.includes("leadconnectorhq.com")).length, 2);
  assert.equal(updates[0]?.alertSentAt, undefined);
  assert.equal(updates[0]?.ghlContactId, "ghl_1");
  assert.equal(updates[0]?.ghlSyncedAt, NOW);
  assert.match(errors.join("\n"), /demo alert failed \(502\)/);
  assert.equal(errors.join("\n").includes(RESEND), false);
});

test("missing env skips both steps and logs a warning", async () => {
  const { calls, warnings, updates, options } = harness(() => {
    throw new Error("network should not be called");
  });
  const result = await syncHomepageContact(lead, { ...options, env: {} });
  assert.equal(result.ghlAttempted, false);
  assert.equal(result.alertSkipped, true);
  assert.equal(result.alertSent, false);
  assert.equal(calls.length, 0);
  assert.equal(updates.length, 0);
  assert.match(warnings.join("\n"), /GHL_API_TOKEN or GHL_LOCATION_ID is unset/);
  assert.match(warnings.join("\n"), /DEMO_ALERT_TO is unset/);

  const mailOnly = harness(() => {
    throw new Error("network should not be called");
  });
  await syncHomepageContact(lead, { ...mailOnly.options, env: { DEMO_ALERT_TO: "jason@specificityinc.com,britt@specificityinc.com" } });
  assert.equal(mailOnly.calls.length, 0);
  assert.match(mailOnly.warnings.join("\n"), /RESEND_API_KEY or MAIL_FROM is unset/);

  const accepted = await acceptHomepageContact({
    fields: { name: "Ada", email: "ada@example.com", message: "Hello" },
    env: { PUBLIC_HOMEPAGE: "on" },
    store: { create: async () => ({ id: "row-1" }) },
    sync: { ...options, env: {} },
  });
  assert.deepEqual(accepted, { status: 200, id: "row-1" });
});

test("a slow GoHighLevel call stops at the deadline and still returns", async () => {
  const { updates, errors, options } = harness((call) => new Promise((_resolve, reject) => {
    const signal = call.init?.signal;
    const fail = () => reject(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }));
    if (!signal) {
      fail();
      return;
    }
    if (signal.aborted) fail();
    else signal.addEventListener("abort", fail, { once: true });
  }));
  const result = await syncHomepageContact(lead, { ...options, timeoutMs: 50 });
  assert.equal(result.ghlContactId, null);
  assert.match(result.ghlError || "", /timed out/);
  assert.equal(result.alertSent, false);
  assert.equal(updates[0]?.ghlError?.includes(TOKEN), false);
  assert.equal(errors.join("\n").includes(TOKEN), false);
});

test("backfill stays dry until apply and does not send the alert", async () => {
  const rows = [lead];
  let fetches = 0;
  const dry = await backfillHomepageContacts({
    load: async () => rows,
    fetchImpl: async () => {
      fetches += 1;
      return json({});
    },
  });
  assert.deepEqual(dry, { apply: false, candidates: 1, synced: 0, failed: 0 });
  assert.equal(fetches, 0);

  const calls: string[] = [];
  const applied = await backfillHomepageContacts({
    apply: true,
    env: env({ DEMO_ALERT_TO: "jason@specificityinc.com,britt@specificityinc.com" }),
    now: () => NOW,
    load: async () => rows,
    update: async () => {},
    fetchImpl: async (input) => {
      const url = String(input);
      calls.push(url);
      if (url === GHL_UPSERT_URL) return json({ contact: { id: "ghl_1" } });
      if (url.endsWith("/notes")) return json({});
      return new Response("mail should not be sent", { status: 500 });
    },
  });
  assert.deepEqual(applied, { apply: true, candidates: 1, synced: 1, failed: 0 });
  assert.equal(calls.some((url) => url.includes("resend.com")), false);
  assert.equal(calls.filter((url) => url === GHL_UPSERT_URL).length, 1);

  const skipped = await backfillHomepageContacts({
    apply: true,
    env: {},
    load: async () => rows,
    log: { warn() {}, error() {} },
    fetchImpl: async () => {
      throw new Error("should not be called");
    },
  });
  assert.deepEqual(skipped, { apply: true, candidates: 1, synced: 0, failed: 0 });

  const example = readFileSync(path.join(ROOT, ".env.example"), "utf8");
  assert.match(example, /DbcsZg79I6sNbzpaN1Go/);
  assert.match(example, /jason@specificityinc.com,britt@specificityinc.com/);
  const source = readFileSync(path.join(ROOT, "lib/homepage-contact-sync.ts"), "utf8");
  assert.equal(source.includes("DbcsZg79I6sNbzpaN1Go"), false);
  assert.equal(source.includes("jason@specificityinc.com"), false);
});

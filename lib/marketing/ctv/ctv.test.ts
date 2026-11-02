import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { clientViewerAllowed } from "../client-gate";
import { ctvAttributionEnabled, decideCtvAttribution } from "../config";
import { STACKADAPT_ENDPOINT, stackAdaptGet } from "../connectors/stackadapt-client";
import { getCtvAdapter } from "./adapter";
import { CTV_EXAMPLE_SPEND, CTV_EXAMPLE_VENDOR, exampleCtvPull, exampleStackAdaptBodies } from "./fixtures";
import { costPerIncremental, incrementalLift, planMaidHoldout, recommendFromLift } from "./incrementality";
import { hashIp } from "./quality";
import { parseDeliveryRows, parseExposures, parseNativeWindow } from "./parse";
import { buildCtvView, ctvHttpDecision, ctvPayloadForViewer, ctvPlatformLabel } from "./report";
import { memoryCtvStore, runCtvAttributionSync } from "./sync";
import { prepareCtvRecords } from "./store";
import { defaultIsVerifiedHuman, verificationStatus } from "./verified";
import { linkTouchpoints as linkIdentity } from "./identity";
import { creditConversions, jasonWindows } from "./windows";
import type { CtvConversion, CtvExposure, CtvPull } from "./types";

const ROOT = path.resolve(import.meta.dirname, "../../..");

function keysOf(value: unknown, keys: string[] = []) {
  if (Array.isArray(value)) {
    for (const item of value) keysOf(item, keys);
    return keys;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      keys.push(key.toLowerCase());
      keysOf(child, keys);
    }
  }
  return keys;
}

test("CTV attribution stays off and mock mode makes no outbound call", async () => {
  assert.equal(ctvAttributionEnabled({}), false);
  assert.equal(decideCtvAttribution({}).action, "skip");
  assert.equal(decideCtvAttribution({ CTV_ATTRIBUTION: "on", INTEGRATIONS_MODE: "mock", STACKADAPT_API_KEY: "secret" }).action, "mock");
  assert.equal(decideCtvAttribution({ CTV_ATTRIBUTION: "on", INTEGRATIONS_MODE: "live" }).action, "mock");
  assert.equal(decideCtvAttribution({ CTV_ATTRIBUTION: "on", INTEGRATIONS_MODE: "live", STACKADAPT_API_KEY: "secret" }).action, "live");
  assert.match(readFileSync(path.join(ROOT, ".env.example"), "utf8"), /CTV_ATTRIBUTION=off/);
  assert.match(readFileSync(path.join(ROOT, "prisma/migrations/20261031130000_ctv_attribution/migration.sql"), "utf8"), /CREATE TABLE IF NOT EXISTS/);
  assert.equal(clientViewerAllowed("/marketing/ctv"), false);
  let calls = 0;
  const store = memoryCtvStore();
  const saved = await runCtvAttributionSync({
    env: { CTV_ATTRIBUTION: "on", INTEGRATIONS_MODE: "mock", STACKADAPT_API_KEY: "secret" },
    store,
    fetchImpl: async () => {
      calls += 1;
      return Response.json({});
    },
  });
  assert.equal(calls, 0);
  assert.equal(saved.outbound, 0);
  assert.equal(saved.status, "succeeded");
  assert.equal(store.saved?.view.exampleData, true);
  assert.equal(store.saved?.holdouts.every((row) => row.uploaded === false), true);
  assert.equal(store.saved?.view.segments.every((row) => row.changesSpend === false && row.writesAds === false && row.recommendationOnly), true);
});

test("the StackAdapt CTV pull is GET only and keeps the budget lock", async () => {
  let calls = 0;
  await assert.rejects(
    () => stackAdaptGet({
      apiKey: "secret-key",
      path: "/delivery",
      query: { daily_budget: "9" },
      fetchImpl: async () => {
        calls += 1;
        return Response.json({});
      },
    }),
    /Blocked a budget/,
  );
  assert.equal(calls, 0);
  await assert.rejects(() => stackAdaptGet({ apiKey: "secret-key", path: "/campaign", fetchImpl: async () => Response.json({}) }), /read-only/);
  const seen: { url: string; method: string; auth: string; body: unknown }[] = [];
  const bodies = exampleStackAdaptBodies();
  const store = memoryCtvStore();
  const saved = await runCtvAttributionSync({
    env: { CTV_ATTRIBUTION: "on", INTEGRATIONS_MODE: "live", STACKADAPT_API_KEY: "secret-key", MARKETING_LOOKBACK_DAYS: "1" },
    now: new Date("2026-10-30T15:00:00.000Z"),
    store,
    fetchImpl: async (url, init) => {
      seen.push({ url, method: String(init?.method), auth: String(new Headers(init?.headers).get("x-authorization")), body: init?.body });
      const pathName = new URL(url).pathname;
      if (pathName.endsWith("/delivery")) return Response.json(bodies.delivery);
      if (pathName.endsWith("/conversion_trackers")) return Response.json(bodies.conversionTrackers);
      return new Response("missing", { status: 404 });
    },
  });
  assert.ok(seen.length > 0);
  assert.equal(seen.every((row) => row.method === "GET" && row.body == null && row.auth === "secret-key" && row.url.startsWith("https://api.stackadapt.com/service/v2/")), true);
  assert.equal(saved.view.exampleData, false);
  assert.equal(saved.view.delivery.impressions, 10000);
  assert.equal(saved.view.delivery.spend, 250.25);
  assert.match(saved.view.windows.nativeLabel, /30-day click/);
  assert.equal(saved.view.platformLabel, "CTV (StackAdapt)");
  const client = readFileSync(path.join(ROOT, "lib/marketing/connectors/stackadapt-client.ts"), "utf8");
  assert.match(client, /assertNoAdBudgetWrite\(/);
  assert.match(client, /method: "GET"/);
  assert.equal(STACKADAPT_ENDPOINT, "https://api.stackadapt.com/graphql");
});

test("documented delivery fields map, raw IPs are hashed, and guessed names stay marked", () => {
  const bodies = exampleStackAdaptBodies();
  const parsed = parseDeliveryRows(bodies.delivery);
  assert.equal(parsed.skipped, 1);
  assert.equal(parsed.rows[0]?.campaignId, "cg-harbor");
  assert.equal(parsed.rows[0]?.lineItemId, "c-retirees");
  assert.equal(parsed.rows[0]?.completion25, 8000);
  assert.equal(parsed.rows[0]?.completion50, 7000);
  assert.equal(parsed.rows[0]?.completion75, 6000);
  assert.equal(parsed.rows[0]?.completion100, 5000);
  assert.equal(parsed.rows[0]?.clickConversions, 4);
  assert.equal(parsed.rows[0]?.viewConversions, 3);
  assert.equal(parsed.rows[0]?.conversionValue, 500);
  assert.equal(parsed.rows[0]?.ipConversions, 2);
  assert.equal(parsed.rows[0]?.cookieConversions, 2);
  assert.equal(parsed.rows[0]?.publisher, "Example Streaming App");
  const window = parseNativeWindow(bodies.conversionTrackers);
  assert.equal(window.clickDays, 30);
  assert.equal(window.viewDays, 30);
  const exposures = parseExposures(bodies.exposures);
  assert.equal(exposures[0]?.ipHash, hashIp("203.0.113.10"));
  assert.equal(JSON.stringify(exposures).includes("203.0.113.10"), false);
  const fields = readFileSync(path.join(ROOT, "lib/marketing/ctv/fields.ts"), "utf8");
  assert.match(fields, /TODO\(verify\)/);
  assert.match(fields, /conv_rev/);
  assert.match(fields, /unique_impressions/);
  assert.match(fields, /video_q_1_playbacks/);
  assert.match(fields, /impression_conversions/);
  assert.match(readFileSync(path.join(ROOT, "lib/marketing/ctv/verified.ts"), "utf8"), /TODO\(jason\)/);
  assert.equal(readFileSync(path.join(ROOT, "lib/marketing/ctv/quality.ts"), "utf8").includes("fetch("), false);
  assert.equal(readFileSync(path.join(ROOT, "lib/marketing/ctv/incrementality.ts"), "utf8").includes("fetch("), false);
});

test("Jason's windows, click wins, verified-human, and the sensitivity panel", () => {
  assert.deepEqual(jasonWindows({}), { clickDays: 7, viewDays: 1 });
  assert.deepEqual(jasonWindows({ CTV_CLICK_DAYS: "14", CTV_VIEW_DAYS: "3" }), { clickDays: 14, viewDays: 3 });
  const view = buildCtvView(exampleCtvPull());
  const segment = view.segments[0];
  assert.ok(segment);
  assert.equal(view.platformLabel, "CTV (StackAdapt)");
  assert.equal(view.publicName, "Connected TV ads");
  assert.equal(ctvPlatformLabel("stackadapt"), "CTV (StackAdapt)");
  assert.equal(ctvPlatformLabel("ctv", "client"), "CTV");
  assert.equal(JSON.stringify(view).includes("Other CTV"), false);
  assert.equal(JSON.stringify(view).includes("Trade Desk"), false);
  assert.equal(view.verifiedHumanLabel, "pending Jason confirmation");
  assert.equal(view.windows.clickDays, 7);
  assert.equal(view.windows.viewDays, 1);
  assert.match(view.windows.label, /7-day click, 1-day view/);
  assert.match(view.windows.nativeLabel, /CTV \(StackAdapt\) native/);
  assert.equal(view.sensitivity.changesDefault, false);
  assert.equal(segment.verifiedClickConversions, 2);
  assert.equal(segment.verifiedViewConversions, 1);
  assert.equal(segment.deterministicClickConversions, 2);
  assert.equal(segment.deterministicViewConversions, 0);
  assert.ok((segment.deterministicMatchRate ?? 0) > 0);
  assert.equal(view.sensitivity.view3Days > segment.verifiedViewConversions, true);
  assert.equal(view.funnel.exposedHouseholds, 7);
  assert.equal(view.funnel.siteVisits, 4);
  assert.equal(view.funnel.leadsAndConversions, 3);
  assert.equal(view.assists[0]?.channel, "Google Ads");
  assert.equal(view.assists[0]?.count, 1);
  assert.equal(view.budgetsTouched, false);
  assert.equal(view.exampleData, true);
  assert.equal(view.lag.find((row) => row.id === "1-6h")?.count, 1);
  assert.equal(view.lag.find((row) => row.id === "6-24h")?.count, 2);
  const blocked = buildCtvView(exampleCtvPull(), { hook: () => false });
  assert.equal(blocked.funnel.leadsAndConversions, 0);
  assert.equal(verificationStatus({ passesDedupe: true, leadInvolved: true, contactValid: true, crmOrPixelEngaged: true, probabilisticOnly: true }, () => true), "excluded");
  assert.equal(defaultIsVerifiedHuman({ passesDedupe: true, leadInvolved: false, contactValid: null, crmOrPixelEngaged: true, probabilisticOnly: false }), true);
  assert.equal(verificationStatus({ passesDedupe: true, leadInvolved: true, contactValid: true, crmOrPixelEngaged: false, probabilisticOnly: false }), "unflagged");
});

test("identity keeps methods, a 30-day IP lookback, and refuses a probabilistic verified count", () => {
  const pull = exampleCtvPull();
  const old = pull.exposures[1];
  assert.ok(old);
  const exposure: CtvExposure = { ...old, eventId: "ex-old", ts: new Date(Date.parse(old.ts) - 40 * 24 * 60 * 60 * 1000).toISOString() };
  const conversion: CtvConversion = { ...pull.conversions[1], conversionId: "cv-old", ts: old.ts };
  const links = linkIdentity([exposure], [conversion], []);
  assert.equal(links.length, 0);
  const fresh = linkIdentity([old], [pull.conversions[1]], pull.households);
  assert.equal(fresh[0]?.matchMethod, "ip_device_graph");
  assert.equal(fresh[0]?.matchConfidence, 0.8);
  const credited = creditConversions(fresh, { clickDays: 7, viewDays: 1 });
  assert.equal(credited.credits[0]?.probabilisticOnly, false);
});

test("holdout is a dry run and lift falls back when there is no holdout", () => {
  assert.throws(() => planMaidHoldout({ maidListId: "list", householdIds: ["a", "b"], upload: true }), /dry run/);
  const plan = planMaidHoldout({ maidListId: "list-retirees", householdIds: Array.from({ length: 80 }, (_, index) => `hh-${index}`) });
  assert.equal(plan.uploaded, false);
  assert.equal(plan.writesPlatform, false);
  assert.equal(plan.percent, 10);
  assert.ok(plan.assignments.some((row) => row.role === "holdout"));
  assert.ok(plan.assignments.some((row) => row.role === "exposed"));
  const lift = incrementalLift({ exposedHouseholds: 1000, exposedVerified: 50, holdoutHouseholds: 100, holdoutVerified: 1 });
  assert.equal(lift.label, "incremental");
  assert.ok((lift.ciLow ?? 0) > 0);
  assert.equal(recommendFromLift(lift), "scale");
  const extra = costPerIncremental(100, lift.lift, 1000);
  assert.ok(extra && extra > 0);
  const none = incrementalLift({ exposedHouseholds: 10, exposedVerified: 2, holdoutHouseholds: 0, holdoutVerified: 0 });
  assert.equal(none.label, "attributed, not incremental");
  assert.equal(recommendFromLift(none), null);
  const ghost = incrementalLift({
    exposedHouseholds: 0,
    exposedVerified: 0,
    holdoutHouseholds: 0,
    holdoutVerified: 0,
    ghostOrPsa: { kind: "ghost_bid", exposedCvr: 0.04, controlCvr: 0.01, exposedTrials: 500, controlTrials: 100 },
  });
  assert.equal(ghost.label, "ghost-bid control");
  assert.equal(ghost.incremental, true);
  const records = prepareCtvRecords(exampleCtvPull());
  assert.equal(records.holdouts.every((row) => row.uploaded === false), true);
  assert.equal(records.view.segments.every((row) => row.changesSpend === false && row.writesAds === false), true);
});

test("client roles and share links lose spend, cost, and identity ids", () => {
  const view = buildCtvView(exampleCtvPull());
  const staff = ctvPayloadForViewer(view, "staff");
  const internal = ctvPayloadForViewer(view, "staff_nocost");
  const client = ctvPayloadForViewer(view, "client");
  const share = ctvPayloadForViewer(view, "share");
  assert.equal(staff.delivery.spend, CTV_EXAMPLE_SPEND);
  assert.equal(staff.segments[0]?.vendorId, CTV_EXAMPLE_VENDOR);
  assert.ok(staff.identity.householdIds.includes("hh-det"));
  for (const payload of [client, share]) {
    const names = keysOf(payload);
    for (const key of ["spend", "cost", "cpm", "cpa", "cpl", "roas", "costperincrementalverified", "conversionvalue", "vendorid", "iphash", "householdid", "householdids", "iphashes"]) {
      assert.equal(names.includes(key), false, key);
    }
    const text = JSON.stringify(payload);
    assert.equal(payload.platformLabel, "CTV");
    assert.equal(payload.publicName, "Connected TV ads");
    assert.equal(text.includes(CTV_EXAMPLE_VENDOR), false);
    assert.equal(text.includes("hh-det"), false);
    assert.equal(text.includes(String(CTV_EXAMPLE_SPEND)), false);
    assert.equal(text.includes("StackAdapt"), false);
    assert.equal(text.includes("Other CTV"), false);
    assert.equal(text.includes("Trade Desk"), false);
  }
  const internalNames = keysOf(internal);
  assert.equal(internalNames.includes("spend"), false);
  assert.equal(internalNames.includes("vendorid"), true);
  assert.equal(ctvHttpDecision({ enabled: false, kind: "super_admin" }).status, 404);
  assert.equal(ctvHttpDecision({ enabled: true, kind: "client_viewer" }).status, 403);
  assert.equal(ctvHttpDecision({ enabled: true, kind: "client_owner" }).status, 403);
  assert.equal(ctvHttpDecision({ enabled: true, kind: "super_admin", seesCost: true }).audience, "staff");
  assert.equal(ctvHttpDecision({ enabled: true, share: true, kind: "none" }).audience, "share");
  assert.equal(getCtvAdapter("stackadapt").label, "CTV (StackAdapt)");
  assert.equal(internal.platformLabel, "CTV (StackAdapt)");
});

test("CTV stays StackAdapt only in the staff label", () => {
  const pull: CtvPull = { ...exampleCtvPull(), platform: "stackadapt" };
  assert.equal(buildCtvView(pull).platformLabel, "CTV (StackAdapt)");
});

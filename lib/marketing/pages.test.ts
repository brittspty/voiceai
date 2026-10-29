import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { pageAutoPauseEnabled, pageMonitorEnabled } from "./config";
import { evaluatePage, gateAlert, downConfirmed, pauseReady, recovered, clientDownCopy, clientStatusSentence, pausedHeadline, RESUMED_HEADLINE, CLIENT_PAUSED, uptimeReport, checkedLabel, nextProbeAt, HEALTHY_INTERVAL_MS, CONFIRM_INTERVAL_MS, monitorStale, dedupeKey, pushAllowed, inQuietHours } from "./pages/policy";
import type { AdRow, AlertDraft, PageSample, PriorAlert, TrackedPause } from "./pages/policy";
import { analyzeHtml, canonicalPageUrl, classifySample, destinationMatches, formTargetIssue, isMonitorTestLead, probePage, publicUrlIssue, withoutMonitorTestLeads } from "./pages/probe";
import { presentLandingScreen } from "./pages/view";
import { adStatusPatch, collectKeys, credentialFor, dryRunLog, googleMutateBody, metaStatusBody, performWrite, reviewWrite, secretRefIssue, shouldRetryLive, type WritePlan } from "./pages/writes";
import { runPageMonitor } from "./pages/store";

const ROOT = path.resolve(import.meta.dirname, "../..");
const NOW = new Date("2026-10-29T15:00:00.000Z");
const QUIET = new Date("2026-10-29T02:00:00.000Z");

function ago(ms: number) {
  return new Date(NOW.getTime() - ms).toISOString();
}

function sample(at: string, overrides: Partial<PageSample> = {}): PageSample {
  return {
    at,
    region: "us-east",
    status: "up",
    loadMs: 800,
    ttfbMs: 200,
    httpStatus: 200,
    formPresent: true,
    formSubmitOk: null,
    pixels: { meta: true, gtag: true, gtm: true },
    detail: "",
    ...overrides,
  };
}

const page = { id: "page1", clientKey: "org", name: "Free Inspection", url: "https://example.com/free-inspection" };

function ads(): AdRow[] {
  return [
    { id: "meta1", name: "Free Inspection Video", platform: "meta", externalId: "111", adGroupExternalId: "", customerId: "", status: "active", destinationUrl: "https://www.example.com/free-inspection?utm_source=fb&fbclid=abc" },
    { id: "goog1", name: "Free Inspection Search", platform: "google_ads", externalId: "222", adGroupExternalId: "333", customerId: "1234567890", status: "active", destinationUrl: "https://example.com/free-inspection/" },
    { id: "other", name: "Spring Tune-Up", platform: "meta", externalId: "444", adGroupExternalId: "", customerId: "", status: "active", destinationUrl: "https://example.com/other" },
    { id: "human", name: "Already paused", platform: "meta", externalId: "555", adGroupExternalId: "", customerId: "", status: "paused", destinationUrl: "https://example.com/free-inspection" },
    { id: "tiktok", name: "TikTok cut", platform: "tiktok", externalId: "666", adGroupExternalId: "", customerId: "", status: "active", destinationUrl: "https://example.com/free-inspection" },
  ];
}

function evaluate(overrides: Partial<Parameters<typeof evaluatePage>[0]> = {}) {
  return evaluatePage({
    now: NOW,
    timeZone: "America/New_York",
    page,
    samples: [],
    incidents: [],
    alerts: [],
    ads: ads(),
    tracked: [],
    autoPauseOn: true,
    optIn: true,
    clientAlertOptIn: false,
    mutedUntil: null,
    lastPushAt: null,
    writeMode: { meta: "live", google_ads: "live" },
    ...overrides,
  });
}

function downs() {
  return [
    sample(ago(120_000), { status: "down", region: "us-east", httpStatus: 503, detail: "The server returned 503." }),
    sample(ago(60_000), { status: "down", region: "eu-west", httpStatus: 503 }),
    sample(ago(0), { status: "down", region: "us-east", httpStatus: 503 }),
  ];
}

function pausePlan(overrides: Record<string, unknown> = {}): WritePlan {
  return {
    platform: "meta",
    level: "ad",
    operation: "update_status",
    externalId: "111",
    adGroupExternalId: "",
    customerId: "",
    from: "ACTIVE",
    to: "PAUSED",
    pausedBySystem: false,
    adId: "meta1",
    adName: "Free Inspection Video",
    landingPageId: "page1",
    ...overrides,
  } as WritePlan;
}

function cleanChange(overrides: Record<string, unknown> = {}) {
  const change: Record<string, unknown> = { ...pausePlan(overrides) };
  delete change.adId;
  delete change.adName;
  delete change.landingPageId;
  delete change.trackedId;
  return change;
}

test("page monitor and auto-pause flags default off", () => {
  assert.equal(pageMonitorEnabled({}), false);
  assert.equal(pageAutoPauseEnabled({}), false);
  assert.equal(pageMonitorEnabled({ MARKETING_PAGE_MONITOR: "on" }), true);
  assert.equal(pageAutoPauseEnabled({ MARKETING_PAGE_AUTOPAUSE: "true" }), true);
});

test("a single failed check does not alert or pause", () => {
  const result = evaluate({ samples: [sample(ago(0), { status: "down", region: "us-east" })] });
  assert.equal(result.alerts.length, 0);
  assert.equal(result.plans.length, 0);
  assert.equal(result.displayStatus, "down");
  assert.equal(downConfirmed(result.displayStatus ? [sample(ago(0), { status: "down" })] : []), false);
});

test("two failures in one region do not alert", () => {
  const result = evaluate({
    samples: [sample(ago(60_000), { status: "down", region: "us-east" }), sample(ago(0), { status: "down", region: "us-east" })],
  });
  assert.equal(result.alerts.some((alert) => alert.code === "page_down"), false);
  assert.equal(result.plans.length, 0);
});

test("two regions confirm a down alert and three spaced checks pause only matching ads", () => {
  const confirmed = evaluate({
    samples: [sample(ago(60_000), { status: "down", region: "us-east" }), sample(ago(0), { status: "down", region: "eu-west" })],
  });
  assert.equal(confirmed.alerts.some((alert) => alert.code === "page_down" && alert.severity === "critical"), true);
  assert.equal(confirmed.plans.length, 0);
  assert.equal(confirmed.alerts[0]?.clientSummary, clientDownCopy("Free Inspection"));

  const paused = evaluate({ samples: downs() });
  assert.equal(pauseReady(downs()), true);
  assert.deepEqual(paused.plans.map((plan) => plan.adId).sort(), ["goog1", "meta1"]);
  for (const plan of paused.plans) {
    assert.equal(plan.operation, "update_status");
    assert.equal(plan.level, "ad");
    assert.equal(plan.from, "ACTIVE");
    assert.equal(plan.to, "PAUSED");
    assert.equal(plan.pausedBySystem, false);
    assert.equal(reviewWrite(cleanChange(plan)).ok, true);
  }
  assert.equal(paused.plans.some((plan) => plan.adId === "other" || plan.adId === "human" || plan.adId === "tiktok"), false);
});

test("auto-pause stays off without the flag or the client opt-in", () => {
  assert.equal(evaluate({ samples: downs(), autoPauseOn: false }).plans.length, 0);
  assert.equal(evaluate({ samples: downs(), optIn: false }).plans.length, 0);
  assert.equal(evaluate({ samples: downs(), autoPauseOn: false }).alerts.some((alert) => alert.code === "page_down"), true);
});

test("three failures in one region do not pause", () => {
  const samples = [0, 1, 2].map((step) => sample(ago((2 - step) * 60_000), { status: "down", region: "us-east" }));
  assert.equal(downConfirmed(samples), false);
  assert.equal(evaluate({ samples }).plans.length, 0);
});

test("checks that are not about a minute apart do not pause", () => {
  const samples = [
    sample(ago(600_000), { status: "down", region: "us-east" }),
    sample(ago(300_000), { status: "down", region: "eu-west" }),
    sample(ago(0), { status: "down", region: "us-east" }),
  ];
  assert.equal(pauseReady(samples), false);
  assert.equal(evaluate({ samples }).plans.length, 0);
});

test("two good checks resume only ads this system paused", () => {
  const tracked: TrackedPause[] = [
    { id: "trk", adId: "meta1", mode: "live", resumedAt: null, platform: "meta", externalId: "111", adGroupExternalId: "", customerId: "", adName: "Free Inspection Video" },
  ];
  const result = evaluate({
    samples: [sample(ago(180_000), { status: "down", region: "us-east" }), sample(ago(60_000), { status: "up", region: "eu-west" }), sample(ago(0), { status: "up", region: "us-east" })],
    incidents: [{ id: "inc", kind: "down", status: "open", pauseHeld: false, openedAt: ago(180_000) }],
    tracked,
  });
  assert.equal(recovered(result.displayStatus ? [sample(ago(60_000), { status: "up" }), sample(ago(0), { status: "up" })] : []), true);
  assert.equal(result.resolveIncidents.some((incident) => incident.kind === "down" && incident.summary === "Resolved"), true);
  assert.deepEqual(result.resolveAlertCodes, ["page_down", "ads_paused"]);
  assert.equal(result.plans.length, 1);
  assert.equal(result.plans[0]?.to, "ACTIVE");
  assert.equal(result.plans[0]?.pausedBySystem, true);
  assert.equal(result.plans[0]?.adId, "meta1");
  assert.equal(result.alerts.some((alert) => alert.title === RESUMED_HEADLINE), true);
});

test("a manual hold does not pause the same incident again", () => {
  const result = evaluate({
    samples: downs(),
    incidents: [{ id: "inc", kind: "down", status: "open", pauseHeld: true, openedAt: ago(180_000) }],
  });
  assert.equal(result.plans.length, 0);
});

test("a dry run is recorded once and is not repeated while credentials are missing", () => {
  const first = evaluate({ samples: downs(), writeMode: { meta: "dry_run", google_ads: "dry_run" } });
  assert.equal(first.plans.length, 2);
  const tracked: TrackedPause[] = first.plans.map((plan, index) => ({
    id: `dry${index}`,
    adId: plan.adId,
    mode: "dry_run" as const,
    resumedAt: null,
    platform: plan.platform,
    externalId: plan.externalId,
    adGroupExternalId: plan.adGroupExternalId,
    customerId: plan.customerId,
    adName: plan.adName,
  }));
  const second = evaluate({ samples: downs(), tracked, writeMode: { meta: "dry_run", google_ads: "dry_run" } });
  assert.equal(second.plans.length, 0);
});

test("slow, broken form, and missing pixel alert without pausing ads", () => {
  const slow = evaluate({
    samples: [sample(ago(31 * 60_000), { status: "slow", loadMs: 3800, region: "us-east" }), sample(ago(0), { status: "slow", loadMs: 4000, region: "eu-west" })],
  });
  assert.equal(slow.alerts.some((alert) => alert.code === "page_slow" && alert.severity === "warning" && alert.audience === "staff"), true);
  assert.equal(slow.plans.length, 0);
  assert.equal(evaluate({ samples: [sample(ago(10 * 60_000), { status: "slow" }), sample(ago(0), { status: "slow" })] }).alerts.length, 0);

  const form = evaluate({
    samples: [sample(ago(60_000), { status: "form_broken", formPresent: false }), sample(ago(0), { status: "form_broken", formPresent: false })],
  });
  assert.equal(form.alerts.some((alert) => alert.code === "form_broken" && alert.severity === "critical" && alert.clientSummary === ""), true);
  assert.equal(form.plans.length, 0);
  assert.equal(evaluate({ samples: [sample(ago(0), { status: "form_broken", formPresent: false })] }).alerts.length, 0);

  const pixels = evaluate({
    samples: [sample(ago(60_000)), sample(ago(0), { pixels: { meta: true, gtag: false, gtm: true } })],
  });
  assert.equal(pixels.alerts.some((alert) => alert.code === "pixel_missing" && alert.severity === "warning"), true);
  assert.equal(pixels.plans.length, 0);
  assert.equal(evaluate({ samples: [sample(ago(0), { pixels: { meta: false, gtag: false, gtm: false } })] }).alerts.length, 0);
});

test("alerts are deduped, muted, quiet, and push-limited", () => {
  const prior: PriorAlert[] = [{ dedupeKey: dedupeKey("org", "page1", "page_down"), code: "page_down", severity: "critical", firedAt: ago(10 * 60_000), resolvedAt: null }];
  const again = evaluate({ samples: downs(), alerts: prior });
  assert.equal(again.alerts.some((alert) => alert.code === "page_down"), false);

  const draft: Omit<AlertDraft, "channels"> = {
    dedupeKey: dedupeKey("org", "page1", "page_slow"),
    code: "page_slow",
    severity: "warning",
    title: "Slow",
    summary: "Slow",
    clientSummary: "",
    audience: "staff",
    breaksQuietHours: false,
    evidence: {},
  };
  assert.equal(inQuietHours(QUIET, "America/New_York"), true);
  assert.equal(inQuietHours(NOW, "America/New_York"), false);
  assert.equal(gateAlert({ draft, alerts: [], now: QUIET, timeZone: "America/New_York", mutedUntil: null, clientAlertOptIn: false, lastPushAt: null }), null);
  const critical = gateAlert({
    draft: { ...draft, code: "page_down", severity: "critical", audience: "both", breaksQuietHours: true, clientSummary: clientDownCopy("Free Inspection") },
    alerts: [],
    now: QUIET,
    timeZone: "America/New_York",
    mutedUntil: null,
    clientAlertOptIn: true,
    lastPushAt: ago(5 * 60_000),
  });
  assert.equal(critical?.channels.inApp, true);
  assert.equal(critical?.channels.emailClient, true);
  assert.equal(critical?.channels.push, false);
  assert.equal(pushAllowed(ago(20 * 60_000), NOW.getTime()), true);
  assert.equal(gateAlert({ draft, alerts: [], now: NOW, timeZone: "America/New_York", mutedUntil: new Date(NOW.getTime() + 60_000).toISOString(), clientAlertOptIn: false, lastPushAt: null }), null);

  const resolved: PriorAlert = { dedupeKey: draft.dedupeKey, code: "page_slow", severity: "warning", firedAt: ago(10 * 60_000), resolvedAt: ago(9 * 60_000) };
  assert.equal(gateAlert({ draft, alerts: [resolved], now: NOW, timeZone: "America/New_York", mutedUntil: null, clientAlertOptIn: false, lastPushAt: null }), null);
  const risen = gateAlert({
    draft: { ...draft, severity: "critical" },
    alerts: [{ ...resolved, resolvedAt: null }],
    now: NOW,
    timeZone: "America/New_York",
    mutedUntil: null,
    clientAlertOptIn: false,
    lastPushAt: null,
  });
  assert.equal(risen?.severity, "critical");
});

test("the write allowlist blocks every change except ad status", () => {
  const blocked = [
    cleanChange({ daily_budget: "1000" }),
    cleanChange({ lifetime_budget: "50" }),
    cleanChange({ bid_amount: "1" }),
    cleanChange({ bid_strategy: "LOWEST_COST" }),
    cleanChange({ targeting: { geo: "US" } }),
    cleanChange({ creative: { id: "9" } }),
    cleanChange({ name: "Renamed" }),
    cleanChange({ level: "campaign" }),
    cleanChange({ level: "ad_group" }),
    cleanChange({ operation: "create" }),
    cleanChange({ operation: "delete" }),
    cleanChange({ from: "ACTIVE", to: "ARCHIVED" }),
    cleanChange({ from: "ACTIVE", to: "ACTIVE" }),
    cleanChange({ from: "PAUSED", to: "ACTIVE", pausedBySystem: false }),
    cleanChange({ platform: "tiktok" }),
    cleanChange({ platform: "google_ads", externalId: "222", adGroupExternalId: "", customerId: "" }),
  ];
  for (const change of blocked) {
    const verdict = reviewWrite(change);
    assert.equal(verdict.ok, false, JSON.stringify(change));
  }
  const pause = reviewWrite(cleanChange());
  assert.equal(pause.ok, true);
  const resume = reviewWrite(cleanChange({ from: "PAUSED", to: "ACTIVE", pausedBySystem: true }));
  assert.equal(resume.ok, true);
  if (pause.ok) {
    assert.deepEqual(Object.keys(metaStatusBody(pause.change)), ["status"]);
    assert.equal(metaStatusBody(pause.change).status, "PAUSED");
  }
  const google = reviewWrite(cleanChange({ platform: "google_ads", externalId: "222", adGroupExternalId: "333", customerId: "1234567890" }));
  assert.equal(google.ok, true);
  if (google.ok) {
    const body = googleMutateBody(google.change);
    assert.deepEqual([...collectKeys(body)].sort(), ["operations", "resourceName", "status", "update", "updateMask"]);
    assert.equal(body.operations[0]?.updateMask, "status");
    assert.equal(body.operations[0]?.update.status, "PAUSED");
    assert.equal(googleMutateBody({ ...google.change, to: "ACTIVE", from: "PAUSED", pausedBySystem: true }).operations[0]?.update.status, "ENABLED");
  }
  assert.deepEqual(Object.keys(adStatusPatch("paused", "meta")).sort(), ["status", "statusRaw"]);
  assert.deepEqual(adStatusPatch("active", "google_ads"), { status: "active", statusRaw: "ENABLED" });
});

test("missing write credentials dry-run and never call the platform", async () => {
  let called = 0;
  const fetchImpl = async () => {
    called += 1;
    return new Response("{}", { status: 200 });
  };
  const access = credentialFor("org", "meta", [], { META_ACCESS_TOKEN: "read-token-should-not-be-used", META_APP_SECRET: "read-secret" });
  assert.equal(access.mode, "dry_run");
  if (access.mode === "dry_run") assert.equal(access.reason.includes("read-token"), false);
  const dry = await performWrite({ plan: pausePlan(), access, pageName: "Free Inspection", fetchImpl });
  assert.equal(dry.ok, true);
  if (dry.ok) assert.equal(dry.mode, "dry_run");
  assert.equal(called, 0);
  const sneaky = await performWrite({ plan: { ...pausePlan(), daily_budget: "9" }, access: { mode: "live", accessToken: "write-token-value", appSecret: "", developerToken: "", customerId: "", loginCustomerId: "" }, pageName: "Free Inspection", fetchImpl });
  assert.equal(sneaky.ok, false);
  assert.equal(called, 0);
  const refused = credentialFor("org", "meta", [{ clientKey: "org", platform: "meta", secretRef: "META_ACCESS_TOKEN", appSecretRef: "", extraSecretRef: "", accountExternalId: "", loginCustomerId: "", scopes: ["ads_management"] }], { META_ACCESS_TOKEN: "read-token-should-not-be-used" });
  assert.equal(refused.mode, "dry_run");
  assert.match(secretRefIssue("META_ACCESS_TOKEN") || "", /read token/i);
  assert.match(secretRefIssue("EAABnotavariable") || "", /variable name/i);
  const live = credentialFor("org", "google_ads", [], { GOOGLE_ADS_WRITE_ACCESS_TOKEN: "google-write", GOOGLE_ADS_DEVELOPER_TOKEN: "dev-token", GOOGLE_ADS_CUSTOMER_ID: "123-456-7890" });
  assert.equal(live.mode, "live");
  const log = dryRunLog("pause", "Free Inspection", ["Free Inspection Video"]);
  assert.equal(log.includes("google-write"), false);
  assert.match(log, /dry run: would pause 1 ad/);
});

test("a live status call sends only the status field", async () => {
  const seen: { url: string; body: string }[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    seen.push({ url, body: String(init?.body ?? "") });
    return new Response("{}", { status: 200 });
  };
  const outcome = await performWrite({
    plan: pausePlan(),
    access: { mode: "live", accessToken: "meta-write-token", appSecret: "meta-write-secret", developerToken: "", customerId: "", loginCustomerId: "" },
    pageName: "Free Inspection",
    env: { META_GRAPH_VERSION: "v23.0" },
    fetchImpl,
  });
  assert.equal(outcome.ok, true);
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.body, "status=PAUSED");
  assert.equal(seen[0]?.url.includes("daily_budget"), false);
  assert.match(seen[0]?.url || "", /graph\.facebook\.com\/v23\.0\/111/);
  const googleSeen: { body: string }[] = [];
  const google = await performWrite({
    plan: { ...pausePlan(), platform: "google_ads", externalId: "222", adGroupExternalId: "333", customerId: "1234567890" },
    access: { mode: "live", accessToken: "google-write", appSecret: "", developerToken: "dev-token", customerId: "1234567890", loginCustomerId: "" },
    pageName: "Free Inspection",
    env: { GOOGLE_ADS_API_VERSION: "v18" },
    fetchImpl: async (_url, init) => {
      googleSeen.push({ body: String(init?.body ?? "") });
      return new Response("{}", { status: 200 });
    },
  });
  assert.equal(google.ok, true);
  const parsed = JSON.parse(googleSeen[0]?.body || "{}") as { operations: { updateMask: string; update: { status: string } }[] };
  assert.equal(parsed.operations[0]?.updateMask, "status");
  assert.equal(parsed.operations[0]?.update.status, "PAUSED");
  assert.equal(shouldRetryLive(ago(60_000), NOW.getTime()), false);
  assert.equal(shouldRetryLive(ago(11 * 60_000), NOW.getTime()), true);
});

test("clients see plain status and no costs", () => {
  const screen = presentLandingScreen({
    audience: "client",
    now: NOW,
    monitorOn: true,
    autoPauseOn: true,
    canManage: true,
    canEditCredentials: true,
    stale: false,
    optIn: true,
    clientAlertOptIn: true,
    credentials: { meta: true, google: false },
    livePausedPageIds: ["page1"],
    notices: [{ id: "n1", pageId: "page1", pageName: "Free Inspection", code: "ads_paused", title: pausedHeadline(2), summary: "Free Inspection Video, Free Inspection Search", severity: "critical", ads: [{ name: "Free Inspection Video" }], resolvedAt: null, firedAt: ago(0) }],
    pages: [{
      id: "page1",
      name: "Free Inspection",
      url: "https://example.com/free-inspection?utm_source=fb",
      status: "down",
      checkedLabel: "Checked 2 min ago",
      loadLabel: "3.8s, slow: goal under 2.5s",
      formLabel: "Test lead sent 6:00 AM ET ✓",
      pixels: { meta: false, gtag: true, gtm: false },
      detail: "The server returned 503.",
      samples: [{ at: ago(14 * 60_000), status: "down" }, { at: ago(0), status: "up" }],
      pausedAdNames: ["Free Inspection Video", "Free Inspection Search"],
      recentlyResumed: false,
    }],
  });
  assert.equal(screen.credentials, null);
  assert.equal(screen.canManage, false);
  assert.equal(screen.notices.length, 0);
  assert.equal(screen.pages[0]?.summary, CLIENT_PAUSED);
  const json = JSON.stringify(screen);
  assert.equal(/cost|spend|cpc|cpm|cpa|cpl|roas|\bbudget\b|\$|503|utm_|fbclid/i.test(json), false);
  assert.equal(json.includes("https://"), false);
  assert.equal(clientStatusSentence({ name: "Free Inspection", status: "down", adsPaused: false, recentlyResumed: false }), "Your 'Free Inspection' page is down. Your account manager has been told.");
  const up = uptimeReport([{ at: ago(14 * 60_000), status: "down" }, { at: ago(0), status: "up" }], NOW);
  assert.match(up.text, /^Down once, \d+ min total$/);
  assert.equal(checkedLabel(ago(2 * 60_000), NOW), "Checked 2 min ago");
  assert.equal(nextProbeAt(null, false, NOW.getTime()), NOW.getTime());
  assert.equal(nextProbeAt(ago(0), false, NOW.getTime()) - NOW.getTime(), HEALTHY_INTERVAL_MS);
  assert.equal(nextProbeAt(ago(0), true, NOW.getTime()) - NOW.getTime(), CONFIRM_INTERVAL_MS);
  assert.equal(monitorStale({ now: NOW.getTime(), monitorOn: true, pages: [{ createdAt: ago(30 * 60_000), latestAt: ago(21 * 60_000) }] }), true);
  assert.equal(monitorStale({ now: NOW.getTime(), monitorOn: false, pages: [{ createdAt: ago(30 * 60_000), latestAt: null }] }), false);
});

test("page checks read the html and refuse private or off-site targets", async () => {
  const html = `<html><body><form action="/lead"></form><script>fbq('init','1');gtag('config','G-1');</script><script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABCD"></script></body></html>`;
  assert.deepEqual(analyzeHtml(html), { formPresent: true, pixels: { meta: true, gtag: true, gtm: true } });
  assert.equal(classifySample({ httpOk: true, timedOut: false, loadMs: 3800, formPresent: true, formSubmitOk: null, expectForm: true }), "slow");
  assert.equal(classifySample({ httpOk: false, timedOut: false, loadMs: 100, formPresent: true, formSubmitOk: null, expectForm: true }), "down");
  assert.equal(classifySample({ httpOk: true, timedOut: false, loadMs: 100, formPresent: false, formSubmitOk: null, expectForm: true }), "form_broken");
  assert.equal(destinationMatches("https://www.example.com/free-inspection?utm_campaign=x", "https://example.com/free-inspection/"), true);
  assert.equal(destinationMatches("https://example.com/free-inspection-extra", "https://example.com/free-inspection"), false);
  assert.equal(publicUrlIssue("http://example.com/free"), "Use an https:// address.");
  assert.match(publicUrlIssue("https://127.0.0.1/secret") || "", /not a public/);
  assert.match(publicUrlIssue("https://169.254.169.254/latest") || "", /not a public/);
  assert.equal(canonicalPageUrl("https://Example.com/free-inspection/?utm_source=fb"), "https://example.com/free-inspection");
  assert.match(formTargetIssue("https://example.com/free", "https://evil.example/post") || "", /same site/);
  assert.equal(formTargetIssue("https://example.com/free", "https://example.com/test-lead"), null);
  let called = 0;
  const blocked = await probePage({ url: "https://127.0.0.1/latest", region: "us-east", expectForm: true, fetchImpl: async () => { called += 1; return new Response("no"); }, now: NOW });
  assert.equal(called, 0);
  assert.equal(blocked.status, "down");
  const probed = await probePage({
    url: "https://example.com/free-inspection",
    region: "eu-west",
    expectForm: true,
    now: NOW,
    fetchImpl: async () => new Response(html, { status: 200 }),
  });
  assert.equal(probed.status, "up");
  assert.equal(probed.pixels.meta, true);
  assert.equal(isMonitorTestLead({ email: "page-check@invalid.example" }), true);
  assert.equal(isMonitorTestLead({ fields: { voiceops_test_lead: "1" } }), true);
  const leads = withoutMonitorTestLeads(
    [{ id: "real", source: "form" }, { id: "test", source: "page_monitor_test" }],
    (row) => ({ source: row.source }),
  );
  assert.deepEqual(leads.map((row) => row.id), ["real"]);
});

test("the worker does nothing while the monitor flag is off", async () => {
  const result = await runPageMonitor({ MARKETING_PAGE_MONITOR: "off", MARKETING_PAGE_AUTOPAUSE: "on" });
  assert.deepEqual(result, { status: "skipped", reason: "MARKETING_PAGE_MONITOR is off" });
});

test("pause code does not send budgets, bids, targeting, or creatives", () => {
  const store = readFileSync(path.join(ROOT, "lib/marketing/pages/store.ts"), "utf8");
  const probe = readFileSync(path.join(ROOT, "lib/marketing/pages/probe.ts"), "utf8");
  const policy = readFileSync(path.join(ROOT, "lib/marketing/pages/policy.ts"), "utf8");
  for (const source of [store, probe, policy]) {
    assert.equal(/daily_budget|lifetime_budget|bid_amount|bid_strategy|targeting|creative_id/.test(source), false);
  }
  assert.match(store, /adStatusPatch\(/);
  assert.match(store, /performWrite\(/);
  const writes = readFileSync(path.join(ROOT, "lib/marketing/pages/writes.ts"), "utf8");
  assert.match(writes, /Only an ad status change is allowed/);
  assert.match(writes, /META_ACCESS_TOKEN/);
});

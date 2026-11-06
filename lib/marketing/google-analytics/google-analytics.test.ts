import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { runAsWorkspace } from "../../demo/outbound";
import { DEMO_WORKSPACE_ID } from "../../demo/isolation";
import { presentWithoutCost } from "../client-view";
import { projectDashboard, type DashboardModel } from "../dashboard-model";
import { isCostDecision, presentDecisions, type DecisionCard } from "../decisions/present";
import { evaluateDecisionRules } from "../decisions/rules";
import {
  AnalyticsWriteBlockedError,
  analyticsReportUrl,
  analyticsTokenBody,
  assertAnalyticsReadOnly,
  redactAnalyticsSecrets,
} from "./client";
import { analyticsExtraTokenEnv, clientsToRead, googleAnalyticsDecisionsEnabled, planAnalyticsConnections } from "./connections";
import { evaluateAnalyticsDecisions } from "./decisions";
import {
  ANALYTICS_CLIENTS_NOT_MAPPED,
  ANALYTICS_PROPERTY_IDS_NOT_INCLUDED,
  LOCKED_ANALYTICS_MAPPINGS,
  lockedMappingByClient,
  lockedMappingByProperty,
} from "./locked-mappings";
import { matchAnalyticsCampaign } from "./match";
import { parseRunReport } from "./report";
import { analyticsScopeData } from "./scope";
import { decideGoogleAnalytics, runGoogleAnalyticsSync } from "./sync";
import { analyticsForViewer, presentAnalyticsTraffic } from "./view";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const END = "2026-11-06";

function day(date: string, patch: Partial<{ sessions: number; engagedSessions: number; conversions: number; landingPage: string; campaignId: string | null; campaignName: string }> = {}) {
  return {
    id: `ga-${date}-${patch.landingPage || "all"}`,
    clientId: "client-1",
    clientName: "Burnett Pools",
    date,
    campaignId: patch.campaignId ?? null,
    campaignName: patch.campaignName || "Pools spring",
    source: "google",
    medium: "organic",
    landingPage: patch.landingPage || "",
    sessions: patch.sessions ?? 0,
    engagedSessions: patch.engagedSessions ?? 0,
    conversions: patch.conversions ?? 0,
  };
}

test("analytics sync and decisions stay off without the flag and a refresh token", async () => {
  assert.equal(googleAnalyticsDecisionsEnabled({}), false);
  assert.equal(googleAnalyticsDecisionsEnabled({ GOOGLE_ANALYTICS_SYNC: "on" }).valueOf(), false);
  assert.equal(googleAnalyticsDecisionsEnabled({ GOOGLE_ANALYTICS_REFRESH_TOKEN: "analytics-refresh-token" }), false);
  assert.equal(googleAnalyticsDecisionsEnabled({ GOOGLE_ANALYTICS_SYNC: "off", GOOGLE_ANALYTICS_REFRESH_TOKEN: "analytics-refresh-token" }), false);
  assert.equal(decideGoogleAnalytics({ GOOGLE_ADS_REFRESH_TOKEN: "ads-refresh-token", GOOGLE_OAUTH_CLIENT_ID: "oauth-client", GOOGLE_OAUTH_CLIENT_SECRET: "oauth-secret" }).action, "skip");
  const adsOnly = decideGoogleAnalytics({
    GOOGLE_ANALYTICS_SYNC: "on",
    GOOGLE_ADS_REFRESH_TOKEN: "ads-refresh-token",
    GOOGLE_OAUTH_CLIENT_ID: "oauth-client",
    GOOGLE_OAUTH_CLIENT_SECRET: "oauth-secret",
  });
  assert.equal(adsOnly.action, "skip");
  if (adsOnly.action === "skip") assert.match(adsOnly.reason, /GOOGLE_ANALYTICS_REFRESH_TOKEN/);
  let called = false;
  const skipped = await runGoogleAnalyticsSync({
    env: { GOOGLE_ANALYTICS_REFRESH_TOKEN: "analytics-refresh-token" },
    fetchImpl: async () => {
      called = true;
      return new Response("{}", { status: 200 });
    },
    clients: [],
  });
  assert.equal(skipped.status, "skipped");
  assert.equal(called, false);
  assert.equal(skipped.reason, "GOOGLE_ANALYTICS_SYNC is off");
  const quiet = evaluateDecisionRules({
    end: END,
    analyticsEnabled: false,
    analytics: [day(END, { sessions: 400 })],
    spend: [{ id: "spend-1", clientId: "client-1", clientName: "Burnett Pools", campaignId: "camp-1", campaignName: "Pools spring", date: END, spend: 80 }],
  });
  assert.equal(quiet.some((row) => row.type.startsWith("ga_")), false);
});

test("locked ads mappings are the property list and nothing else", () => {
  assert.equal(LOCKED_ANALYTICS_MAPPINGS.length, 17);
  assert.equal(lockedMappingByClient("Forty Two")?.propertyId, "361580563");
  assert.equal(lockedMappingByClient("Specificity")?.propertyId, "377915570");
  assert.equal(lockedMappingByProperty("546709099")?.client, "Mold Medics");
  assert.equal(lockedMappingByClient("Be Found AI")?.connectionName, "");
  for (const row of LOCKED_ANALYTICS_MAPPINGS) assert.equal(row.connectionName, "");
  for (const name of ANALYTICS_CLIENTS_NOT_MAPPED) assert.equal(lockedMappingByClient(name), null);
  for (const propertyId of ANALYTICS_PROPERTY_IDS_NOT_INCLUDED) assert.equal(lockedMappingByProperty(propertyId), null);
  assert.equal(LOCKED_ANALYTICS_MAPPINGS.some((row) => row.propertyId === "355340857" || row.propertyId === "259530011"), false);
});

test("mapping lookup pairs a connection name with a property id", () => {
  const primary = analyticsScopeData({ propertyId: "553292453", connection: "" });
  assert.equal(primary.ok, true);
  if (primary.ok) {
    assert.deepEqual(primary.data, { googleAnalyticsConnectionName: "", googleAnalyticsPropertyId: "553292453" });
    assert.equal("metaLiveRead" in primary.data, false);
  }
  const named = analyticsScopeData({ propertyId: "123456789", connection: "Angelo Marketing" });
  assert.equal(named.ok, false);
  const titled = analyticsScopeData({ propertyId: "123456789", connection: "Angelo" });
  assert.equal(titled.ok, true);
  if (titled.ok) assert.equal(titled.data.googleAnalyticsConnectionName, "angelo");
  const slug = analyticsScopeData({ propertyId: "123456789", connection: "angelo" });
  assert.equal(slug.ok, true);
  if (slug.ok) assert.equal(slug.data.googleAnalyticsConnectionName, "angelo");
  const plan = planAnalyticsConnections({
    GOOGLE_ANALYTICS_REFRESH_TOKEN: "analytics-refresh-token",
    GOOGLE_ANALYTICS_EXTRA_CONNECTIONS: "angelo, capital",
  });
  assert.deepEqual(plan.connections.map((row) => row.name), ["primary"]);
  assert.equal(plan.skipped.some((row) => row.name === "angelo" && row.reason.includes(analyticsExtraTokenEnv("angelo"))), true);
  const reads = clientsToRead(
    [
      { id: "be", name: "Be Found AI", googleAnalyticsConnectionName: "", googleAnalyticsPropertyId: "553292453" },
      { id: "unmapped", name: "Visions", googleAnalyticsConnectionName: "", googleAnalyticsPropertyId: "" },
      { id: "angelo", name: "Angelo Marketing", googleAnalyticsConnectionName: "angelo", googleAnalyticsPropertyId: "999999999" },
    ],
    plan,
  );
  assert.deepEqual(reads.ready.map((row) => row.client.name), ["Be Found AI"]);
  assert.equal(reads.skipped.some((row) => row.client === "Visions"), false);
  assert.equal(reads.skipped.some((row) => row.client === "Angelo Marketing" && row.name === "angelo"), true);
});

test("a missing extra connection is skipped and the primary property is still read", async () => {
  const calls: { url: string; body: string }[] = [];
  const written: { propertyId: string; campaignId: string | null; sessions: number }[] = [];
  const result = await runGoogleAnalyticsSync({
    env: {
      GOOGLE_ANALYTICS_SYNC: "on",
      MARKETING_SYNC_MODE: "live",
      MARKETING_LOOKBACK_DAYS: "7",
      GOOGLE_OAUTH_CLIENT_ID: "oauth-client",
      GOOGLE_OAUTH_CLIENT_SECRET: "oauth-secret",
      GOOGLE_ANALYTICS_REFRESH_TOKEN: "analytics-refresh-token",
      GOOGLE_ADS_REFRESH_TOKEN: "ads-refresh-token",
      GOOGLE_ANALYTICS_EXTRA_CONNECTIONS: "angelo",
    },
    now: new Date("2026-11-06T16:00:00.000Z"),
    timezone: "America/New_York",
    clients: [
      { id: "be", name: "Be Found AI", googleAnalyticsConnectionName: "", googleAnalyticsPropertyId: "553292453" },
      { id: "angelo", name: "Angelo Marketing", googleAnalyticsConnectionName: "angelo", googleAnalyticsPropertyId: "999999999" },
    ],
    campaigns: [{ id: "camp-1", name: "Pools spring", externalId: "111", clientId: "be" }],
    writeRows: async (rows) => {
      written.push(...rows.map((row) => ({ propertyId: row.propertyId, campaignId: row.campaignId, sessions: row.sessions })));
      return rows.length;
    },
    fetchImpl: async (url, init) => {
      calls.push({ url, body: String(init?.body || "") });
      if (url.includes("oauth2.googleapis.com")) {
        assert.equal(String(init?.body).includes("analytics.readonly"), true);
        assert.equal(String(init?.body).includes("adwords"), false);
        assert.equal(String(init?.body).includes("ads-refresh-token"), false);
        assert.equal(String(init?.body).includes("analytics-refresh-token"), true);
        return Response.json({ access_token: "ya29.analytics", scope: "https://www.googleapis.com/auth/analytics.readonly openid email profile" });
      }
      return Response.json({
        dimensionHeaders: ["date", "sessionCampaignName", "sessionCampaignId", "sessionSource", "sessionMedium", "landingPage"].map((name) => ({ name })),
        metricHeaders: ["sessions", "engagedSessions", "keyEvents"].map((name) => ({ name })),
        rows: [{
          dimensionValues: [{ value: "20261106" }, { value: "Pools spring" }, { value: "" }, { value: "google" }, { value: "organic" }, { value: "/pools" }].map((value) => ({ value: value.value })),
          metricValues: [{ value: "12" }, { value: "9" }, { value: "2" }],
        }],
      });
    },
  });
  assert.equal(result.status, "succeeded");
  assert.equal(JSON.stringify(result).includes("analytics-refresh-token"), false);
  assert.equal(JSON.stringify(result).includes("oauth-secret"), false);
  assert.equal(calls.some((call) => call.url.includes("999999999")), false);
  assert.equal(calls.some((call) => call.url.includes("/properties/553292453:runReport")), true);
  assert.equal(result.skipped.some((row) => row.client === "Angelo Marketing"), true);
  assert.deepEqual(written, [{ propertyId: "553292453", campaignId: "camp-1", sessions: 12 }]);
});

test("an ads scope on the analytics token is refused before a report call", async () => {
  const urls: string[] = [];
  const result = await runGoogleAnalyticsSync({
    env: {
      GOOGLE_ANALYTICS_SYNC: "on",
      MARKETING_SYNC_MODE: "live",
      GOOGLE_OAUTH_CLIENT_ID: "oauth-client",
      GOOGLE_OAUTH_CLIENT_SECRET: "oauth-secret",
      GOOGLE_ANALYTICS_REFRESH_TOKEN: "analytics-refresh-token",
    },
    clients: [{ id: "be", name: "Be Found AI", googleAnalyticsConnectionName: "", googleAnalyticsPropertyId: "553292453" }],
    campaigns: [],
    writeRows: async () => 0,
    fetchImpl: async (url) => {
      urls.push(url);
      return Response.json({ access_token: "ya29.ads", scope: "https://www.googleapis.com/auth/adwords" });
    },
  });
  assert.equal(result.status, "failed");
  assert.match(result.error || "", /ads scope/);
  assert.equal(urls.some((url) => url.includes("runReport")), false);
  assert.equal(JSON.stringify(result).includes("analytics-refresh-token"), false);
});

test("report rows and campaign names are parsed and matched", () => {
  const parsed = parseRunReport({
    metricHeaders: [{ name: "keyEvents" }, { name: "sessions" }, { name: "engagedSessions" }],
    dimensionHeaders: [{ name: "landingPage" }, { name: "date" }, { name: "sessionMedium" }, { name: "sessionSource" }, { name: "sessionCampaignId" }, { name: "sessionCampaignName" }],
    rows: [{
      dimensionValues: [{ value: "/shop" }, { value: "20261101" }, { value: "cpc" }, { value: "google" }, { value: "111" }, { value: "(not set)" }],
      metricValues: [{ value: "3" }, { value: "10" }, { value: "7" }],
    }],
  });
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.date, "2026-11-01");
  assert.equal(parsed[0]?.sessions, 10);
  assert.equal(parsed[0]?.engagedSessions, 7);
  assert.equal(parsed[0]?.conversions, 3);
  assert.equal(parsed[0]?.landingPage, "/shop");
  const legacy = parseRunReport({
    dimensionHeaders: [{ name: "date" }, { name: "sessionCampaignName" }],
    metricHeaders: [{ name: "sessions" }, { name: "conversions" }],
    rows: [{ dimensionValues: [{ value: "2026-11-02" }, { value: "Brand" }], metricValues: [{ value: "4" }, { value: "1" }] }],
  });
  assert.equal(legacy[0]?.conversions, 1);
  const campaigns = [
    { id: "camp-1", name: "Pools spring", externalId: "111", clientId: "be" },
    { id: "other", name: "Pools spring", externalId: "222", clientId: "other" },
    { id: "gear", name: "Gearheads Ohio", externalId: "333", clientId: "be" },
  ];
  assert.equal(matchAnalyticsCampaign(campaigns, "be", { name: "(not set)", externalId: "111" }), "camp-1");
  assert.equal(matchAnalyticsCampaign(campaigns, "be", { name: "Pools spring" }), "camp-1");
  assert.equal(matchAnalyticsCampaign(campaigns, "be", { name: "pools" }), "camp-1");
  assert.equal(matchAnalyticsCampaign(campaigns, "other", { name: "Gearheads" }), null);
  assert.equal(matchAnalyticsCampaign(campaigns, "be", { name: "(not set)" }), null);
});

test("analytics decisions need enough traffic and hide spend from clients", () => {
  const quiet = evaluateAnalyticsDecisions({
    end: END,
    analytics: [day(END, { sessions: 4, campaignId: "camp-1" })],
    spend: [{ id: "small", clientId: "client-1", clientName: "Burnett Pools", campaignId: "camp-1", campaignName: "Pools spring", date: END, spend: 10 }],
  });
  assert.equal(quiet.length, 0);
  const spend = evaluateDecisionRules({
    end: END,
    analyticsEnabled: true,
    analytics: [day(END, { sessions: 0, campaignId: "camp-1" })],
    spend: [{ id: "spend-1", clientId: "client-1", clientName: "Burnett Pools", campaignId: "camp-1", campaignName: "Pools spring", date: END, spend: 120 }],
  }).filter((row) => row.type === "ga_spend_without_traffic");
  assert.equal(spend.length, 1);
  assert.equal(spend[0]?.changesSpend, false);
  assert.equal(spend[0]?.writesAds, false);
  assert.equal(spend[0]?.budgetWrite, "none");
  assert.equal(spend[0]?.metric, "spend");
  assert.match(spend[0]?.summary || "", /\$120\.00/);
  const traffic = evaluateAnalyticsDecisions({
    end: END,
    analytics: [day(END, { sessions: 140, engagedSessions: 80, conversions: 0 })],
  });
  assert.equal(traffic.some((row) => row.type === "ga_traffic_no_conversions"), true);
  assert.equal(JSON.stringify(traffic).includes("$"), false);
  const drop = evaluateAnalyticsDecisions({
    end: END,
    analytics: [
      day("2026-10-25", { sessions: 80, landingPage: "/pools" }),
      day("2026-11-05", { sessions: 10, landingPage: "/pools" }),
    ],
  }).filter((row) => row.type === "ga_landing_drop");
  assert.equal(drop.length, 1);
  assert.equal(drop[0]?.severity, "high");
  assert.equal(JSON.stringify(drop).includes("spend"), false);

  const card = (patch: Partial<DecisionCard>): DecisionCard => ({
    id: "rec-ga",
    type: "ga_spend_without_traffic",
    rule: "ga_spend_without_traffic",
    status: "verified",
    severity: "high",
    clientId: "client-1",
    clientName: "Burnett Pools",
    campaignId: "camp-1",
    campaignName: "Pools spring",
    campaignStatus: "active",
    title: "Burnett Pools: Pools spring spent $120.00 with little site traffic",
    summary: "Pools spring spent $120.00 in 7 days and the mapped site recorded 0 matching sessions.",
    rationale: "Spend is not showing up as site traffic.",
    metric: "spend",
    baseline: "25.00",
    observed: "120.00",
    windowStart: "2026-10-31",
    windowEnd: END,
    sampleSize: 120,
    sourceMetricIds: [],
    evidence: { spend: 120, sessions: 0, roas: 1.2 },
    recency: "",
    snoozedUntil: null,
    archivedAt: null,
    steps: ["A person decides any budget change in the ad platform."],
    ...patch,
  });
  assert.equal(isCostDecision(card({})), true);
  assert.equal(presentDecisions([card({})], { seesCost: false, hasLeadValue: false }).length, 0);
  const staff = presentDecisions([card({})], { seesCost: true, hasLeadValue: false });
  assert.equal(staff.length, 1);
  assert.equal(staff[0]?.evidence.spend, 120);
  const visits = presentDecisions([card({ type: "ga_traffic_no_conversions", rule: "ga_traffic_no_conversions", metric: "sessions", title: "Burnett Pools: site traffic has no conversions", summary: "140 sessions and 80 engaged sessions in 14 days, with no key events.", rationale: "People are reaching the site.", observed: "140", evidence: { sessions: 140, engagedSessions: 80, conversions: 0 } })], { seesCost: false, hasLeadValue: false });
  assert.equal(visits.length, 1);
  assert.equal(JSON.stringify(visits).includes("$"), false);
  assert.equal(visits[0]?.evidence.spend, undefined);
});

test("the dashboard traffic block keeps visits and drops spend", () => {
  const view = presentAnalyticsTraffic([
    { date: "2026-11-06", campaign: "Pools spring", source: "google", medium: "organic", landingPage: "/pools", sessions: 12, engagedSessions: 9, conversions: 2 },
    { date: "2026-11-06", campaign: "Pools spring", source: "google", medium: "cpc", landingPage: "/pools", sessions: 3, engagedSessions: 1, conversions: 0 },
    { date: "2026-11-06", campaign: "", source: "", medium: "", landingPage: "", sessions: 0, engagedSessions: 0, conversions: 0 },
  ]);
  assert.equal(view.sessions, 15);
  assert.equal(view.engagedSessions, 10);
  assert.equal(view.conversions, 2);
  assert.equal(view.landingPages[0]?.path, "/pools");
  assert.equal(view.landingPages[0]?.sessions, 15);
  assert.equal(view.rows.some((row) => row.medium === "cpc"), true);
  const dirty = { ...view, spend: 40, roas: 2 };
  const clean = analyticsForViewer(dirty as typeof view);
  assert.equal("spend" in clean, false);
  assert.equal(JSON.stringify(clean).includes("roas"), false);
  const model: DashboardModel = {
    mode: "staff",
    showMoney: true,
    dates: [END],
    campaigns: [],
    notes: [],
    sourceLine: "Meta",
    workspaceName: "Org",
    mock: false,
    analytics: dirty as typeof view,
  };
  const client = presentWithoutCost(projectDashboard(model, { mode: "client", showMoney: false, canEditLeadValue: false }), false);
  assert.equal(client.analytics?.sessions, 15);
  assert.equal(client.showMoney, false);
  assert.equal(JSON.stringify(client.analytics).toLowerCase().includes("spend"), false);
  assert.equal(JSON.stringify(client.analytics).includes("cpc"), false);
  assert.equal(JSON.stringify(client.analytics).includes("$"), false);
});

test("analytics calls do not write to Google Analytics", () => {
  const tokenBody = decodeURIComponent(analyticsTokenBody({ clientId: "oauth-client", clientSecret: "oauth-secret", refreshToken: "analytics-refresh-token" }));
  assert.equal(tokenBody.includes("https://www.googleapis.com/auth/analytics.readonly"), true);
  assert.equal(tokenBody.includes("adwords"), false);
  assert.doesNotThrow(() => assertAnalyticsReadOnly("POST", analyticsReportUrl("553292453")));
  assert.throws(() => assertAnalyticsReadOnly("DELETE", "https://analyticsdata.googleapis.com/v1beta/properties/553292453"), AnalyticsWriteBlockedError);
  assert.throws(() => assertAnalyticsReadOnly("POST", "https://analyticsadmin.googleapis.com/v1beta/properties/553292453"), AnalyticsWriteBlockedError);
  assert.throws(() => assertAnalyticsReadOnly("POST", "https://googleads.googleapis.com/v26/customers/1234567890/campaigns:mutate"), AnalyticsWriteBlockedError);
  assert.throws(() => assertAnalyticsReadOnly("POST", "https://analyticsdata.googleapis.com/v1beta/properties/553292453:runRealtimeReport"), AnalyticsWriteBlockedError);
  const client = readFileSync(path.join(ROOT, "lib/marketing/google-analytics/client.ts"), "utf8");
  const sync = readFileSync(path.join(ROOT, "lib/marketing/google-analytics/sync.ts"), "utf8");
  const script = readFileSync(path.join(ROOT, "scripts/google-analytics-client-scope.ts"), "utf8");
  assert.equal(client.includes("env.GOOGLE_ADS_REFRESH_TOKEN"), false);
  assert.equal(sync.includes("env.GOOGLE_ADS_REFRESH_TOKEN"), false);
  assert.equal(/metaLiveRead\s*:/.test(script), false);
  assert.equal(script.includes("googleAdsLiveRead"), false);
  assert.match(script, /googleAnalyticsPropertyId/);
  assert.equal(redactAnalyticsSecrets("refresh_token=analytics-refresh-token", ["analytics-refresh-token"]).includes("analytics-refresh-token"), false);
});

test("the demo workspace does not sync analytics", async () => {
  let called = false;
  const result = await runAsWorkspace(DEMO_WORKSPACE_ID, () => runGoogleAnalyticsSync({
    env: {
      GOOGLE_ANALYTICS_SYNC: "on",
      MARKETING_SYNC_MODE: "live",
      GOOGLE_OAUTH_CLIENT_ID: "oauth-client",
      GOOGLE_OAUTH_CLIENT_SECRET: "oauth-secret",
      GOOGLE_ANALYTICS_REFRESH_TOKEN: "analytics-refresh-token",
    },
    fetchImpl: async () => {
      called = true;
      return new Response("{}", { status: 200 });
    },
    clients: [{ id: "be", name: "Be Found AI", googleAnalyticsConnectionName: "", googleAnalyticsPropertyId: "553292453" }],
  }));
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "demo workspace does not sync");
  assert.equal(called, false);
});

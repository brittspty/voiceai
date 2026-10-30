import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { forbiddenClientKeys } from "./client-view";
import { dashboardsV2Enabled, googleAdsEnabled } from "./config";
import {
  anomalies,
  anomalyReason,
  assembleCampaigns,
  audienceLabel,
  awarenessText,
  buildKpis,
  collapseMetrics,
  dashboardCampaignWhere,
  dashboardGoal,
  dashboardMetricWhere,
  dashboardPlatforms,
  effectiveMetric,
  funnelCaption,
  parseDashQuery,
  projectDashboard,
  resultCounts,
  sourceLine,
  spendOverPacing,
  type DashboardModel,
  type RawCampaign,
  type RawMetric,
} from "./dashboard-model";

const ROOT = path.resolve(import.meta.dirname, "../..");

test("dashboard flags default off and Google stays out until its flag is on", () => {
  assert.equal(dashboardsV2Enabled({}), false);
  assert.equal(dashboardsV2Enabled({ MARKETING_DASHBOARDS_V2: "on" }), true);
  assert.equal(googleAdsEnabled({}), false);
  assert.deepEqual(dashboardPlatforms({}), ["meta"]);
  assert.deepEqual(dashboardPlatforms({ MARKETING_GOOGLE_ADS: "on" }), ["meta", "google_ads"]);
});

test("dashboard queries always name a workspace and a platform", () => {
  assert.throws(() => dashboardCampaignWhere({ workspaceId: " ", platforms: ["meta"] }), /workspace/);
  assert.throws(() => dashboardMetricWhere({ workspaceId: "", platforms: ["meta"], campaignIds: [], start: "2026-10-01", end: "2026-10-02" }), /workspace/);
  const where = dashboardCampaignWhere({ workspaceId: "org", platforms: ["meta"], campaignIds: ["c1"] });
  assert.equal(where.workspaceId, "org");
  assert.deepEqual(where.platform.in, ["meta"]);
  assert.deepEqual(where.id?.in, ["c1"]);
  const metrics = dashboardMetricWhere({ workspaceId: "client-a", platforms: ["meta"], campaignIds: ["c1"], start: "2026-10-01", end: "2026-10-07" });
  assert.equal(metrics.workspaceId, "client-a");
  assert.equal(metrics.audienceSegment.segmentKey, "all");
  const google = dashboardCampaignWhere({ workspaceId: "org", platforms: dashboardPlatforms({ MARKETING_GOOGLE_ADS: "on" }) });
  assert.deepEqual(google.platform.in, ["meta", "google_ads"]);
});

test("lead and call counts follow the campaign goal", () => {
  assert.deepEqual(resultCounts("leads", 4, 9), { leads: 4, calls: 0 });
  assert.deepEqual(resultCounts("calls", 4, 2), { leads: 4, calls: 2 });
  assert.deepEqual(resultCounts("calls", 3, 0), { leads: 0, calls: 3 });
  assert.deepEqual(resultCounts("awareness", 8, 1), { leads: 0, calls: 0 });
  assert.equal(dashboardGoal("traffic"), "leads");
  assert.equal(audienceLabel("Lookalike 1%", true), "People similar to your customers");
  assert.equal(audienceLabel("Broad 55-75", true), "Ages 55-75");
  assert.equal(audienceLabel("Lookalike 1%", false), "Lookalike 1%");
  assert.match(awarenessText(149000), /Awareness goal: reached 149.0k people/);
  assert.equal(funnelCaption({ awareness: false, views: 70, clicks: 1, reach: 0, results: 1 }), "1 in 70 viewers clicked; 1 in 1 clickers became a lead or call");
});

test("estimated ROAS is hidden until a lead value is set and pacing uses 125 percent", () => {
  const dates = Array.from({ length: 14 }, (_, index) => `2026-10-${String(index + 1).padStart(2, "0")}`);
  const campaign: RawCampaign = {
    id: "c1",
    name: "Medicare AEP",
    objective: "leads",
    status: "active",
    platform: "meta",
    dailyBudget: 100,
    budgetSetBy: "Britt",
    budgetSetAt: "2026-10-02",
    ads: [
      {
        id: "a1",
        name: "Image",
        status: "active",
        format: "image",
        audienceNames: ["Broad 55-75"],
        thumbnailUrl: null,
      },
    ],
  };
  const metrics: RawMetric[] = dates.map((date) => ({
    date,
    adId: "a1",
    campaignId: "c1",
    attributionWindow: "7d_click_1d_view",
    impressions: 1000,
    clicks: 20,
    reach: 800,
    platformLeads: 2,
    platformConversions: 0,
    spend: 40,
  }));
  const assembled = assembleCampaigns({ dates, campaigns: [campaign], metrics, clientLabels: false, showMoney: true });
  const hidden = buildKpis({ campaigns: assembled, days: 7, showMoney: true, leadValue: null });
  assert.equal(hidden.find((tile) => tile.label === "Est. ROAS")?.prompt, true);
  assert.equal(hidden.some((tile) => tile.label === "Calls"), false);
  const shown = buildKpis({
    campaigns: assembled,
    days: 7,
    showMoney: true,
    leadValue: { leadCents: 8500, callCents: null, by: "Britt", at: "Oct 15" },
  });
  const roas = shown.find((tile) => tile.label === "Est. ROAS");
  assert.equal(roas?.prompt, false);
  assert.equal(roas?.value, "4.25x");
  assert.match(roas?.hint || "", /\$85\.00 per lead/);
  assert.equal(spendOverPacing(126, 100), true);
  assert.equal(spendOverPacing(125, 100), false);
  const values = [10, 12, 9, 11, 10, 13, 8, 80];
  const flagged = anomalies(values);
  assert.equal(flagged.length, 1);
  assert.match(anomalyReason("Leads", flagged[0].change), /Leads \d+% above normal/);
});

test("client dashboards drop money, lead value, and ad account ids", () => {
  const dates = ["2026-10-01"];
  const assembled = assembleCampaigns({
    dates,
    campaigns: [
      {
        id: "c1",
        name: "act_532471207924121 Brand",
        objective: "awareness",
        status: "active",
        platform: "meta",
        dailyBudget: 50,
        budgetSetBy: "Britt",
        budgetSetAt: "2026-10-01",
        ads: [{ id: "a1", name: "Ad", status: "active", format: "video", audienceNames: ["Lookalike 1%"], thumbnailUrl: "http://insecure.example/a.jpg" }],
      },
    ],
    metrics: [
      {
        date: "2026-10-01",
        adId: "a1",
        campaignId: "c1",
        attributionWindow: "7d_click",
        impressions: 100,
        clicks: 5,
        reach: 80,
        platformLeads: 3,
        platformConversions: 1,
        spend: 9,
      },
    ],
    clientLabels: true,
    showMoney: true,
  });
  const full: DashboardModel = {
    mode: "staff",
    showMoney: true,
    canEditLeadValue: true,
    dates,
    campaigns: assembled,
    notes: [{ campaignId: "c1", campaignName: "act_1", text: "Raise the daily budget from $250 to $300." }],
    leadValue: { leadCents: 8500, callCents: 14000, by: "Britt", at: "Oct 15" },
    sourceLine: sourceLine({ platforms: ["meta"], updatedLabel: "Oct 29, 5:45 PM ET", accountIds: ["act_532471207924121"] }),
    workspaceName: "Gulf Coast",
    mock: false,
  };
  const client = projectDashboard(full, { mode: "client", showMoney: true, canEditLeadValue: true });
  assert.equal(client.showMoney, false);
  assert.equal("leadValue" in client, false);
  assert.equal("canEditLeadValue" in client, false);
  assert.equal(client.campaigns[0].dailyBudget, undefined);
  assert.equal(client.campaigns[0].ads[0].days[0].s, undefined);
  assert.equal(client.campaigns[0].ads[0].l === undefined || client.campaigns[0].ads[0].days[0].l === 0, true);
  assert.equal(client.campaigns[0].name.includes("act_"), false);
  assert.equal(client.campaigns[0].ads[0].audience, "People similar to your customers");
  assert.equal(client.campaigns[0].ads[0].thumbnailUrl, null);
  assert.equal(client.notes.length, 0);
  assert.equal(client.sourceLine.includes("act_"), false);
  assert.match(client.sourceLine, /Source: your Meta ads/);
  assert.deepEqual(forbiddenClientKeys(client), []);
  const staff = projectDashboard(full, { mode: "staff", showMoney: true, canEditLeadValue: true });
  assert.equal(staff.showMoney, true);
  assert.equal(staff.campaigns[0].ads[0].days[0].s, 9);
  assert.equal(staff.leadValue?.leadCents, 8500);
  assert.match(staff.sourceLine, /act_532471207924121/);
});

test("duplicate attribution windows are not added together", () => {
  const rows = collapseMetrics([
    { date: "2026-10-01", adId: "a", campaignId: "c", attributionWindow: "7d_click", impressions: 10, clicks: 1, reach: 8, platformLeads: 1, platformConversions: 0, spend: 2 },
    { date: "2026-10-01", adId: "a", campaignId: "c", attributionWindow: "1d_view", impressions: 99, clicks: 9, reach: 9, platformLeads: 9, platformConversions: 0, spend: 20 },
    { date: "2026-10-01", adId: "a", campaignId: "c", attributionWindow: "7d_click", impressions: 5, clicks: 1, reach: 4, platformLeads: 1, platformConversions: 0, spend: 1 },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].impressions, 15);
  assert.equal(rows[0].spend, 3);
});

test("chart controls and call campaigns pick a sensible metric", () => {
  assert.equal(parseDashQuery({ d: "14", st: "paused", g: "calls", m: "s", camp: "c9", edit: "lv" }).days, 14);
  assert.equal(parseDashQuery({}).metric, "l");
  assert.equal(effectiveMetric({ metric: "s", goal: null, showMoney: false }), "l");
  assert.equal(effectiveMetric({ metric: "l", goal: "calls", showMoney: true }), "k");
  assert.equal(effectiveMetric({ metric: "c", goal: "awareness", showMoney: true }), "c");
  assert.equal(effectiveMetric({ metric: "l", goal: "awareness", showMoney: true }), "r");
});

test("dashboard reads do not write budgets or ad accounts", () => {
  const query = readFileSync(path.join(ROOT, "lib/marketing/dashboard-query.ts"), "utf8");
  const action = readFileSync(path.join(ROOT, "lib/marketing/lead-value-action.ts"), "utf8");
  for (const text of [query, action]) {
    assert.equal(text.includes("setCampaignBudget"), false);
    assert.equal(text.includes("graph.facebook"), false);
    assert.equal(text.includes("googleads.googleapis"), false);
    assert.equal(text.includes("prisma.campaign.update"), false);
    assert.equal(text.includes("daily_budget"), false);
  }
  assert.match(query, /workspaceId/);
  assert.match(action, /clientSettings/);
  assert.match(action, /leadValueAudit/);
  assert.equal(action.includes("prisma.adAccount"), false);
  assert.equal(forbiddenClientKeys({ leadValueCents: 1, callValueCents: 2, externalId: "act_1" }).length >= 3, true);
});

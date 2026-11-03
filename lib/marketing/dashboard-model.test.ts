import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { canSwitchMarketingClient } from "./access";
import { forbiddenClientKeys, presentWithoutCost } from "./client-view";
import { dashboardsV2Enabled, googleAdsEnabled, marketingClientSwitcherEnabled } from "./config";
import {
  anomalies,
  anomalyReason,
  assembleCampaigns,
  audienceLabel,
  awarenessText,
  buildKpis,
  collapseMetrics,
  DASHBOARD_HISTORY_DAYS,
  DASH_DAY_OPTIONS,
  dashboardCampaignWhere,
  dashboardClientChoices,
  dashboardClientFilter,
  dashboardGoal,
  dashboardMetricWhere,
  dashboardPlatforms,
  dashSearch,
  effectiveMetric,
  funnelCaption,
  parseDashQuery,
  platformLabel,
  staffStatusSelection,
  visibleCampaigns,
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
  assert.equal(marketingClientSwitcherEnabled({}), false);
  assert.equal(marketingClientSwitcherEnabled({ MARKETING_CLIENT_SWITCHER: "on" }), true);
  assert.deepEqual(dashboardPlatforms({}), ["meta"]);
  assert.deepEqual(dashboardPlatforms({ MARKETING_GOOGLE_ADS: "on" }), ["meta", "google_ads"]);
  assert.deepEqual(dashboardPlatforms({ STACKADAPT_SYNC: "on" }), ["meta", "stackadapt"]);
  assert.deepEqual(dashboardPlatforms({ MARKETING_STACKADAPT: "on" }), ["meta", "stackadapt"]);
  assert.deepEqual(dashboardPlatforms({ MARKETING_GOOGLE_ADS: "on", STACKADAPT_SYNC: "on" }), ["meta", "google_ads", "stackadapt"]);
  assert.equal(platformLabel("stackadapt"), "StackAdapt");
  assert.equal(platformLabel("google_ads"), "Google Ads");
  assert.equal(DASHBOARD_HISTORY_DAYS >= 90 * 2, true);
  assert.deepEqual(DASH_DAY_OPTIONS, [7, 14, 30, 90]);
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
  const parsed = parseDashQuery({ d: "14", st: "paused", g: "calls", m: "s", camp: "c9", edit: "lv", client: "client_cedar" });
  assert.equal(parsed.days, 14);
  assert.equal(parsed.clientId, "client_cedar");
  assert.equal(parseDashQuery({}).metric, "l");
  assert.equal(parseDashQuery({}).days, 30);
  assert.equal(parseDashQuery({ d: "90" }).days, 90);
  assert.equal(parseDashQuery({ d: "60" }).days, 30);
  assert.equal(parseDashQuery({ client: "all" }).clientId, null);
  assert.match(dashSearch(parseDashQuery({ d: "90", client: "client_cedar" })), /d=90/);
  assert.match(dashSearch(parseDashQuery({ d: "90", client: "client_cedar" })), /client=client_cedar/);
  assert.equal(dashSearch(parseDashQuery({})).includes("client="), false);
  assert.equal(parseDashQuery({ st: "all" }).status, "");
  assert.equal(parseDashQuery({ st: "active" }).status, "active");
  assert.equal(staffStatusSelection("", ""), "active");
  assert.equal(staffStatusSelection("all", ""), "");
  assert.equal(staffStatusSelection("paused", "paused"), "paused");
  const staffUrl = dashSearch({ ...parseDashQuery({ d: "7", client: "client_cedar", st: "active" }) });
  assert.match(staffUrl, /d=7/);
  assert.match(staffUrl, /client=client_cedar/);
  assert.match(staffUrl, /st=active/);
  assert.match(dashSearch(parseDashQuery({})), /st=all/);
  const filtered = visibleCampaigns(
    [
      { id: "a", name: "Live", goal: "leads", status: "active", platform: "stackadapt", ads: [] },
      { id: "b", name: "Paused", goal: "leads", status: "paused", platform: "stackadapt", ads: [] },
      { id: "c", name: "Ended", goal: "leads", status: "other", platform: "stackadapt", ads: [] },
    ],
    { status: "active", goal: "" },
  );
  assert.deepEqual(filtered.map((row) => row.id), ["a"]);
  assert.equal(effectiveMetric({ metric: "s", goal: null, showMoney: false }), "l");
  assert.equal(effectiveMetric({ metric: "l", goal: "calls", showMoney: true }), "k");
  assert.equal(effectiveMetric({ metric: "c", goal: "awareness", showMoney: true }), "c");
  assert.equal(effectiveMetric({ metric: "l", goal: "awareness", showMoney: true }), "r");
  assert.match(sourceLine({ platforms: ["meta", "google_ads", "stackadapt"], updatedLabel: "Nov 1", accountIds: null }), /Meta, Google, and StackAdapt/);
});

const MONEY_WORDS = ["spend", "cost", "cpa", "cpl", "cpx", "roas", "budget", "bid"];

function stackAdaptClientModel() {
  const dates = ["2026-10-20"];
  const assembled = assembleCampaigns({
    dates,
    campaigns: [
      {
        id: "camp-stack",
        name: "Cedar prospecting",
        objective: "leads",
        status: "active",
        platform: "stackadapt",
        dailyBudget: 40,
        budgetSetBy: "Avery",
        budgetSetAt: "2026-10-01",
        ads: [
          {
            id: "ad-stack",
            name: "Roof photo",
            status: "active",
            format: "video",
            audienceNames: ["Homeowners"],
            thumbnailUrl: null,
          },
        ],
      },
    ],
    metrics: [
      {
        date: "2026-10-20",
        adId: "ad-stack",
        campaignId: "camp-stack",
        attributionWindow: "7d_click",
        impressions: 1000,
        clicks: 25,
        reach: 800,
        platformLeads: 2,
        platformConversions: 1,
        spend: 12.5,
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
    notes: [
      { campaignId: "camp-stack", campaignName: "Cedar prospecting", text: "The new video is earning more leads." },
      { campaignId: "camp-stack", campaignName: "Cedar prospecting", text: "CPL is $6 and the bid should rise. ROAS is 2." },
    ],
    leadValue: { leadCents: 8500, callCents: 14000, by: "Avery", at: "Oct 15" },
    sourceLine: sourceLine({ platforms: ["stackadapt"], updatedLabel: "Oct 20, 5:00 PM ET", accountIds: ["act_532471207924121"] }),
    workspaceName: "Demo workspace",
    mock: true,
  };
  return presentWithoutCost(projectDashboard(full, { mode: "client", showMoney: true, canEditLeadValue: true }), false);
}

test("a client-mode StackAdapt row keeps results and leaks no money", () => {
  const client = stackAdaptClientModel();
  assert.equal(client.mode, "client");
  assert.equal(client.showMoney, false);
  assert.equal(client.campaigns.length, 1);
  assert.equal(client.campaigns[0].platform, "stackadapt");
  assert.equal(client.campaigns[0].ads[0].days[0].i, 1000);
  assert.equal(client.campaigns[0].ads[0].days[0].c, 25);
  assert.equal(client.campaigns[0].ads[0].days[0].l, 2);
  assert.equal(client.campaigns[0].ads[0].days[0].s, undefined);
  assert.equal(client.campaigns[0].dailyBudget, undefined);
  assert.equal("leadValue" in client, false);
  assert.equal(client.notes.length, 1);
  assert.match(client.notes[0].text, /more leads/);
  assert.match(client.sourceLine, /StackAdapt/);
  const printed = JSON.stringify(client).toLowerCase();
  for (const word of MONEY_WORDS) assert.equal(printed.includes(word), false, word);
  assert.equal(printed.includes("$"), false);
  assert.equal(printed.includes("12.5"), false);
  assert.deepEqual(forbiddenClientKeys(client), []);
  const tiles = buildKpis({ campaigns: client.campaigns, days: 7, showMoney: client.showMoney, leadValue: null });
  assert.equal(tiles.some((tile) => /spend|cpa|cpc|cpm|roas|cpl/i.test(tile.label)), false);
});

test("a client param from a non-staff user does not select another client or reveal money", () => {
  const otherId = "client_north";
  const otherName = "Northwind Studio";
  const known = [otherId, "client_cedar"];
  for (const kind of ["client_owner", "client_viewer", "none"] as const) {
    assert.equal(canSwitchMarketingClient({ kind }), false);
    const picked = dashboardClientFilter({
      enabled: true,
      staff: canSwitchMarketingClient({ kind }),
      requestedId: otherId,
      knownIds: known,
    });
    assert.equal(picked, null);
    const where = dashboardCampaignWhere({
      workspaceId: "org",
      platforms: dashboardPlatforms({ STACKADAPT_SYNC: "on" }),
      clientId: picked,
    });
    assert.equal(Object.hasOwn(where, "clientId"), false);
    assert.equal(JSON.stringify(where).includes(otherId), false);
    assert.equal(
      dashboardClientChoices({
        enabled: true,
        staff: canSwitchMarketingClient({ kind }),
        choices: [{ id: otherId, name: otherName }],
      }),
      undefined,
    );
  }
  assert.equal(canSwitchMarketingClient(null), false);
  assert.equal(dashboardClientFilter({ enabled: true, staff: false, requestedId: otherId, knownIds: known }), null);
  assert.equal(dashboardClientFilter({ enabled: false, staff: true, requestedId: otherId, knownIds: known }), null);
  assert.equal(dashboardClientFilter({ enabled: true, staff: true, requestedId: "missing", knownIds: known }), null);
  assert.equal(dashboardClientFilter({ enabled: true, staff: true, requestedId: "all", knownIds: known }), null);
  const staffWhere = dashboardCampaignWhere({
    workspaceId: "org",
    platforms: ["meta", "stackadapt"],
    clientId: dashboardClientFilter({ enabled: true, staff: true, requestedId: "client_cedar", knownIds: known }),
  });
  assert.equal(staffWhere.clientId, "client_cedar");
  for (const kind of ["super_admin", "account_manager", "all_clients_viewer", "staff"] as const) {
    assert.equal(canSwitchMarketingClient({ kind }), true);
  }
  const client = stackAdaptClientModel();
  const printed = JSON.stringify(client);
  assert.equal(printed.includes(otherId), false);
  assert.equal(printed.includes(otherName), false);
  assert.equal(printed.toLowerCase().includes("88.5"), false);
  for (const word of MONEY_WORDS) assert.equal(printed.toLowerCase().includes(word), false, word);
  const query = readFileSync(path.join(ROOT, "lib/marketing/dashboard-query.ts"), "utf8");
  const page = readFileSync(path.join(ROOT, "app/(app)/marketing/page.tsx"), "utf8");
  const clientPage = readFileSync(path.join(ROOT, "app/(app)/marketing/client/page.tsx"), "utf8");
  const sharePage = readFileSync(path.join(ROOT, "app/share/[token]/page.tsx"), "utf8");
  assert.match(query, /dashboardClientFilter/);
  assert.match(query, /canSwitchMarketingClient/);
  assert.match(page, /resolveDashboardClient/);
  assert.match(clientPage, /clientId: null/);
  assert.match(sharePage, /clientId: null/);
  assert.equal(clientPage.includes("resolveDashboardClient"), false);
  assert.equal(sharePage.includes("resolveDashboardClient"), false);
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

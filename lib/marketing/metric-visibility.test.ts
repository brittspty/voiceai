import assert from "node:assert/strict";
import test from "node:test";
import { clientMetricVisibilityEnabled } from "./config";
import type { DashboardModel } from "./dashboard-model";
import type { ClientShareView } from "./client-view";
import type { ClientReport } from "./reports/types";
import { projectWithoutSpend } from "./spend-access";
import {
  CLIENT_METRICS,
  applyClientSurface,
  awarenessPreset,
  catalogView,
  channelMetricId,
  defaultVisibility,
  filterPlanChannels,
  filterPlanNumbers,
  isForbiddenMetricId,
  leadGenPreset,
  parseMetricWrite,
  presetVisibility,
  resolveVisibility,
  shapeClientDashboard,
  visibilityChanges,
} from "./metric-visibility";

const COST_IDS = ["spend", "budget", "bid", "cpm", "cpc", "cpa", "cpl", "cpql", "cpx", "cpv", "roas", "kpi.roas", "est_roas", "estimatedRoas", "margin", "internal_cost", "kpi.spend", "column.cpa", "chart.pacing"];

function sampleDashboard(): DashboardModel {
  return {
    mode: "client",
    showMoney: false,
    dates: ["2026-10-01"],
    campaigns: [
      {
        id: "camp-meta",
        name: "Harbor search",
        goal: "leads",
        status: "active",
        platform: "meta",
        ads: [
          {
            id: "ad-1",
            name: "Dockside",
            format: "Image",
            status: "active",
            audience: "Marina owners",
            thumbnailUrl: null,
            days: [{ date: "2026-10-01", i: 100, r: 80, c: 10, l: 4, k: 1, s: 25 }],
          },
        ],
      },
      {
        id: "camp-tiktok",
        name: "Sunline short video",
        goal: "awareness",
        status: "active",
        platform: "tiktok",
        ads: [
          {
            id: "ad-2",
            name: "AC checkup",
            format: "Video",
            status: "active",
            audience: "Homeowners",
            thumbnailUrl: null,
            days: [{ date: "2026-10-01", i: 50, r: 40, c: 2, l: 0, k: 0 }],
          },
        ],
      },
    ],
    notes: [{ campaignId: "camp-meta", campaignName: "Harbor search", text: "Leads picked up." }],
    sourceLine: "Meta · not yet",
    workspaceName: "Demo workspace",
    mock: true,
  };
}

test("CLIENT_METRIC_VISIBILITY defaults off and the catalog excludes cost", () => {
  assert.equal(clientMetricVisibilityEnabled({}), false);
  assert.equal(clientMetricVisibilityEnabled({ CLIENT_METRIC_VISIBILITY: "on" }), true);
  assert.equal(clientMetricVisibilityEnabled({ CLIENT_METRIC_VISIBILITY: "off" }), false);
  for (const metric of CLIENT_METRICS) {
    assert.equal(metric.defaultOn, true, metric.id);
    assert.equal(isForbiddenMetricId(metric.id), false, metric.id);
  }
  for (const id of COST_IDS) assert.equal(isForbiddenMetricId(id), true, id);
  assert.equal(isForbiddenMetricId("kpi.clicks"), false);
  assert.equal(isForbiddenMetricId("kpi.click_rate"), false);
  assert.equal(isForbiddenMetricId("column.clicks"), false);
});

test("defaults match the current client view and presets only change client-safe metrics", () => {
  const defaults = defaultVisibility();
  assert.equal(Object.values(defaults).every(Boolean), true);
  assert.deepEqual(presetVisibility("default"), defaults);
  const lead = leadGenPreset();
  assert.equal(lead["kpi.leads"], true);
  assert.equal(lead["kpi.calls"], true);
  assert.equal(lead["kpi.views"], false);
  assert.equal(lead["kpi.reach"], false);
  assert.equal(lead["chart.audiences"], false);
  const awareness = awarenessPreset();
  assert.equal(awareness["kpi.views"], true);
  assert.equal(awareness["kpi.reach"], true);
  assert.equal(awareness["kpi.leads"], false);
  assert.equal(awareness["kpi.calls"], false);
  assert.equal(awareness["column.results"], false);
  for (const map of [defaults, lead, awareness]) {
    for (const id of Object.keys(map)) assert.equal(isForbiddenMetricId(id), false, id);
  }
  assert.deepEqual(visibilityChanges(defaults, defaults), []);
  const changed = visibilityChanges(defaults, lead);
  assert.equal(changed.some((row) => row.metricId === "kpi.views" && row.oldValue === true && row.newValue === false), true);
});

test("the server allowlist ignores a forced cost metric and strips it from the client payload", () => {
  const poisoned = {
    ...defaultVisibility(),
    "kpi.spend": true,
    spend: true,
    cpa: true,
    roas: true,
    "kpi.leads": false,
  };
  const visibility = resolveVisibility(poisoned);
  assert.equal("kpi.spend" in visibility, false);
  assert.equal("spend" in visibility, false);
  assert.equal(visibility["kpi.leads"], false);
  assert.equal(visibility["kpi.views"], true);
  const rejected = parseMetricWrite(defaultVisibility(), { metrics: { "kpi.spend": true, spend: true, "kpi.cpm": true } });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.match(rejected.error, /Cost metrics stay off/);
  const ignored = parseMetricWrite(defaultVisibility(), { metrics: { "not-a-metric": false, "kpi.reach": false } });
  assert.equal(ignored.ok, true);
  if (ignored.ok) {
    assert.equal(ignored.next["kpi.reach"], false);
    assert.equal("not-a-metric" in ignored.next, false);
  }

  const dashboard = applyClientSurface(sampleDashboard(), visibility, true);
  const hidden = projectWithoutSpend(dashboard);
  const json = JSON.stringify(hidden);
  assert.equal(json.includes("\"s\""), false);
  assert.equal(json.includes("spend"), false);
  assert.equal(json.includes("roas"), false);
  assert.equal(dashboard.campaigns.some((row) => row.platform === "meta"), true);
  assert.equal(dashboard.metricVisibility?.["kpi.leads"], false);
  assert.equal(dashboard.showMoney, false);

  const model = sampleDashboard();
  const untouched = applyClientSurface(model, visibility, false);
  assert.equal(untouched, model);
  assert.equal(untouched.campaigns[0]?.ads[0]?.days[0]?.s, 25);
});

test("shape, share, report, and plan filters follow the saved map", () => {
  const offViews = resolveVisibility({ "kpi.views": false, "column.views": false, "chart.funnel": false, "kpi.click_rate": false, "column.click_rate": false, "chart.trend": false, "channel.tiktok": false });
  const shaped = shapeClientDashboard(sampleDashboard(), offViews);
  assert.equal(shaped.campaigns.some((row) => row.platform === "tiktok"), false);
  assert.equal(shaped.campaigns[0]?.ads[0]?.days[0]?.i, 0);
  assert.equal(shaped.campaigns[0]?.ads[0]?.days[0]?.l, 4);
  assert.equal(shaped.notes.length, 1);

  const share: ClientShareView = {
    client: "Harbor Point Marine",
    viewOnly: true,
    rangeLabel: "Last 7 days",
    kpis: [
      { label: "Booked calls", value: "3", delta: "", meaning: "People who booked." },
      { label: "New leads", value: "9", delta: "", meaning: "People who asked." },
      { label: "Ad views", value: "100", delta: "", meaning: "How many times people saw your ads." },
      { label: "Spend", value: "$40", delta: "", meaning: "Media spend" },
    ],
    campaigns: [
      { name: "Harbor search", status: "Doing well", booked: 2, leads: 6, channel: "Meta", detail: "2 booked calls · 6 leads · Meta" },
      { name: "Sunline short video", status: "Steady", booked: 1, leads: 3, channel: "tiktok", detail: "1 booked calls · 3 leads · tiktok" },
    ],
    updated: "Updated just now",
    sharedBy: "your marketing team",
    expires: "",
  };
  const filteredShare = applyClientSurface(share, offViews, true);
  assert.equal(filteredShare.kpis.some((row) => row.label === "Ad views"), false);
  assert.equal(filteredShare.kpis.some((row) => row.label === "Spend"), false);
  assert.equal(filteredShare.kpis.find((row) => row.label === "New leads")?.value, "6");
  assert.equal(filteredShare.campaigns.some((row) => row.channel === "tiktok"), false);
  assert.equal(JSON.stringify(filteredShare).includes("$"), false);

  const report = {
    audience: "client" as const,
    sourceId: "example",
    exampleData: true,
    updatedAt: "2026-10-30",
    clientId: "demo",
    clientName: "Harbor Point Marine",
    scopeLabel: "Harbor Point Marine",
    headline: "Results",
    subhead: "A person is counted once.",
    periodLabel: "Last 30 days",
    compareLabel: "prior period",
    compare: "prior" as const,
    range: "30d" as const,
    attribution: "A person is counted once.",
    kpis: [
      { id: "leads", label: "Leads", definition: "Form fills", value: 9, format: "integer" as const, delta: "", tone: "good" as const, spark: [1] },
      { id: "roas", label: "ROAS", definition: "Return", value: 2, format: "integer" as const, delta: "", tone: "good" as const, spark: [1] },
    ],
    series: [],
    defaultSeriesId: "",
    annotations: [],
    channels: [
      { id: "meta", name: "Facebook & Instagram ads", qualified: 1, leads: 6, booked: 2, color: "#FF5800" },
      { id: "tiktok", name: "TikTok", qualified: 0, leads: 3, booked: 1, color: "#231F20" },
    ],
    funnel: [
      { id: "views", label: "Views", value: 100, share: "" },
      { id: "leads", label: "Leads", value: 9, share: "" },
    ],
    channelHeading: "Where your leads came from",
    flags: [],
    flagsHeading: "Heads up",
    pdf: { kicker: "Performance report", coverSentence: "Results.", resultsKicker: "01", resultsTitle: "Results", preparer: "Your marketing team", annotation: "", periodName: "Last 30 days" },
    footer: "jAI by Specificity",
  } satisfies ClientReport;
  const filteredReport = applyClientSurface(report, offViews, true);
  assert.equal(filteredReport.kpis.some((row) => row.id === "roas"), false);
  assert.equal(filteredReport.channels.some((row) => row.id === "tiktok"), false);
  assert.equal(filteredReport.funnel.some((step) => step.id === "views"), false);
  assert.equal(filteredReport.funnel.some((step) => step.id === "leads"), true);

  assert.deepEqual(filterPlanNumbers({ impressions: 10, clicks: 4, leads: 2, spendCents: 99, roas: 3 } as { impressions: number; clicks: number; leads: number }, offViews), {
    clicks: 4,
    leads: 2,
  });
  assert.deepEqual(filterPlanChannels(["Meta", "TikTok", "StackAdapt"], offViews), ["Meta", "StackAdapt"]);
  assert.equal(channelMetricId("Google Business Profile"), "channel.google");
  assert.equal(catalogView(offViews).some((row) => row.id === "kpi.spend"), false);
});

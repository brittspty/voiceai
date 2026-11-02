import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { readScopedClient } from "./client-contract";
import {
  campaignVisibleToClient,
  clientOwnsCampaignFilter,
  clientScopeWhere,
  clientSurfaceCampaignWhere,
  clientSurfaceMetricWhere,
  metricVisibleToClient,
  scopeClientRecords,
  scopeReportCampaigns,
} from "./client-read-scope";
import { presentForAudience } from "./share-payload";
import { clientShareCsv } from "./client-view";
import { forbiddenClientKeys } from "./client-view";
import { projectDashboard, type DashboardModel } from "./dashboard-model";
import { applyLiveCampaignScope } from "./reports/campaign-scope";

const ROOT = path.resolve(import.meta.dirname, "../..");

const NORTH = "fixture_north";
const SOUTH = "fixture_south";

function row(name: string, clientId: string | null, accountClientId: string | null, workspaceId = "org") {
  return {
    id: name,
    name,
    workspaceId,
    clientId,
    accountClientId,
    adGroups: [{ id: `${name}-set`, ads: [{ id: `${name}-ad` }] }],
    rows: [{ id: `${name}-metric` }],
  };
}

const shared = [
  row("North launch", NORTH, null),
  row("South launch", SOUTH, null),
  row("Unassigned", null, null),
  row("North account", null, NORTH),
  row("Moved off North", SOUTH, NORTH),
];

test("two clients on one shared account only see their own campaigns, ad sets, ads, and rows", () => {
  const north = scopeClientRecords(NORTH, shared);
  const south = scopeClientRecords(SOUTH, shared);
  assert.deepEqual(north.map((item) => item.name), ["North launch", "North account"]);
  assert.deepEqual(south.map((item) => item.name), ["South launch", "Moved off North"]);
  assert.deepEqual(north.flatMap((item) => item.adGroups?.flatMap((group) => [group.id, ...(group.ads?.map((ad) => ad.id) ?? [])]) ?? []), ["North launch-set", "North launch-ad", "North account-set", "North account-ad"]);
  assert.equal(JSON.stringify(north).includes("South"), false);
  assert.equal(JSON.stringify(south).includes("North launch"), false);
  assert.equal(JSON.stringify(north).includes("Unassigned"), false);
  assert.equal(campaignVisibleToClient({ workspaceId: "org", clientId: SOUTH, accountClientId: null }, NORTH), false);
  assert.equal(metricVisibleToClient({ workspaceId: "org", campaignId: null, clientId: null, accountClientId: null }, NORTH), false);
  assert.equal(metricVisibleToClient({ workspaceId: "fixture_north", campaignId: null, clientId: null, accountClientId: null }, NORTH), true);

  const start = new Date("2026-10-01T00:00:00.000Z");
  const end = new Date("2026-10-31T00:00:00.000Z");
  const whereNorth = clientSurfaceMetricWhere(NORTH, "all", start, end);
  const whereSouth = clientSurfaceCampaignWhere({ scopeId: SOUTH, platforms: ["meta"] });
  assert.equal(JSON.stringify(whereNorth).includes(SOUTH), false);
  assert.equal(JSON.stringify(whereSouth).includes(NORTH), false);
  assert.equal(JSON.stringify(clientOwnsCampaignFilter(NORTH)).includes(SOUTH), false);
  assert.equal(JSON.stringify(clientScopeWhere(SOUTH)).includes(NORTH), false);
});

test("an account mapped to one client still includes that client's unassigned campaigns", () => {
  const owned = scopeClientRecords("fixture_harbor", [
    row("Harbor search", null, "fixture_harbor", "org"),
    row("Other brand", "fixture_other", "fixture_harbor", "org"),
  ]);
  assert.deepEqual(owned.map((item) => item.name), ["Harbor search"]);
});

test("a client viewer and a share link see no spend, bid, CPA, CPL, CPx, ROAS, budget, or cost", () => {
  const north = scopeReportCampaigns(NORTH, shared);
  const poisoned = {
    client: "Fixture North",
    clientId: NORTH,
    campaigns: north.map((item) => ({
      name: item.name,
      status: "Doing well",
      booked: 1,
      leads: 4,
      channel: "Meta",
      spend: 40,
      bid: 2,
      cpa: 9,
      cpl: 8,
      cpx: 7,
      roas: 1.4,
      budget: 100,
      cost: 12,
    })),
    spend: 40,
    bid: 2,
    cpa: 9,
    cpl: 8,
    cpx: 7,
    roas: 1.4,
    budget: 100,
    cost: 12,
  };
  const viewer = readScopedClient({
    kind: "client_viewer",
    ownClientId: NORTH,
    assignedClientIds: [NORTH],
    requestedClientId: NORTH,
    payload: poisoned,
  });
  assert.equal(viewer.ok, true);
  if (!viewer.ok) return;
  const body = presentForAudience(viewer.body, "client");
  assert.deepEqual(forbiddenClientKeys(body), []);
  assert.equal(JSON.stringify(body).toLowerCase().includes("south"), false);
  const share = presentForAudience(poisoned, "share");
  assert.deepEqual(forbiddenClientKeys(share), []);
  assert.equal(/spend|bid|cpa|cpl|cpx|roas|budget|cost/i.test(clientShareCsv({
    client: "Fixture North",
    adViews: 10,
    leads: 4,
    booked: 1,
    campaigns: north.map((item) => ({ name: item.name, status: "Doing well", booked: 1, leads: 4, channel: "Meta" })),
    rangeLabel: "Last 7 days",
    updated: "Updated 1:00 PM ET",
    notes: [],
  })), false);

  const model: DashboardModel = {
    mode: "client",
    showMoney: true,
    dates: ["2026-10-01"],
    campaigns: [{
      id: "north",
      name: "North launch",
      goal: "leads",
      status: "active",
      platform: "meta",
      dailyBudget: 40,
      budgetSetBy: "Pat Example",
      budgetSetAt: "2026-10-01",
      ads: [{
        id: "north-ad",
        name: "North ad",
        format: "image",
        status: "active",
        audience: "People nearby",
        thumbnailUrl: null,
        days: [{ date: "2026-10-01", i: 10, r: 8, c: 2, l: 1, k: 0, s: 25 }],
      }],
    }],
    notes: [{ campaignId: "north", campaignName: "North launch", text: "Spend was $25 and CPA moved" }],
    leadValue: { leadCents: 1000, callCents: null, by: "Pat Example", at: "Oct 1" },
    sourceLine: "Meta · account act_123",
    workspaceName: "Fixture North",
    mock: false,
  };
  const safe = projectDashboard(model, { mode: "client", showMoney: true, canEditLeadValue: true });
  assert.equal(safe.showMoney, false);
  assert.equal(safe.campaigns[0]?.dailyBudget, undefined);
  assert.equal(safe.campaigns[0]?.ads[0]?.days[0] && "s" in safe.campaigns[0].ads[0].days[0], false);
  assert.deepEqual(forbiddenClientKeys(safe), []);
  assert.equal(safe.notes.length, 0);
});

test("share links and reports stay on the requested client's campaigns", () => {
  const linked = scopeReportCampaigns(NORTH, shared);
  assert.deepEqual(linked.map((item) => item.id), ["North launch", "North account"]);
  assert.equal(scopeReportCampaigns("all", shared).length, shared.length);
  const shareWhere = clientSurfaceMetricWhere(NORTH, ["acct_shared"], new Date("2026-10-01T00:00:00.000Z"), new Date("2026-10-07T00:00:00.000Z"));
  assert.equal(JSON.stringify(shareWhere).includes(SOUTH), false);
  assert.equal(JSON.stringify(shareWhere).includes(NORTH), true);
  const labeled = applyLiveCampaignScope(
    { exampleData: false, audience: "client" as const, scopeLabel: "Everyone" },
    linked.map((item) => item.name),
  );
  assert.equal(labeled.scopeLabel.includes("South"), false);
  assert.equal(labeled.scopeLabel.includes("North launch"), true);
  const example = applyLiveCampaignScope(
    { exampleData: true, audience: "client" as const, scopeLabel: "Harbor Dental" },
    ["North launch"],
  );
  assert.equal(example.scopeLabel, "Harbor Dental");

  const shareRoute = readFileSync(path.join(ROOT, "app/api/share/[token]/route.ts"), "utf8");
  const clientRoute = readFileSync(path.join(ROOT, "app/api/marketing/client/route.ts"), "utf8");
  const exportRoute = readFileSync(path.join(ROOT, "app/api/marketing/client/export/route.ts"), "utf8");
  const queries = readFileSync(path.join(ROOT, "lib/marketing/queries.ts"), "utf8");
  const dashboard = readFileSync(path.join(ROOT, "lib/marketing/dashboard-query.ts"), "utf8");
  const guard = readFileSync(path.join(ROOT, "lib/marketing/reports/guard.ts"), "utf8");
  assert.match(shareRoute, /campaignsForReport/);
  assert.match(shareRoute, /loadClientPerformance/);
  assert.match(clientRoute, /loadClientPerformance/);
  assert.match(exportRoute, /loadClientPerformance/);
  assert.match(queries, /clientSurfaceMetricWhere/);
  assert.match(queries, /filterShareView/);
  assert.match(dashboard, /clientSurfaceCampaignWhere/);
  assert.match(dashboard, /withClientDashboardMetrics/);
  assert.match(dashboard, /mode === "client"/);
  assert.match(guard, /campaignsForReport/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { assembleHome, homeCostKeys, homeFeatures, homeHasForeignClient, homeKpiTotals } from "./home-dashboard";
import { homeScope, scopeWorkspaceIds, workspaceReads } from "./isolation";
import { isolatedWhere } from "./workspace";

const ROOT = path.resolve(import.meta.dirname, "../..");

const ORG = { id: "org", name: "Specificity Inc", voiceEnabled: true };
const GULF = { id: "gulf", name: "Gulf Coast Senior Insurance", voiceEnabled: false };

function metric(workspaceId: string, leads: number, spend: number) {
  return { workspaceId, platform: "meta" as const, impressions: leads * 100, clicks: leads * 4, leads, calls: 0, spend };
}

test("isolatedWhere refuses an empty client list", () => {
  assert.throws(() => isolatedWhere(" "), /workspace/);
  assert.throws(() => isolatedWhere(""), /workspace/);
  assert.throws(() => workspaceReads([]), /workspace/);
  assert.throws(() => workspaceReads([" ", ""]), /workspace/);
  assert.deepEqual(isolatedWhere("org"), { workspaceId: "org" });
  assert.deepEqual(workspaceReads([" org ", "gulf", "org"]), [{ workspaceId: "org" }, { workspaceId: "gulf" }]);
  assert.throws(() => isolatedWhere("gulf", { workspaceId: "org" }), /mismatch/);
});

test("a client role cannot open another client or an aggregate", () => {
  const other = homeScope({ roleKind: "client_viewer", workspaceId: "gulf", requestedId: "org", knownIds: ["org", "gulf"] });
  assert.equal(other.kind, "none");
  assert.deepEqual(scopeWorkspaceIds(other), []);
  const own = homeScope({ roleKind: "client_viewer", workspaceId: "gulf", requestedId: null, knownIds: ["org", "gulf"] });
  assert.deepEqual(own, { kind: "one", workspaceId: "gulf" });
  const owner = homeScope({ roleKind: "staff", workspaceId: "org", requestedId: "gulf", knownIds: ["org", "gulf"] });
  assert.equal(owner.kind, "none");
  const staff = homeScope({ roleKind: "super_admin", workspaceId: "org", requestedId: null, knownIds: ["org", "gulf"] });
  assert.equal(staff.kind, "aggregate");
  if (staff.kind === "aggregate") assert.deepEqual(staff.workspaceIds, ["org", "gulf"]);
});

test("a client view drops other clients, aggregates, cost, and voice they do not have", () => {
  const model = assembleHome({
    scope: { kind: "one", workspaceId: "gulf" },
    showMoney: false,
    canPickClient: false,
    workspaces: [ORG, GULF],
    metrics: [metric("org", 40, 900), metric("gulf", 3, 20)],
    overPaceByWorkspace: [{ workspaceId: "org", count: 2 }],
    features: homeFeatures({
      googleOn: false,
      hasGoogleRows: false,
      speedOn: false,
      speedDetail: null,
      qualityOn: false,
      qualityDetail: null,
      landingOn: false,
      landingDetail: null,
      fatigueOn: false,
      fatigueDetail: null,
      showMoney: true,
      pacingOn: true,
      pacingDetail: "2 campaigns are ahead of pace.",
      searchOn: false,
      searchDetail: null,
      competitorsOn: false,
      competitorsDetail: null,
      holdoutsOn: false,
      holdoutsDetail: null,
    }),
    voice: { dials: 12, answered: 4, meetings: 1 },
  });
  assert.equal(model.aggregate, false);
  assert.equal(model.denied, false);
  assert.equal(model.showMoney, false);
  assert.deepEqual(model.clients.map((client) => client.id), ["gulf"]);
  assert.equal(model.clients[0]?.leads, 3);
  assert.equal(model.clients[0]?.spend, undefined);
  assert.equal(model.voice, null);
  assert.equal(model.features.some((feature) => feature.id === "pacing"), false);
  assert.equal(homeHasForeignClient(model, "gulf"), false);
  assert.deepEqual(homeCostKeys(model), []);
  assert.equal(JSON.stringify(model).includes("Specificity"), false);
  assert.equal(homeKpiTotals(model.clients).leads, 3);
});

test("staff aggregate keeps every client and puts voice beside the ad totals", () => {
  const model = assembleHome({
    scope: { kind: "aggregate", workspaceIds: ["org", "gulf"] },
    showMoney: true,
    canPickClient: true,
    workspaces: [ORG, GULF],
    metrics: [metric("org", 10, 100), metric("gulf", 4, 40)],
    overPaceByWorkspace: [{ workspaceId: "gulf", count: 1 }],
    features: homeFeatures({
      googleOn: false,
      hasGoogleRows: false,
      speedOn: false,
      speedDetail: null,
      qualityOn: false,
      qualityDetail: null,
      landingOn: false,
      landingDetail: null,
      fatigueOn: false,
      fatigueDetail: null,
      showMoney: true,
      pacingOn: false,
      pacingDetail: null,
      searchOn: false,
      searchDetail: null,
      competitorsOn: false,
      competitorsDetail: null,
      holdoutsOn: false,
      holdoutsDetail: null,
    }),
    voice: { dials: 8, answered: 3, meetings: 1 },
  });
  assert.equal(model.aggregate, true);
  assert.equal(model.title, "All clients");
  assert.deepEqual(model.clients.map((client) => client.name).sort(), ["Gulf Coast Senior Insurance", "Specificity Inc"]);
  assert.equal(homeKpiTotals(model.clients).leads, 14);
  assert.equal(homeKpiTotals(model.clients).spend, 140);
  assert.deepEqual(model.voice?.clients, ["Specificity Inc"]);
  assert.equal(model.features.some((feature) => feature.id === "pacing"), true);
  assert.match(model.features.find((feature) => feature.id === "speed")?.detail || "", /off/i);
  assert.match(model.features.find((feature) => feature.id === "platforms")?.detail || "", /Google is off/);
  for (const id of ["landing", "fatigue", "search", "competitors", "holdouts"] as const) {
    assert.match(model.features.find((feature) => feature.id === id)?.detail || "", /off/i);
  }
  assert.match(model.features.find((feature) => feature.id === "pacing")?.detail || "", /Pacing is off/);
});

test("home queries scope every client read with isolatedWhere", () => {
  const query = readFileSync(path.join(ROOT, "lib/marketing/home-query.ts"), "utf8");
  const client = readFileSync(path.join(ROOT, "lib/marketing/queries.ts"), "utf8");
  const scope = readFileSync(path.join(ROOT, "lib/marketing/scope.ts"), "utf8");
  const isolation = readFileSync(path.join(ROOT, "lib/marketing/isolation.ts"), "utf8");
  assert.match(query, /isolatedWhere\(workspaceId\)/);
  assert.match(query, /workspaceReads\(ids\)/);
  assert.match(query, /requireWorkspaceId\(access\.workspaceId\)/);
  assert.match(client, /clientMetricWhere\(meta\.workspaceId/);
  assert.match(scope, /isolatedWhere\(/);
  assert.equal(isolation.includes("export function isolatedWhere"), false);
  assert.equal(query.includes("workspaceId: { in"), false);
  assert.equal(query.includes("findMany()"), false);
});

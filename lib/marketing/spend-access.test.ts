import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { accessFromUser } from "./access";
import { stripForAudience } from "./channels/cost-strip";
import { readScopedClient } from "./client-contract";
import { buildCtvView, ctvPayloadForViewer } from "./ctv/report";
import { exampleCtvPull } from "./ctv/fixtures";
import { forReader } from "./p1-reader";
import { presentForAudience } from "./share-payload";
import { allClientsViewerSeesCost } from "./config";
import { canSeeSpend, moneyText, projectWithoutSpend } from "./spend-access";
import { applyClientSurface, parseMetricWrite, resolveVisibility } from "./metric-visibility";
import { putMetricSettings, type MetricSettingsStore } from "./metric-visibility-api";

const ROOT = path.resolve(import.meta.dirname, "../..");

const POISON = {
  leads: 4,
  clicks: 9,
  headline: "48 qualified leads",
  spend: 10,
  budget: 3,
  cost: 2,
  cpa: 8,
  cpl: 7,
  cpql: 6,
  roas: 1.2,
  bid: 5,
  maxBid: 11,
  max_bid_micros: 12,
  futureMargin: 99,
  note: "CPA is $40 and the bid moved",
  nested: { clicks: 2, cost: 1 },
};

const BANNED = ["spend", "budget", "cost", "cpa", "cpl", "cpql", "roas", "bid", "futuremargin", "maxbid", "$"];

function leaked(value: unknown) {
  const hits: string[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === "object") {
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
        const token = key.toLowerCase().replace(/[_-]/g, "");
        if (BANNED.filter((word) => word !== "$").some((word) => token.includes(word))) hits.push(key);
        if (typeof child === "string" && (moneyText(child) || child.includes("$"))) hits.push(`${key}:${child}`);
        walk(child);
      }
    }
  };
  walk(value);
  return hits;
}

const CLIENT_SURFACES: { file: string; mark: RegExp }[] = [
  { file: "app/api/marketing/client/route.ts", mark: /presentForAudience|readScopedClient|projectWithoutSpend/ },
  { file: "app/api/marketing/client/export/route.ts", mark: /readScopedClient|projectWithoutSpend/ },
  { file: "app/api/share/[token]/route.ts", mark: /presentForAudience|readScopedClient/ },
  { file: "app/api/share/[token]/export/route.ts", mark: /presentForAudience|readScopedClient|export \{ GET \}/ },
  { file: "app/api/marketing/reports/route.ts", mark: /readScopedClient/ },
  { file: "app/api/marketing/reports/export/route.ts", mark: /readScopedClient/ },
  { file: "app/api/marketing/jarvis/home/route.ts", mark: /jarvisHomeBody|forSpendViewer|readScopedClient/ },
  { file: "app/api/marketing/audience-data/route.ts", mark: /audienceListBody|forSpendViewer|projectWithoutSpend|reader/ },
  { file: "app/api/marketing/audience-p1/drill/route.ts", mark: /presentDrill|forReader/ },
  { file: "app/api/marketing/audience-p1/lineage/route.ts", mark: /presentLineage|forReader/ },
  { file: "app/api/marketing/audience-p1/tests/route.ts", mark: /presentTests|forReader/ },
  { file: "app/api/marketing/reports/p1/channels/[channelId]/route.ts", mark: /buildChannelReport|forReader/ },
  { file: "app/api/marketing/reports/p1/schedules/route.ts", mark: /forReader|presentSchedules/ },
  { file: "app/api/marketing/chatgpt-ads/route.ts", mark: /presentChatgptAdsReport/ },
  { file: "app/api/marketing/ctv/route.ts", mark: /answerCtvRequest|ctvPayloadForViewer/ },
  { file: "app/plan/[code]/page.tsx", mark: /showCost: false/ },
  { file: "app/(app)/plans/[id]/preview/page.tsx", mark: /showCost: false/ },
  { file: "lib/demo/present.ts", mark: /projectWithoutSpend/ },
  { file: "lib/marketing/digest.ts", mark: /account_manager|buildManagerDigest/ },
  { file: "app/api/marketing/metric-visibility/route.ts", mark: /putMetricSettings/ },
  { file: "lib/marketing/metric-visibility.ts", mark: /Cost metrics stay off for clients/ },
  { file: "app/api/share/[token]/route.ts", mark: /releaseShare|applyClientSurface/ },
];

test("only Specificity staff can see spend and bid", () => {
  assert.equal(allClientsViewerSeesCost({}), false);
  assert.equal(canSeeSpend(null), false);
  assert.equal(canSeeSpend({ role: "intern" }), false);
  assert.equal(canSeeSpend({ role: "owner", kind: "client_owner" }), false);
  assert.equal(canSeeSpend({ role: "client_viewer" }), false);
  assert.equal(canSeeSpend({ role: "viewer", kind: "staff" }), false);
  assert.equal(canSeeSpend({ role: "demo_viewer" }), false);
  assert.equal(canSeeSpend({ role: "all_clients_viewer" }), false);
  assert.equal(canSeeSpend({ role: "all_clients_viewer" }, { ALL_CLIENTS_VIEWER_SEES_COST: "on" }), true);
  for (const role of ["super_admin", "admin", "account_manager"]) {
    assert.equal(canSeeSpend({ role }), true, role);
  }
  assert.equal(accessFromUser({ id: "a", email: "a@example.com", role: "admin" }, [], {}).seesCost, true);
  assert.equal(accessFromUser({ id: "o", email: "o@example.com", role: "owner" }, [], {}).seesCost, false);
  assert.equal(accessFromUser({ id: "v", email: "v@example.com", role: "viewer" }, [], {}).seesCost, false);
});

test("staff still receive spend, bid, CPA, and a new money field", () => {
  const staff = stripForAudience(POISON, "staff");
  assert.equal(staff.spend, 10);
  assert.equal(staff.bid, 5);
  assert.equal(staff.cpa, 8);
  assert.equal(staff.futureMargin, 99);
  assert.equal(staff.note.includes("$40"), true);
});

test("each client-facing route and export drops spend, bid, CPA, and unknown money", () => {
  for (const surface of CLIENT_SURFACES) {
    const source = readFileSync(path.join(ROOT, surface.file), "utf8");
    assert.match(source, surface.mark, surface.file);
    const hidden = projectWithoutSpend(POISON);
    assert.deepEqual(leaked(hidden), [], surface.file);
    assert.equal(hidden.leads, 4, surface.file);
    assert.equal(hidden.headline, "48 qualified leads", surface.file);
    assert.equal("futureMargin" in hidden, false, surface.file);
  }

  for (const kind of ["client_owner", "client_viewer", "share"] as const) {
    const read = readScopedClient({
      kind,
      ownClientId: "harbor",
      assignedClientIds: ["harbor"],
      requestedClientId: "harbor",
      payload: POISON,
    });
    assert.equal(read.ok, true, kind);
    if (read.ok) assert.deepEqual(leaked(read.body), [], kind);
  }
  assert.deepEqual(leaked(presentForAudience(POISON, "client")), []);
  assert.deepEqual(leaked(presentForAudience(POISON, "share")), []);
  assert.deepEqual(leaked(forReader(POISON, "client")), []);
  assert.deepEqual(leaked(forReader(POISON, "share")), []);
  assert.deepEqual(leaked(stripForAudience(POISON, "client")), []);
  assert.deepEqual(leaked(stripForAudience(POISON, "share")), []);

  const view = buildCtvView(exampleCtvPull());
  assert.deepEqual(leaked(ctvPayloadForViewer(view, "client")), []);
  assert.deepEqual(leaked(ctvPayloadForViewer(view, "share")), []);
  assert.equal(ctvPayloadForViewer(view, "staff").delivery.spend > 0, true);
});

test("a forced cost metric on the settings API stays stripped for the client", async () => {
  const writes: unknown[] = [];
  const store: MetricSettingsStore = {
    async read() {
      return { spend: true, "kpi.spend": true, cpa: true, roas: true, "kpi.leads": true };
    },
    async write(_workspaceId, metrics) {
      writes.push(metrics);
    },
    async audit() {
      throw new Error("cost metrics must not be audited");
    },
  };
  const forced = await putMetricSettings(
    { id: "sa", name: "Jordan Lee", kind: "super_admin", knownIds: ["demo"], assignedIds: [] },
    { clientId: "demo", metrics: { spend: true, "kpi.cpa": true, "kpi.roas": true, margin: true, internal_cost: true } },
    store,
    { CLIENT_METRIC_VISIBILITY: "on" },
  );
  assert.equal(forced.status, 400);
  assert.equal(writes.length, 0);
  const rejected = parseMetricWrite(resolveVisibility(null), { metrics: { "kpi.cpm": true } });
  assert.equal(rejected.ok, false);
  const released = projectWithoutSpend(applyClientSurface({ ...POISON, viewOnly: true, client: "Harbor Point Marine", kpis: [{ label: "Spend", value: "$10", delta: "", meaning: "Media spend" }, { label: "New leads", value: "4", delta: "", meaning: "People who asked." }], campaigns: [] }, resolveVisibility(await store.read()), true));
  assert.deepEqual(leaked(released), []);
  assert.equal(released.leads, 4);
});

import assert from "node:assert/strict";
import { applyClientSurface, parseMetricWrite, resolveVisibility } from "../lib/marketing/metric-visibility";
import { putMetricSettings, type MetricSettingsStore } from "../lib/marketing/metric-visibility-api";
import { projectWithoutSpend } from "../lib/marketing/spend-access";

/**
 * Spend-hiding QA for per-client metric settings.
 * A caller can try to force spend, bid, CPx, ROAS, margin, or internal cost on.
 * The API rejects that write, and a poisoned saved map still leaves the client payload stripped.
 */
const POISON = {
  leads: 4,
  headline: "48 qualified leads",
  viewOnly: true,
  client: "Harbor Point Marine",
  kpis: [
    { label: "New leads", value: "4", delta: "", meaning: "People who asked." },
    { label: "Spend", value: "$40", delta: "", meaning: "CPA moved" },
  ],
  campaigns: [],
  spend: 10,
  budget: 3,
  cost: 2,
  cpa: 8,
  cpl: 7,
  cpm: 6,
  cpc: 5,
  roas: 1.2,
  bid: 4,
  margin: 9,
  internal_cost: 11,
};

function leaked(value: unknown) {
  const hits: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === "string" && /\$|spend|cpa|roas|margin|budget|bid/i.test(node)) hits.push(node);
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === "object") {
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
        const token = key.toLowerCase().replace(/[_-]/g, "");
        if (/spend|budget|cost|cpa|cpl|cpm|cpc|roas|bid|margin/.test(token)) hits.push(key);
        walk(child);
      }
    }
  };
  walk(value);
  return hits;
}

async function main() {
  const writes: unknown[] = [];
  const store: MetricSettingsStore = {
    async read() {
      return { spend: true, "kpi.spend": true, "kpi.cpa": true, roas: true, margin: true, "kpi.leads": true };
    },
    async write(_workspaceId, metrics) {
      writes.push(metrics);
    },
    async audit() {
      throw new Error("a rejected cost metric must not be audited");
    },
  };

  const forced = await putMetricSettings(
    { id: "sa", name: "Jordan Lee", kind: "super_admin", knownIds: ["demo"], assignedIds: [] },
    { clientId: "demo", metrics: { spend: true, budget: true, bid: true, "kpi.cpm": true, "kpi.cpc": true, "kpi.cpa": true, "kpi.cpl": true, cpx: true, "kpi.roas": true, margin: true, internal_cost: true } },
    store,
    { CLIENT_METRIC_VISIBILITY: "on" },
  );
  assert.equal(forced.status, 400, "the API must reject a forced cost metric");
  assert.equal(writes.length, 0, "a rejected cost metric must not be stored");
  assert.equal(parseMetricWrite(resolveVisibility(null), { metrics: { "kpi.roas": true } }).ok, false);

  const visibility = resolveVisibility(await store.read("demo"));
  assert.equal(visibility["kpi.spend"], undefined);
  assert.equal(visibility["kpi.leads"], true);
  const hidden = projectWithoutSpend(applyClientSurface(POISON, visibility, true));
  assert.deepEqual(leaked(hidden), []);
  assert.equal(hidden.leads, 4);
  assert.equal(hidden.kpis.some((row: { label: string }) => row.label === "New leads"), true);
  assert.equal(hidden.kpis.some((row: { label: string }) => row.label === "Spend"), false);
  console.log("qa:spend ok — metric settings cannot turn cost on for a client");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

import assert from "node:assert/strict";
import test from "node:test";
import { accessFromUser } from "./access";
import { projectWithoutSpend } from "./spend-access";
import { applyClientSurface, defaultVisibility, resolveVisibility } from "./metric-visibility";
import {
  allowedMetricClientIds,
  getMetricSettings,
  metricSettingsPermission,
  putMetricSettings,
  type MetricActor,
  type MetricAuditRow,
  type MetricSettingsStore,
} from "./metric-visibility-api";

const ON = { CLIENT_METRIC_VISIBILITY: "on" };
const WHEN = new Date("2026-11-02T18:00:00.000Z");

function actor(kind: MetricActor["kind"], extra: Partial<MetricActor> = {}): MetricActor {
  return {
    id: kind,
    name: kind === "super_admin" ? "Jordan Lee" : "Casey Demo",
    kind,
    knownIds: ["demo", "harbor"],
    assignedIds: ["demo"],
    ...extra,
  };
}

function memoryStore(initial: Record<string, unknown> = {}) {
  const saved = new Map<string, unknown>(Object.entries(initial));
  const audits: MetricAuditRow[] = [];
  const writes: unknown[] = [];
  const store: MetricSettingsStore = {
    async read(workspaceId) {
      return saved.get(workspaceId) ?? null;
    },
    async write(workspaceId, metrics) {
      writes.push({ workspaceId, metrics });
      saved.set(workspaceId, metrics);
    },
    async audit(rows) {
      audits.push(...rows);
    },
  };
  return { store, saved, audits, writes };
}

test("staff can edit, the all-clients viewer can read, and client roles cannot", () => {
  assert.deepEqual(metricSettingsPermission("super_admin"), { view: true, edit: true });
  assert.deepEqual(metricSettingsPermission("account_manager"), { view: true, edit: true });
  assert.deepEqual(metricSettingsPermission("all_clients_viewer"), { view: true, edit: false });
  assert.deepEqual(metricSettingsPermission("client_viewer"), { view: false, edit: false });
  assert.deepEqual(metricSettingsPermission("client_owner"), { view: false, edit: false });
  assert.deepEqual(metricSettingsPermission("none"), { view: false, edit: false });
  assert.deepEqual(allowedMetricClientIds({ kind: "super_admin", knownIds: ["demo", "harbor"], assignedIds: [] }), ["demo", "harbor"]);
  assert.deepEqual(allowedMetricClientIds({ kind: "all_clients_viewer", knownIds: ["demo", "harbor"], assignedIds: [] }), ["demo", "harbor"]);
  assert.deepEqual(allowedMetricClientIds({ kind: "account_manager", knownIds: ["demo", "harbor"], assignedIds: ["demo"] }), ["demo"]);
  assert.deepEqual(allowedMetricClientIds({ kind: "client_viewer", knownIds: ["demo"], assignedIds: ["demo"] }), []);
  assert.equal(
    accessFromUser({ id: "c", email: "c@example.com", role: "client_viewer" }, [{ workspaceId: "demo", scopeKind: "client", adAccountId: null, campaignId: null }], {}).kind,
    "client_viewer",
  );
});

test("the settings API rejects client roles and records an audit row for staff", async () => {
  const { store, audits, writes } = memoryStore();
  const off = await getMetricSettings(actor("super_admin"), "demo", store, {});
  assert.equal(off.status, 404);

  for (const kind of ["client_viewer", "client_owner", "none"] as const) {
    const read = await getMetricSettings(actor(kind), "demo", store, ON);
    assert.equal(read.status, 403, kind);
    const write = await putMetricSettings(actor(kind), { clientId: "demo", metrics: { "kpi.leads": false } }, store, ON, WHEN);
    assert.equal(write.status, 403, kind);
  }

  const viewer = await getMetricSettings(actor("all_clients_viewer"), "demo", store, ON);
  assert.equal(viewer.status, 200);
  assert.equal(viewer.body.canEdit, false);
  const viewerWrite = await putMetricSettings(actor("all_clients_viewer"), { clientId: "demo", reset: true }, store, ON, WHEN);
  assert.equal(viewerWrite.status, 403);

  const foreign = await putMetricSettings(actor("account_manager"), { clientId: "harbor", metrics: { "kpi.clicks": false } }, store, ON, WHEN);
  assert.equal(foreign.status, 403);
  const missing = await getMetricSettings(actor("super_admin"), "missing", store, ON);
  assert.equal(missing.status, 404);

  const saved = await putMetricSettings(actor("super_admin"), { clientId: "demo", metrics: { "kpi.reach": false } }, store, ON, WHEN);
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.saved, ["kpi.reach"]);
  assert.equal(audits.length, 1);
  assert.equal(audits[0]?.workspaceId, "demo");
  assert.equal(audits[0]?.metricId, "kpi.reach");
  assert.equal(audits[0]?.oldValue, true);
  assert.equal(audits[0]?.newValue, false);
  assert.equal(audits[0]?.userId, "super_admin");
  assert.equal(audits[0]?.userName, "Jordan Lee");
  assert.equal(audits[0]?.createdAt.toISOString(), WHEN.toISOString());

  const manager = await putMetricSettings(actor("account_manager", { id: "am", name: "Avery Quinn" }), { clientId: "demo", preset: "lead_gen" }, store, ON, WHEN);
  assert.equal(manager.status, 200);
  assert.equal(audits.some((row) => row.userId === "am" && row.metricId === "kpi.views" && row.newValue === false), true);

  const reset = await putMetricSettings(actor("super_admin"), { clientId: "demo", reset: true }, store, ON, WHEN);
  assert.equal(reset.status, 200);
  assert.equal(writes.length > 0, true);
  const after = resolveVisibility(await store.read("demo"));
  assert.deepEqual(after, defaultVisibility());
});

test("forcing a cost metric through the API is rejected and the client payload stays stripped", async () => {
  const poisoned = { "kpi.spend": true, spend: true, cpa: 12, roas: 4, "kpi.cpm": true, "kpi.leads": true };
  const { store, audits, writes } = memoryStore({ demo: poisoned });
  const beforeWrites = writes.length;
  const forced = await putMetricSettings(actor("super_admin"), { clientId: "demo", metrics: { spend: true, "kpi.cpa": true, "kpi.roas": true, margin: true } }, store, ON, WHEN);
  assert.equal(forced.status, 400);
  assert.match(String(forced.body.error), /Cost metrics stay off/);
  assert.equal(writes.length, beforeWrites);
  assert.equal(audits.length, 0);

  const read = await getMetricSettings(actor("super_admin"), "demo", store, ON);
  assert.equal(read.status, 200);
  const metrics = read.body.metrics as { id: string; on: boolean }[];
  assert.equal(metrics.some((row) => /spend|cpa|roas|cpm|margin|bid|budget/.test(row.id)), false);

  const payload = {
    viewOnly: true as const,
    client: "Harbor Point Marine",
    rangeLabel: "Last 7 days",
    kpis: [
      { label: "New leads", value: "4", delta: "", meaning: "People who asked." },
      { label: "Spend", value: "$40", delta: "CPA is $10", meaning: "Media spend" },
    ],
    campaigns: [{ name: "Harbor search", status: "Doing well" as const, booked: 1, leads: 4, channel: "Meta", detail: "1 booked calls · 4 leads · Meta" }],
    updated: "Updated just now",
    sharedBy: "your marketing team",
    expires: "",
    spend: 40,
    cpa: 10,
    roas: 2,
    margin: 5,
  };
  const visibility = resolveVisibility(await store.read("demo"));
  const released = applyClientSurface(payload, visibility, true);
  const hidden = projectWithoutSpend(released);
  assert.equal(JSON.stringify(hidden).toLowerCase().includes("spend"), false);
  assert.equal(JSON.stringify(hidden).includes("$"), false);
  assert.equal(JSON.stringify(hidden).toLowerCase().includes("roas"), false);
  assert.equal(JSON.stringify(hidden).toLowerCase().includes("margin"), false);
  assert.equal(hidden.kpis.some((row) => row.label === "New leads"), true);
});

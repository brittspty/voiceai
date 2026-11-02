import type { MarketingAccess } from "./access";
import { clientMetricVisibilityEnabled, type Env } from "./config";
import { portfolioWorkspaceIds } from "../portfolio";
import {
  catalogView,
  parseMetricWrite,
  resolveVisibility,
  visibilityChanges,
  type VisibilityMap,
} from "./metric-visibility";

/**
 * Super admins and account managers edit. The all-clients viewer is staff for reading
 * every client (same as the portfolio and CTV gates) and read-only for writes,
 * matching permissionStatus and canApproveMarketing.
 */
export function metricSettingsPermission(kind: MarketingAccess["kind"]) {
  const view = kind === "super_admin" || kind === "account_manager" || kind === "all_clients_viewer";
  const edit = kind === "super_admin" || kind === "account_manager";
  return { view, edit };
}

export function allowedMetricClientIds(input: {
  kind: MarketingAccess["kind"];
  knownIds: readonly string[];
  assignedIds: readonly string[];
}) {
  const known = [...new Set(input.knownIds.map((id) => id.trim()).filter(Boolean))];
  if (input.kind === "super_admin" || input.kind === "all_clients_viewer") return known;
  if (input.kind === "account_manager") {
    return portfolioWorkspaceIds({ kind: "account_manager", knownIds: known, assignedIds: input.assignedIds });
  }
  return [];
}

export type MetricAuditRow = {
  workspaceId: string;
  metricId: string;
  oldValue: boolean;
  newValue: boolean;
  userId: string;
  userName: string;
  createdAt: Date;
};

export type MetricSettingsStore = {
  read(workspaceId: string): Promise<unknown>;
  write(workspaceId: string, metrics: VisibilityMap): Promise<void>;
  audit(rows: MetricAuditRow[]): Promise<void>;
};

export type MetricActor = {
  id: string;
  name: string;
  kind: MarketingAccess["kind"];
  knownIds: readonly string[];
  assignedIds: readonly string[];
};

export type MetricResult = { status: 200 | 400 | 403 | 404; body: Record<string, unknown> };

function clientGate(actor: MetricActor, clientId: string, edit: boolean): MetricResult | { clientId: string } {
  const id = clientId.trim();
  const known = new Set(actor.knownIds.map((row) => row.trim()).filter(Boolean));
  if (!id || !known.has(id)) return { status: 404, body: { error: "Client not found" } };
  const allowed = new Set(allowedMetricClientIds(actor));
  if (!allowed.has(id)) return { status: 403, body: { error: "Not allowed" } };
  const permission = metricSettingsPermission(actor.kind);
  if (!permission.view || (edit && !permission.edit)) return { status: 403, body: { error: "Not allowed" } };
  return { clientId: id };
}

export async function getMetricSettings(actor: MetricActor, clientId: string, store: MetricSettingsStore, env: Env = process.env): Promise<MetricResult> {
  if (!clientMetricVisibilityEnabled(env)) return { status: 404, body: { error: "Client metric visibility is off" } };
  const gate = clientGate(actor, clientId, false);
  if ("status" in gate) return gate;
  const visibility = resolveVisibility(await store.read(gate.clientId));
  return {
    status: 200,
    body: {
      clientId: gate.clientId,
      canEdit: metricSettingsPermission(actor.kind).edit,
      metrics: catalogView(visibility),
      presets: ["lead_gen", "awareness", "default"],
    },
  };
}

export async function putMetricSettings(
  actor: MetricActor,
  input: { clientId?: unknown; metrics?: unknown; preset?: unknown; reset?: unknown },
  store: MetricSettingsStore,
  env: Env = process.env,
  now = new Date(),
): Promise<MetricResult> {
  if (!clientMetricVisibilityEnabled(env)) return { status: 404, body: { error: "Client metric visibility is off" } };
  const gate = clientGate(actor, String(input.clientId || ""), true);
  if ("status" in gate) return gate;
  const current = resolveVisibility(await store.read(gate.clientId));
  const parsed = parseMetricWrite(current, input);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  const changes = visibilityChanges(current, parsed.next);
  await store.write(gate.clientId, parsed.next);
  await store.audit(
    changes.map((change) => ({
      workspaceId: gate.clientId,
      metricId: change.metricId,
      oldValue: change.oldValue,
      newValue: change.newValue,
      userId: actor.id,
      userName: actor.name,
      createdAt: now,
    })),
  );
  return {
    status: 200,
    body: {
      clientId: gate.clientId,
      canEdit: true,
      metrics: catalogView(parsed.next),
      saved: changes.map((change) => change.metricId),
    },
  };
}

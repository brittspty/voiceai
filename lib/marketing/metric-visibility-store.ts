import { audit } from "../audit";
import { prisma } from "../db";
import { clientMetricVisibilityEnabled } from "./config";
import { resolveVisibility, shapeClientDashboard, type VisibilityMap } from "./metric-visibility";
import type { MetricAuditRow, MetricSettingsStore } from "./metric-visibility-api";
import type { DashboardModel } from "./dashboard-model";

export const prismaMetricStore: MetricSettingsStore = {
  async read(workspaceId) {
    const row = await prisma.clientSettings.findUnique({
      where: { workspaceId },
      select: { metricVisibility: true },
    });
    return row?.metricVisibility ?? null;
  },
  async write(workspaceId, metrics) {
    const metricVisibility = resolveVisibility(metrics) as VisibilityMap;
    await prisma.clientSettings.upsert({
      where: { workspaceId },
      create: { workspaceId, metricVisibility },
      update: { metricVisibility },
    });
  },
  async audit(rows: MetricAuditRow[]) {
    if (!rows.length) return;
    await prisma.clientMetricAudit.createMany({
      data: rows.map((row) => ({
        workspaceId: row.workspaceId,
        metricId: row.metricId,
        oldValue: row.oldValue,
        newValue: row.newValue,
        userId: row.userId,
        createdAt: row.createdAt,
      })),
    });
    for (const row of rows) {
      await audit({ id: row.userId, name: row.userName }, "Changed a client metric", {
        type: "client_metric",
        id: row.workspaceId,
        label: `${row.metricId}: ${row.oldValue ? "on" : "off"} → ${row.newValue ? "on" : "off"}`,
      });
    }
  },
};

export async function loadResolvedVisibility(workspaceId: string) {
  const id = workspaceId.trim();
  if (!id || !clientMetricVisibilityEnabled()) return resolveVisibility(null);
  return resolveVisibility(await prismaMetricStore.read(id));
}

export async function withClientDashboardMetrics(model: DashboardModel, workspaceId: string, apply = true) {
  if (!apply || model.mode !== "client" || !clientMetricVisibilityEnabled()) return model;
  return shapeClientDashboard(model, await loadResolvedVisibility(workspaceId));
}

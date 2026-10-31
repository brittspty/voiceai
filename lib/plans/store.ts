import type { ClientPlan, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { buildDemoDataset, campaignTotals } from "../demo/dataset";
import {
  dashboardFromMetrics,
  metricSelect,
  metricsWhereForPlan,
  planViewRecord,
  type PlanRecord,
} from "./plan";

function asStrings(value: Prisma.JsonValue) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function planRecord(row: ClientPlan): PlanRecord {
  return {
    id: row.id,
    slug: row.slug,
    clientName: row.clientName,
    goals: row.goals,
    channels: row.channels,
    audiences: asStrings(row.audiences),
    segments: asStrings(row.segments),
    dashboardSource: row.dashboardSource,
    baselineWorkspaceId: row.baselineWorkspaceId,
    timeline: row.timeline,
    weekly: row.weekly,
    ctaLabel: row.ctaLabel,
    ctaHref: row.ctaHref,
    showCost: row.showCost,
    linkDays: row.linkDays,
    status: row.status,
    approvedById: row.approvedById,
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  };
}

export async function loadPlanDashboard(plan: Pick<PlanRecord, "dashboardSource" | "baselineWorkspaceId" | "showCost">) {
  if (plan.dashboardSource === "demo") {
    const dataset = buildDemoDataset();
    const rows = dataset.campaigns.filter((campaign) => !campaign.illustrative).map((campaign) => {
      const totals = campaignTotals(dataset, campaign.id);
      return { impressions: totals.impressions, clicks: totals.clicks, leads: totals.leads, spendCents: totals.spendCents, conversionValueCents: totals.verifiedConversions * 12000 };
    });
    return dashboardFromMetrics(rows, plan.showCost);
  }
  const where = metricsWhereForPlan(plan);
  const rows = await prisma.dailyMetric.findMany({ where, select: metricSelect(plan.showCost) });
  return dashboardFromMetrics(
    rows.map((row) => ({
      impressions: Number(row.impressions),
      clicks: Number(row.clicks),
      leads: Number(row.platformLeads),
      spendCents: "spend" in row ? Math.round(Number(row.spend) * 100) : undefined,
      conversionValueCents: "conversionValue" in row ? Math.round(Number(row.conversionValue) * 100) : undefined,
    })),
    plan.showCost,
  );
}

export async function recordPlanView(planId: string, userAgent: string) {
  const view = planViewRecord(userAgent, new Date());
  await prisma.clientPlanView.create({
    data: { planId, viewedAt: new Date(view.viewedAt), userAgentCoarse: view.userAgentCoarse },
  });
}

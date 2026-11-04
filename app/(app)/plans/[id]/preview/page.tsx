import { notFound } from "next/navigation";
import { PlanDocument } from "@/components/plan-document";
import { requireUser } from "@/lib/auth";
import { denyAccess } from "@/lib/deny";
import { prisma } from "@/lib/db";
import { clientMetricVisibilityEnabled } from "@/lib/marketing/config";
import { filterPlanChannels, filterPlanNumbers } from "@/lib/marketing/metric-visibility";
import { loadResolvedVisibility } from "@/lib/marketing/metric-visibility-store";
import { clientPlansEnabled } from "@/lib/plans/flags";
import { canEditPlans } from "@/lib/plans/plan";
import { loadPlanCtv } from "@/lib/marketing/ctv/channel-query";
import { loadPlanDashboard, planRecord } from "@/lib/plans/store";

export default async function PlanPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  if (!clientPlansEnabled()) notFound();
  const user = await requireUser();
  if (!canEditPlans(user.role)) denyAccess();
  const row = await prisma.clientPlan.findUnique({ where: { id: (await params).id } });
  if (!row) notFound();
  const plan = planRecord(row);
  const rawDashboard = await loadPlanDashboard({ ...plan, showCost: false });
  const visibilityOn = clientMetricVisibilityEnabled();
  const visibility = visibilityOn ? await loadResolvedVisibility(plan.baselineWorkspaceId || (plan.dashboardSource === "demo" ? "demo" : "")) : null;
  const dashboard = visibility ? filterPlanNumbers(rawDashboard, visibility) : rawDashboard;
  const channels = visibility ? filterPlanChannels(plan.channels, visibility) : plan.channels;
  const logoSrc = row.logoMime && row.logoData ? `data:${row.logoMime};base64,${Buffer.from(row.logoData).toString("base64")}` : null;
  const ctv = await loadPlanCtv(plan.clientName);
  return (
    <PlanDocument
      plan={{
        clientName: plan.clientName,
        logoSrc,
        goals: plan.goals,
        channels,
        audiences: plan.audiences,
        segments: plan.segments,
        timeline: plan.timeline,
        weekly: plan.weekly,
        ctaLabel: plan.ctaLabel,
        ctaHref: plan.ctaHref,
        dashboard,
        showCost: false,
        preview: true,
        ctv,
      }}
    />
  );
}

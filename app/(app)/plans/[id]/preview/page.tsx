import { notFound } from "next/navigation";
import { PlanDocument } from "@/components/plan-document";
import { requireUser } from "@/lib/auth";
import { denyAccess } from "@/lib/deny";
import { prisma } from "@/lib/db";
import { clientPlansEnabled } from "@/lib/plans/flags";
import { canEditPlans } from "@/lib/plans/plan";
import { loadPlanDashboard, planRecord } from "@/lib/plans/store";

export default async function PlanPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  if (!clientPlansEnabled()) notFound();
  const user = await requireUser();
  if (!canEditPlans(user.role)) denyAccess();
  const row = await prisma.clientPlan.findUnique({ where: { id: (await params).id } });
  if (!row) notFound();
  const plan = planRecord(row);
  const dashboard = await loadPlanDashboard(plan);
  const logoSrc = row.logoMime && row.logoData ? `data:${row.logoMime};base64,${Buffer.from(row.logoData).toString("base64")}` : null;
  return (
    <PlanDocument
      plan={{
        clientName: plan.clientName,
        logoSrc,
        goals: plan.goals,
        channels: plan.channels,
        audiences: plan.audiences,
        segments: plan.segments,
        timeline: plan.timeline,
        weekly: plan.weekly,
        ctaLabel: plan.ctaLabel,
        ctaHref: plan.ctaHref,
        dashboard,
        showCost: plan.showCost,
        preview: true,
      }}
    />
  );
}

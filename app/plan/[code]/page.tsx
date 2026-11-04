import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PlanClosed } from "@/components/plan-closed";
import { PlanDocument } from "@/components/plan-document";
import { prisma } from "@/lib/db";
import { clientMetricVisibilityEnabled } from "@/lib/marketing/config";
import { filterPlanChannels, filterPlanNumbers } from "@/lib/marketing/metric-visibility";
import { loadResolvedVisibility } from "@/lib/marketing/metric-visibility-store";
import { clientPlansEnabled } from "@/lib/plans/flags";
import { hashToken, parsePlanCode, resolvePublicPlan } from "@/lib/plans/plan";
import { loadPlanCtv } from "@/lib/marketing/ctv/channel-query";
import { loadPlanDashboard, planRecord, recordPlanView } from "@/lib/plans/store";

export default async function PublicPlanPage({ params }: { params: Promise<{ code: string }> }) {
  if (!clientPlansEnabled()) notFound();
  const parsed = parsePlanCode((await params).code);
  if (!parsed) notFound();
  const row = await prisma.clientPlan.findUnique({ where: { tokenHash: hashToken(parsed.token) } });
  if (!row || row.slug !== parsed.slug) notFound();
  const plan = planRecord(row);
  const access = resolvePublicPlan(plan, parsed.token);
  if (access === "unknown") notFound();
  if (access === "expired" || access === "revoked") return <PlanClosed state={access} />;
  await recordPlanView(row.id, (await headers()).get("user-agent") || "");
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
        ctv,
      }}
    />
  );
}

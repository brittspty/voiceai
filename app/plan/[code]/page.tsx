import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlanClosed } from "@/components/plan-closed";
import { PlanDocument } from "@/components/plan-document";
import { prisma } from "@/lib/db";
import { clientPlansEnabled } from "@/lib/plans/flags";
import { uxLaunchGapsEnabled } from "@/lib/ux-flags";
import { hashToken, parsePlanCode, resolvePublicPlan } from "@/lib/plans/plan";
import { loadPlanDashboard, planRecord, recordPlanView } from "@/lib/plans/store";

function PlanLinkMiss() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-semibold">This plan link doesn&apos;t work</h1>
        <p className="mt-3 text-sm">Check the link, or ask your Specificity contact for a new one.</p>
        <Link href="/" className="btn-brand mt-6 inline-flex min-h-11 items-center rounded-full px-5 text-sm">Go to homepage</Link>
      </div>
    </main>
  );
}

export default async function PublicPlanPage({ params }: { params: Promise<{ code: string }> }) {
  if (!clientPlansEnabled()) notFound();
  const launch = uxLaunchGapsEnabled();
  const parsed = parsePlanCode((await params).code);
  if (!parsed) return launch ? <PlanLinkMiss /> : notFound();
  const row = await prisma.clientPlan.findUnique({ where: { tokenHash: hashToken(parsed.token) } });
  if (!row || row.slug !== parsed.slug) return launch ? <PlanLinkMiss /> : notFound();
  const plan = planRecord(row);
  const access = resolvePublicPlan(plan, parsed.token);
  if (access === "unknown") return launch ? <PlanLinkMiss /> : notFound();
  if (access === "expired" || access === "revoked") return <PlanClosed state={access} launchGaps={launch} />;
  const empty = launch && !plan.goals.trim() && plan.channels.length === 0 && plan.audiences.length === 0 && plan.segments.length === 0 && !plan.timeline.trim() && !plan.weekly.trim();
  if (empty) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <p className="max-w-md text-center text-sm">This plan is still being put together. Check back soon.</p>
      </main>
    );
  }
  await recordPlanView(row.id, (await headers()).get("user-agent") || "");
  const dashboard = await loadPlanDashboard({ ...plan, showCost: false });
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
        showCost: false,
      }}
    />
  );
}

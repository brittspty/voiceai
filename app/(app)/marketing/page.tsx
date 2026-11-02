import { redirect } from "next/navigation";
import { AmFeed } from "@/components/am-feed";
import { MarketingDashboard } from "@/components/marketing-dashboard";
import { MarketingView } from "@/components/marketing-view";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  amBudgetCapUsd,
  clientLinksEnabled,
  competitorWatchEnabled,
  creativeFatigueEnabled,
  dashboardsV2Enabled,
  digestEnabled,
  digestSendEnabled,
  googleBusinessProfileEnabled,
  holdoutsEnabled,
  monitorEnabled,
  pacingRecsEnabled,
  searchWasteEnabled,
  speedToLeadEnabled,
  stackAdaptEnabled,
  adFatigueEnabled,
} from "@/lib/marketing/config";
import { parseDashQuery } from "@/lib/marketing/dashboard-model";
import { loadDashboardForAccess } from "@/lib/marketing/dashboard-query";
import { loadFatigueBoard } from "@/lib/marketing/fatigue-job";
import { canReviewSearchWaste, canViewHoldouts, canWatchCompetitors } from "@/lib/marketing/feature-access";
import { loadPacingBoard } from "@/lib/marketing/pacing-job";
import { listHomeWorkspaces, loadFeatureCards } from "@/lib/marketing/home-query";
import { getMarketingPage, loadMarketingAccess } from "@/lib/marketing/queries";
import { appHomePath } from "@/lib/public-routing";
import { loadSpeedPage } from "@/lib/marketing/speed-to-lead-store";

export const dynamic = "force-dynamic";

export default async function MarketingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (access.kind === "client_viewer") redirect("/marketing/client");
  if (access.kind === "none") redirect(appHomePath());
  const query = await searchParams;
  const requested = typeof query.client === "string" ? query.client : Array.isArray(query.client) ? query.client[0] || "" : "";
  const choices = await listHomeWorkspaces(access);
  const clientId = choices.some((row) => row.id === requested) ? requested : "";
  const classic = !dashboardsV2Enabled() || query.view === "budget";
  const clientPicker = choices.length > 1 ? (
    <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
      <label htmlFor="client" className="text-sm text-muted">Client</label>
      <select id="client" name="client" defaultValue={clientId} className="h-11 rounded-lg border border-line bg-card px-2">
        <option value="">All clients</option>
        {choices.map((choice) => (
          <option key={choice.id} value={choice.id}>{choice.name}</option>
        ))}
      </select>
      {classic ? <input type="hidden" name="view" value="budget" /> : null}
      <button className="min-h-11 rounded-lg border border-line bg-card px-3 text-sm">Show</button>
    </form>
  ) : null;
  if (classic) {
    const data = await getMarketingPage(access, clientId);
    const speedToLead = speedToLeadEnabled()
      ? await loadSpeedPage().catch(() => ({ error: true as const }))
      : null;
    const fatigueOn = creativeFatigueEnabled() && access.seesAlerts;
    const pacingOn = pacingRecsEnabled() && access.seesCost && (access.kind === "super_admin" || access.kind === "account_manager");
    const fatigue = fatigueOn ? await loadFatigueBoard(access) : { enabled: false as const, ads: [] };
    const pacing = pacingOn ? await loadPacingBoard(access) : { enabled: false as const, recommendationOnly: true as const, writesBudget: false as const, bars: [] };
    return (
      <>
      {clientPicker}
      <AmFeed access={access} />
      <MarketingView
        {...data}
        speedToLead={speedToLead}
        fatigue={fatigue}
        pacing={{ ...pacing, stale: data.lastRun?.status === "failed" }}
        flags={{
          monitor: monitorEnabled(),
          digest: digestEnabled(),
          digestSend: digestSendEnabled(),
          clientLinks: clientLinksEnabled(),
          creativeFatigue: fatigueOn,
          pacing: pacingOn,
          canEditBudget: access.canEditBudget && access.seesCost,
          canCreateShareLink: access.canCreateShareLink,
          seesCost: access.seesCost,
          showGoogleConnection: access.kind === "super_admin" || access.kind === "account_manager",
          searchWaste: searchWasteEnabled() && canReviewSearchWaste(access),
          competitorWatch: competitorWatchEnabled() && canWatchCompetitors(access),
          holdouts: holdoutsEnabled() && canViewHoldouts(access),
          adFatigue: adFatigueEnabled(),
          stackAdapt: stackAdaptEnabled(),
          gbp: googleBusinessProfileEnabled(),
          userId: access.userId,
          ...(access.seesCost ? { isSuperAdmin: access.kind === "super_admin", budgetCap: amBudgetCapUsd() } : {}),
        }}
      />
      </>
    );
  }
  const org = await prisma.org.findUnique({ where: { id: "org" }, select: { name: true } });
  const [data, features] = await Promise.all([
    loadDashboardForAccess(access, "staff", org?.name || "Campaigns", undefined, clientId),
    loadFeatureCards({ workspaceIds: clientId ? [clientId] : [access.workspaceId], showMoney: access.seesCost }),
  ]);
  return (
    <>
      {clientPicker}
      <MarketingDashboard model={data} query={parseDashQuery(query)} basePath="/marketing" features={features} />
    </>
  );
}

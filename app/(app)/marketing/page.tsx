import { redirect } from "next/navigation";
import { AmFeed } from "@/components/am-feed";
import { GbpPanel } from "@/components/gbp/gbp-panel";
import { DashboardTabs } from "@/components/gbp/gbp-tabs";
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
import { loadFeatureCards } from "@/lib/marketing/home-query";
import { presentGbpClient } from "@/lib/marketing/gbp-view";
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
  const gbpOn = googleBusinessProfileEnabled();
  const gbpTab = gbpOn && query.tab === "gbp";
  const gbpClient = typeof query.client === "string" ? query.client : "harbor";
  const tabs = gbpOn ? <DashboardTabs current={gbpTab ? "gbp" : "campaigns"} base="/marketing" /> : null;
  if (gbpTab) {
    return (
      <div className="mx-auto max-w-6xl">
        {tabs}
        <GbpPanel view={presentGbpClient({ clientId: gbpClient, audience: access.seesCost ? "staff" : "client" })} />
      </div>
    );
  }
  const classic = !dashboardsV2Enabled() || query.view === "budget";
  if (classic) {
    const data = await getMarketingPage(access);
    const speedToLead = speedToLeadEnabled()
      ? await loadSpeedPage().catch(() => ({ error: true as const }))
      : null;
    const fatigueOn = creativeFatigueEnabled() && access.seesAlerts;
    const pacingOn = pacingRecsEnabled() && access.seesCost && (access.kind === "super_admin" || access.kind === "account_manager");
    const fatigue = fatigueOn ? await loadFatigueBoard(access) : { enabled: false as const, ads: [] };
    const pacing = pacingOn ? await loadPacingBoard(access) : { enabled: false as const, recommendationOnly: true as const, writesBudget: false as const, bars: [] };
    return (
      <>
      {tabs}
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
    loadDashboardForAccess(access, "staff", org?.name || "Campaigns"),
    loadFeatureCards({ workspaceIds: [access.workspaceId], showMoney: access.seesCost }),
  ]);
  return (
    <div>
      {tabs}
      <MarketingDashboard model={data} query={parseDashQuery(query)} basePath="/marketing" features={features} />
    </div>
  );
}

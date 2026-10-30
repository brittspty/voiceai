import { redirect } from "next/navigation";
import { MarketingView } from "@/components/marketing-view";
import { requireUser } from "@/lib/auth";
import { amBudgetCapUsd, clientLinksEnabled, competitorWatchEnabled, digestEnabled, holdoutsEnabled, monitorEnabled, searchWasteEnabled, speedToLeadEnabled } from "@/lib/marketing/config";
import { canReviewSearchWaste, canViewHoldouts, canWatchCompetitors } from "@/lib/marketing/feature-access";
import { getMarketingPage, loadMarketingAccess } from "@/lib/marketing/queries";
import { loadSpeedPage } from "@/lib/marketing/speed-to-lead-store";

export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (access.kind === "client_viewer") redirect("/marketing/client");
  if (access.kind === "none") redirect("/");
  const data = await getMarketingPage(access);
  const speedToLead = speedToLeadEnabled()
    ? await loadSpeedPage().catch(() => ({ error: true as const }))
    : null;
  return (
    <MarketingView
      {...data}
      speedToLead={speedToLead}
      flags={{
        monitor: monitorEnabled(),
        digest: digestEnabled(),
        clientLinks: clientLinksEnabled(),
        canEditBudget: access.canEditBudget && access.seesCost,
        canCreateShareLink: access.canCreateShareLink,
        seesCost: access.seesCost,
        showGoogleConnection: access.kind === "super_admin" || access.kind === "account_manager",
        searchWaste: searchWasteEnabled() && canReviewSearchWaste(access),
        competitorWatch: competitorWatchEnabled() && canWatchCompetitors(access),
        holdouts: holdoutsEnabled() && canViewHoldouts(access),
        ...(access.seesCost ? { isSuperAdmin: access.kind === "super_admin", budgetCap: amBudgetCapUsd() } : {}),
      }}
    />
  );
}

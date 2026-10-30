import { redirect } from "next/navigation";
import { MarketingView } from "@/components/marketing-view";
import { requireUser } from "@/lib/auth";
import { amBudgetCapUsd, clientLinksEnabled, digestEnabled, monitorEnabled } from "@/lib/marketing/config";
import { getMarketingPage, loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (access.kind === "client_viewer") redirect("/marketing/client");
  if (access.kind === "none") redirect("/");
  const data = await getMarketingPage(access);
  return (
    <MarketingView
      {...data}
      flags={{
        monitor: monitorEnabled(),
        digest: digestEnabled(),
        clientLinks: clientLinksEnabled(),
        canEditBudget: access.canEditBudget && access.seesCost,
        canCreateShareLink: access.canCreateShareLink,
        seesCost: access.seesCost,
        showGoogleConnection: access.kind === "super_admin" || access.kind === "account_manager",
        ...(access.seesCost ? { isSuperAdmin: access.kind === "super_admin", budgetCap: amBudgetCapUsd() } : {}),
      }}
    />
  );
}

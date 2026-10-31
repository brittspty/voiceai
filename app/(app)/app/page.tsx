import { ClientHome } from "@/components/jarvis/pages";
import { StaffHome } from "@/components/jarvis/staff";
import { HomeDashboard } from "@/components/home-dashboard";
import { NoAccess } from "@/components/no-access";
import { requireUser } from "@/lib/auth";
import { jarvisUiV2Enabled } from "@/lib/marketing/config";
import { listHomeWorkspaces, loadHome } from "@/lib/marketing/home-query";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { one, type SP } from "@/lib/params";
import { appHomePath } from "@/lib/public-routing";

export const metadata = { title: "Home" };

export default async function OverviewPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (jarvisUiV2Enabled()) {
    if (access.kind === "none") return <NoAccess title="Home" />;
    return access.seesCost ? <StaffHome /> : <ClientHome />;
  }
  if (access.kind === "none") return <NoAccess title="Home" />;
  const sp = await searchParams;
  const requested = one(sp, "client") || null;
  const [model, choices] = await Promise.all([
    loadHome({ access, requestedId: requested }),
    listHomeWorkspaces(access),
  ]);
  return <HomeDashboard homeHref={appHomePath()} model={model} choices={choices.map((row) => ({ id: row.id, name: row.name }))} />;
}

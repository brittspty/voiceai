import { ClientHome } from "@/components/jarvis/pages";
import { StaffHome } from "@/components/jarvis/staff";
import { HomeDashboard } from "@/components/home-dashboard";
import { NoAccess } from "@/components/no-access";
import { requireUser } from "@/lib/auth";
import { exampleRegistryState, presentClientChannels, projectSurfaces } from "@/lib/marketing/channels/registry";
import { channelRegistryEnabled, jarvisUiV2Enabled } from "@/lib/marketing/config";
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
    if (channelRegistryEnabled()) {
      const state = exampleRegistryState();
      if (access.seesCost) return <StaffHome surfaces={projectSurfaces(state, { audience: "staff", clientId: "harbor" })} />;
      const channels = presentClientChannels(state, "harbor").channels.map((row) => ({
        ...row,
        href: `/c/harbor/${row.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      }));
      return <ClientHome channels={channels} />;
    }
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

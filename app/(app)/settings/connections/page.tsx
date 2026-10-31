import { redirect } from "next/navigation";
import { SettingsConnections } from "@/components/jarvis/pages";
import { ClientConnectionList, RegistrySettings } from "@/components/jarvis/registry-settings";
import { requireUser } from "@/lib/auth";
import { canUseChannelRegistry, exampleRegistryState, presentClientChannels, projectSurfaces } from "@/lib/marketing/channels/registry";
import { channelRegistryEnabled, jarvisUiV2Enabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { one, type SP } from "@/lib/params";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!jarvisUiV2Enabled()) redirect("/settings/integrations");
  const user = await requireUser();
  if (!channelRegistryEnabled()) return <SettingsConnections />;
  const access = await loadMarketingAccess(user);
  const query = await searchParams;
  if (!canUseChannelRegistry(access)) {
    return <ClientConnectionList channels={presentClientChannels(exampleRegistryState(), "harbor").channels} />;
  }
  const surfaces = projectSurfaces(exampleRegistryState(), { audience: "staff", clientId: "harbor" });
  return (
    <RegistrySettings
      headline={surfaces.settings.headline}
      rows={surfaces.settings.rows}
      disconnectKey={one(query, "disconnect")}
      dateLabel="Oct 31, 2026"
    />
  );
}

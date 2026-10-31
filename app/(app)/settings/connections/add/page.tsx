import { redirect } from "next/navigation";
import { ChannelCatalog } from "@/components/jarvis/channel-catalog";
import { requireUser } from "@/lib/auth";
import { denyAccess } from "@/lib/deny";
import { EXAMPLE_ACCOUNTS, EXAMPLE_CLIENTS, canUseChannelRegistry, capabilityCheck, exampleRegistryState, presentCatalog } from "@/lib/marketing/channels/registry";
import { channelRegistryEnabled, jarvisUiV2Enabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { one, type SP } from "@/lib/params";

export const dynamic = "force-dynamic";

export default async function AddChannelPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!jarvisUiV2Enabled() || !channelRegistryEnabled()) redirect("/settings/connections");
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (!canUseChannelRegistry(access)) denyAccess();
  const query = await searchParams;
  const step = one(query, "step");
  const state = exampleRegistryState();
  const cards = presentCatalog(state, "harbor");
  const capabilities = Object.fromEntries(state.registry.filter((row) => row.status !== "hidden").map((row) => [row.key, capabilityCheck(row)]));
  return (
    <ChannelCatalog
      cards={cards}
      clients={EXAMPLE_CLIENTS.map((client) => ({ id: client.id, name: client.name }))}
      accounts={EXAMPLE_ACCOUNTS.map((account) => ({ clientId: account.clientId, id: account.id, name: account.name }))}
      canDecide={access.kind === "super_admin"}
      initialStep={step === "connect" || step === "capability" || step === "test" ? step : "choose"}
      initialPlatform={one(query, "platform") || "linkedin"}
      initialResult={one(query, "result")}
      showConnected={one(query, "connected") === "1"}
      capabilities={capabilities}
    />
  );
}

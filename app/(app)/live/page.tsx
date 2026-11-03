import { redirect } from "next/navigation";
import { LiveFeed } from "@/components/jarvis/pages";
import { NoAccess } from "@/components/no-access";
import { requireUser } from "@/lib/auth";
import { EXAMPLE_ASSIGNMENTS } from "@/lib/marketing/channels/catalog";
import { RealEmpty } from "@/components/jarvis/real-home";
import { amRealtimeEnabled, jarvisUiV2Enabled, marketingClientSwitcherEnabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export default async function LivePage() {
  if (!jarvisUiV2Enabled()) redirect("/");
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (access.kind !== "super_admin" && access.kind !== "account_manager") return <NoAccess title="Live notes" />;
  if (marketingClientSwitcherEnabled()) return <RealEmpty title="Live notes" detail="No data yet." />;
  return (
    <LiveFeed
      viewer={{
        role: access.kind,
        assignedClientIds: access.kind === "super_admin" ? [] : EXAMPLE_ASSIGNMENTS.dana,
      }}
      realtime={amRealtimeEnabled()}
    />
  );
}

import { redirect } from "next/navigation";
import { Ais2lPage } from "@/components/jarvis/pages";
import { loadAis2lCalls } from "@/lib/ais2l/load";
import { requireUser } from "@/lib/auth";
import { jarvisUiV2Enabled } from "@/lib/marketing/config";
import { listHomeWorkspaces } from "@/lib/marketing/home-query";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { getOrg } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function Ais2lRoute() {
  if (!jarvisUiV2Enabled()) redirect("/calls");
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  const spaces = await listHomeWorkspaces(access).catch(() => []);
  if (!spaces.some((row) => row.voiceEnabled)) {
    return (
      <main className="jarvis" style={{ padding: 32 }}>
        <h1>AIS2L is not included for this client.</h1>
      </main>
    );
  }
  const org = await getOrg();
  const screen = await loadAis2lCalls(org.testMode);
  return <Ais2lPage testPill={screen.testPill} calls={screen.calls} example={screen.example} />;
}

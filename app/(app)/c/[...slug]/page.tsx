import { redirect } from "next/navigation";
import { ClientChannel } from "@/components/jarvis/pages";
import { RealChannel } from "@/components/jarvis/real-home";
import { ChannelDetail, Drill } from "@/components/jarvis/staff";
import { requireUser } from "@/lib/auth";
import { canSwitchMarketingClient } from "@/lib/marketing/access";
import { jarvisUiV2Enabled, marketingClientSwitcherEnabled } from "@/lib/marketing/config";
import { parseRealViewQuery } from "@/lib/marketing/real-view";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { loadRealHome } from "@/lib/marketing/real-view-query";
import type { SP } from "@/lib/params";

export const dynamic = "force-dynamic";

export default async function DrillPage({ params, searchParams }: { params: Promise<{ slug: string[] }>; searchParams: Promise<SP> }) {
  if (!jarvisUiV2Enabled()) redirect("/");
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  const { slug } = await params;
  const channel = slug[1] || "meta";
  if (marketingClientSwitcherEnabled()) {
    const sp = await searchParams;
    const requested = !slug[0] || slug[0] === "all" ? null : slug[0];
    const view = parseRealViewQuery(sp, canSwitchMarketingClient(access));
    const model = await loadRealHome({ access, requestedClientId: requested, days: view.days, status: view.status });
    const clientPath = slug[0] || "all";
    if (model) return <RealChannel model={model} slug={channel} basePath={`/c/${clientPath}/${channel}`} />;
  }
  if (!access.seesCost || slug[0] === "harbor") return <ClientChannel channel={channel} />;
  if (slug.includes("retirees-fl")) return <Drill />;
  return <ChannelDetail channel={channel} />;
}

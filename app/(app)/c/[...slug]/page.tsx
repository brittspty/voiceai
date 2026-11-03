import { redirect } from "next/navigation";
import { ClientChannel } from "@/components/jarvis/pages";
import { RealChannel } from "@/components/jarvis/real-home";
import { ChannelDetail, Drill } from "@/components/jarvis/staff";
import { requireUser } from "@/lib/auth";
import { jarvisUiV2Enabled, marketingClientSwitcherEnabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { loadRealHome } from "@/lib/marketing/real-view-query";

export const dynamic = "force-dynamic";

export default async function DrillPage({ params }: { params: Promise<{ slug: string[] }> }) {
  if (!jarvisUiV2Enabled()) redirect("/");
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  const { slug } = await params;
  const channel = slug[1] || "meta";
  if (marketingClientSwitcherEnabled()) {
    const requested = !slug[0] || slug[0] === "all" ? null : slug[0];
    const model = await loadRealHome({ access, requestedClientId: requested });
    if (model) return <RealChannel model={model} slug={channel} />;
  }
  if (!access.seesCost || slug[0] === "harbor") return <ClientChannel channel={channel} />;
  if (slug.includes("retirees-fl")) return <Drill />;
  return <ChannelDetail channel={channel} />;
}

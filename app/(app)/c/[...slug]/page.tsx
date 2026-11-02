import { redirect } from "next/navigation";
import { ClientChannel } from "@/components/jarvis/pages";
import { ChannelDetail, Drill } from "@/components/jarvis/staff";
import { requireUser } from "@/lib/auth";
import { jarvisUiV2Enabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export default async function DrillPage({ params }: { params: Promise<{ slug: string[] }> }) {
  if (!jarvisUiV2Enabled()) redirect("/");
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  const { slug } = await params;
  const channel = slug[1] || "meta";
  if (!access.seesCost || slug[0] === "harbor") return <ClientChannel channel={channel} />;
  if (slug.includes("retirees-fl")) return <Drill />;
  return <ChannelDetail channel={channel} />;
}

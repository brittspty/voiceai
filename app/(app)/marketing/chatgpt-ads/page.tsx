import type { Metadata } from "next";
import { ChatgptAdsPanel } from "@/components/chatgpt-ads-panel";
import { PageTitle } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { denyAccess } from "@/lib/deny";
import { registryMemory } from "@/lib/marketing/channels/registry";
import { canConnectChatgptAds, canSetupChatgptAds, connectGuide, presentChatgptConnection } from "@/lib/marketing/chatgpt-ads/connect";
import { chatgptAdsEnabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "ChatGPT Ads" };

export default async function ChatgptAdsPage() {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (!canConnectChatgptAds(access.kind)) denyAccess();
  if (!chatgptAdsEnabled()) {
    return (
      <div>
        <PageTitle title="ChatGPT Ads" subtitle="This channel is off." />
        <p className="text-sm">Turn on CHANNEL_REGISTRY and CHATGPT_ADS to connect an ad account.</p>
      </div>
    );
  }
  const view = presentChatgptConnection(registryMemory(), access.workspaceId);
  return (
    <div>
      <PageTitle title="ChatGPT Ads" subtitle="The key is sealed by the channel registry. New campaigns stay paused until a staff member confirms launch." />
      <ChatgptAdsPanel view={{ ...connectGuide(), ...view }} canSetup={canSetupChatgptAds(access.kind)} clientId={access.workspaceId} />
    </div>
  );
}

import type { Metadata } from "next";
import { ChatgptAdsPanel } from "@/components/chatgpt-ads-panel";
import { PageTitle } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { denyAccess } from "@/lib/deny";
import { registryMemory } from "@/lib/marketing/channels/registry";
import { canConnectChatgptAds, canSetupChatgptAds, connectGuide, presentChatgptConnection } from "@/lib/marketing/chatgpt-ads/connect";
import { chatgptAdsEnabled, chatgptAdsSpendUnit } from "@/lib/marketing/config";
import { EmptyState } from "@/components/empty-state";
import { uxLaunchGapsEnabled } from "@/lib/ux-flags";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { canSeeMoney } from "@/lib/marketing/spend-access";

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
  const launch = uxLaunchGapsEnabled();
  const unit = chatgptAdsSpendUnit();
  const staff = canSeeMoney(user.role);
  return (
    <div>
      <PageTitle title="ChatGPT Ads" subtitle="The key is sealed by the channel registry. New campaigns stay paused until a staff member confirms launch." />
      {launch && !view.connected ? (
        <EmptyState kind="not-connected" channel="ChatGPT Ads" staff={staff} connectHref="/settings/connections/add?platform=chatgpt_ads" />
      ) : (
        <>
          {launch && staff && unit === "unverified" ? (
            <p className="mb-4 text-sm text-muted">
              <span className="mr-2 inline-flex rounded-full border border-line px-2 py-1 text-xs text-ink" title="We can't confirm whether this number is dollars or credits until an admin sets the spend unit in Settings › Connections.">
                Spend unit not set
              </span>
              This figure stays out of totals until the unit is set.
            </p>
          ) : null}
          <ChatgptAdsPanel view={{ ...connectGuide(), ...view }} canSetup={canSetupChatgptAds(access.kind)} clientId={access.workspaceId} />
        </>
      )}
    </div>
  );
}

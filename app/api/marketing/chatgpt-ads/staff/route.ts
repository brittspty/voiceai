import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { registryMemory } from "@/lib/marketing/channels/registry";
import { canSetupChatgptAds, resolveChatgptAdsKey } from "@/lib/marketing/chatgpt-ads/connect";
import { createPausedChatgptAds, launchChatgptAds, type WizardDraft } from "@/lib/marketing/chatgpt-ads/setup";
import { chatgptAdsEnabled } from "@/lib/marketing/config";
import { AdBudgetWriteBlockedError, CHATGPT_ADS_STAFF_GRANT } from "@/lib/marketing/connectors/budget-lock";
import { ChatgptAdsNotAllowedError, ChatgptAdsRequestError } from "@/lib/marketing/connectors/chatgpt-ads-client";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

const CLIENT_ID = /^[A-Za-z0-9_-]{1,80}$/;

export async function POST(request: Request) {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (!chatgptAdsEnabled()) return NextResponse.json({ message: "ChatGPT Ads is off." }, { status: 404 });
  if (!canSetupChatgptAds(access.kind)) return NextResponse.json({ message: "Only a super admin or account manager can change ChatGPT Ads." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as {
    action?: string;
    clientId?: string;
    confirm?: boolean;
    entity?: "campaign" | "ad_group" | "ad";
    id?: string;
    draft?: WizardDraft;
  } | null;
  if (!body) return NextResponse.json({ message: "The request could not be read." }, { status: 400 });
  const clientId = typeof body.clientId === "string" && CLIENT_ID.test(body.clientId) ? body.clientId : access.workspaceId;
  const apiKey = resolveChatgptAdsKey(registryMemory(), clientId);
  if (!apiKey) return NextResponse.json({ message: "Connect ChatGPT Ads before creating or launching." }, { status: 400 });
  const actor = { id: user.id, kind: access.kind };
  try {
    if (body.action === "launch") {
      const result = await launchChatgptAds({
        actor,
        apiKey,
        staffGrant: CHATGPT_ADS_STAFF_GRANT,
        entity: body.entity || "campaign",
        id: body.id || "",
        confirmed: body.confirm === true,
        clientKey: clientId,
      });
      return NextResponse.json(result.ok ? { id: result.id, status: result.statusText } : { message: result.message }, { status: result.status });
    }
    if (body.action !== "create" || !body.draft) return NextResponse.json({ message: "Choose create or launch." }, { status: 400 });
    const result = await createPausedChatgptAds({
      actor,
      apiKey,
      staffGrant: CHATGPT_ADS_STAFF_GRANT,
      draft: body.draft,
      clientKey: clientId,
    });
    if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status });
    return NextResponse.json({ campaignId: result.campaignId, adGroupId: result.adGroupId, adId: result.adId, statuses: result.statuses });
  } catch (error) {
    if (error instanceof AdBudgetWriteBlockedError || error instanceof ChatgptAdsNotAllowedError) {
      return NextResponse.json({ message: "That change is blocked." }, { status: 403 });
    }
    if (error instanceof ChatgptAdsRequestError) return NextResponse.json({ message: error.message }, { status: 502 });
    throw error;
  }
}

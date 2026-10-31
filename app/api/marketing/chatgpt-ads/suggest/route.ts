import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { canSetupChatgptAds } from "@/lib/marketing/chatgpt-ads/connect";
import { suggestChatgptCreative } from "@/lib/marketing/chatgpt-ads/setup";
import { chatgptAdsEnabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (!chatgptAdsEnabled()) return NextResponse.json({ message: "ChatGPT Ads is off." }, { status: 404 });
  if (!canSetupChatgptAds(access.kind)) return NextResponse.json({ message: "Only a super admin or account manager can draft ChatGPT Ads." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { product?: string; audience?: string };
  return NextResponse.json(suggestChatgptCreative(body));
}

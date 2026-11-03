import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { jarvisUiV2Enabled, marketingClientSwitcherEnabled } from "@/lib/marketing/config";
import { jarvisHomeBody } from "@/lib/marketing/jarvis-home";
import { loadRealHome } from "@/lib/marketing/real-view-query";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export async function GET(request: Request) {
  if (!jarvisUiV2Enabled()) return NextResponse.json({ error: "Off" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  if (access.kind === "none") return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const requested = new URL(request.url).searchParams.get("client") || "";
  if (marketingClientSwitcherEnabled()) {
    const model = await loadRealHome({ access, requestedClientId: requested || null });
    return NextResponse.json(model ?? { example: false, channels: [] });
  }
  const result = jarvisHomeBody({ access, requested });
  return NextResponse.json(result.body, { status: result.status });
}

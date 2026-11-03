import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canSwitchMarketingClient } from "@/lib/marketing/access";
import { jarvisUiV2Enabled, marketingClientSwitcherEnabled } from "@/lib/marketing/config";
import { jarvisHomeBody } from "@/lib/marketing/jarvis-home";
import { parseRealViewQuery } from "@/lib/marketing/real-view";
import { loadRealHome } from "@/lib/marketing/real-view-query";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export async function GET(request: Request) {
  if (!jarvisUiV2Enabled()) return NextResponse.json({ error: "Off" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  if (access.kind === "none") return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const url = new URL(request.url);
  const requested = url.searchParams.get("client") || "";
  if (marketingClientSwitcherEnabled()) {
    const view = parseRealViewQuery(url.searchParams, canSwitchMarketingClient(access));
    const model = await loadRealHome({ access, requestedClientId: requested || null, days: view.days, status: view.status });
    return NextResponse.json(model ?? { example: false, channels: [] });
  }
  const result = jarvisHomeBody({ access, requested });
  return NextResponse.json(result.body, { status: result.status });
}

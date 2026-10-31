import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { clientChannelPayload } from "@/lib/marketing/channels/catalog";
import { stripForAudience } from "@/lib/marketing/channels/cost-strip";
import { jarvisUiV2Enabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export async function GET() {
  if (!jarvisUiV2Enabled()) return NextResponse.json({ error: "Off" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  if (access.kind === "none") return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const audience = access.seesCost ? "staff" : "client";
  const body = audience === "staff"
    ? { qualified: 71, spend: 8300, cpl: 41, cpql: 124, roas: 3.2, leads: 212 }
    : clientChannelPayload();
  return NextResponse.json(stripForAudience(body, audience));
}

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { EXAMPLE_ASSIGNMENTS, EXAMPLE_FEED } from "@/lib/marketing/channels/catalog";
import { stripForAudience } from "@/lib/marketing/channels/cost-strip";
import { scopeLiveFeed } from "@/lib/marketing/channels/feed";
import { jarvisUiV2Enabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";

/** Assignment scope is applied here. Delivery stays with the live-feed service. */
export async function GET() {
  if (!jarvisUiV2Enabled()) return NextResponse.json({ error: "Off" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  if (access.kind !== "super_admin" && access.kind !== "account_manager") {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  const items = scopeLiveFeed(EXAMPLE_FEED, {
    role: access.kind,
    assignedClientIds: access.kind === "super_admin" ? [] : EXAMPLE_ASSIGNMENTS.dana,
  });
  return NextResponse.json(stripForAudience({ items }, "staff"));
}

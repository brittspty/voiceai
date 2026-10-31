import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { EXAMPLE_ASSIGNMENTS, EXAMPLE_FEED } from "@/lib/marketing/channels/catalog";
import { stripForAudience } from "@/lib/marketing/channels/cost-strip";
import { scopeLiveFeed } from "@/lib/marketing/channels/feed";
import { jarvisUiV2Enabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { notifyAccountManager, pushNotificationsEnabled } from "@/lib/push/notify";

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
  if (pushNotificationsEnabled()) {
    await notifyAccountManager({
      userId: user.id,
      items: items.map((item) => ({
        id: item.id,
        severity: item.severity,
        kind: item.driver === "landing_page" ? "outage" : "other",
        title: item.title,
        body: item.reason,
      })),
      loadPrefs: async () => {
        const row = await prisma.pushPreference.findUnique({ where: { userId: user.id } });
        if (!row) return null;
        return {
          optedIn: row.optedIn,
          quietStartHour: row.quietStartHour,
          quietEndHour: row.quietEndHour,
          urgentOutageBreaksQuiet: row.urgentOutageBreaksQuiet,
          timeZone: row.timeZone,
        };
      },
    }).catch((error) => console.error("[push] skipped", error));
  }
  return NextResponse.json(stripForAudience({ items }, "staff"));
}

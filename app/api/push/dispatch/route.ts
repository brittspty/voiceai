import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { notifyAccountManager, pushHttpStatus, pushNotificationsEnabled, type PushCandidate } from "@/lib/push/notify";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const access = user ? await loadMarketingAccess(user) : null;
  const status = pushHttpStatus({
    enabled: pushNotificationsEnabled(),
    signedIn: Boolean(user),
    kind: access?.kind ?? null,
    share: false,
  });
  if (status === 404) return NextResponse.json({ error: "Off" }, { status });
  if (status === 401) return NextResponse.json({ error: "Sign in required" }, { status });
  if (status !== 200 || !user) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { items?: PushCandidate[] } | null;
  const items = Array.isArray(body?.items) ? body.items : [];
  const results = await notifyAccountManager({
    userId: user.id,
    items,
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
  });
  return NextResponse.json({ results, delivery: "would send" });
}

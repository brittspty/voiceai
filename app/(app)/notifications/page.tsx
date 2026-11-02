import { forbidden, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { getOrg } from "@/lib/queries";
import { PushOptInForm } from "@/components/push-opt-in";
import { defaultPushPrefs, hourLabel, pushHttpStatus, pushNotificationsEnabled } from "@/lib/push/notify";
import { subscriptionStored } from "@/lib/push/subscription";

export const dynamic = "force-dynamic";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const enabled = pushNotificationsEnabled();
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  const status = pushHttpStatus({ enabled, signedIn: true, kind: access.kind, share: false });
  if (status === 404) redirect("/");
  if (status !== 200) forbidden();
  const [org, row, query] = await Promise.all([
    getOrg(),
    prisma.pushPreference.findUnique({ where: { userId: user.id } }),
    searchParams,
  ]);
  const prefs = row
    ? {
        optedIn: row.optedIn,
        quietStartHour: row.quietStartHour,
        quietEndHour: row.quietEndHour,
        urgentOutageBreaksQuiet: row.urgentOutageBreaksQuiet,
        timeZone: row.timeZone,
      }
    : { ...defaultPushPrefs(), timeZone: org.timezone || defaultPushPrefs().timeZone };
  const opted = prefs.optedIn ? "You are opted in." : "You are not opted in.";
  const quiet = `Quiet hours ${hourLabel(prefs.quietStartHour)}–${hourLabel(prefs.quietEndHour)}.`;
  const breakthrough = prefs.urgentOutageBreaksQuiet
    ? "Urgent outage alerts can arrive during quiet hours."
    : "Urgent outage alerts wait until quiet hours end.";
  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <p className="text-sm text-muted">Account managers · urgent items only · delivery logs would send</p>
      <h1 className="mt-1 text-2xl font-semibold">Push notifications</h1>
      <p className="mt-3 text-sm">Mobile and web push stay off until you opt in. Nothing is sent to a phone or a browser. The server logs &quot;would send&quot;.</p>
      {query.saved === "1" && <p className="mt-3 text-sm" role="status">Saved. {opted} {quiet} {breakthrough}</p>}
      <p className="mt-3 text-sm" role="status">{opted} {quiet} {breakthrough}</p>
      <PushOptInForm prefs={prefs} subscriptionStored={subscriptionStored(row?.subscription)} />
    </main>
  );
}

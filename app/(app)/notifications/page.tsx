import { forbidden, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { getOrg } from "@/lib/queries";
import { PushOptInForm } from "@/components/push-opt-in";
import { defaultPushPrefs, hourLabel, pushHttpStatus, pushNotificationsEnabled } from "@/lib/push/notify";
import { subscriptionStored } from "@/lib/push/subscription";
import { uxLaunchGapsEnabled } from "@/lib/ux-flags";

export const dynamic = "force-dynamic";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const enabled = pushNotificationsEnabled();
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  const status = pushHttpStatus({ enabled, signedIn: true, kind: access.kind, share: false });
  if (uxLaunchGapsEnabled()) {
    if (access.kind === "client_owner" || access.kind === "client_viewer" || access.kind === "none") forbidden();
    const notes = await prisma.staffNotification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, title: true, body: true, createdAt: true },
    });
    return (
      <main className="mx-auto max-w-xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <div className="mt-4">
          <button type="button" aria-disabled="true" aria-describedby="push-soon" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm">
            Push notifications
            <span className="rounded-full bg-canvas px-2 py-0.5 text-xs">Coming soon</span>
          </button>
          <p id="push-soon" className="mt-2 text-sm text-muted">For now, alerts show in JAI under Notifications.</p>
        </div>
        <ul className="mt-6 grid gap-2 text-sm">
          {notes.map((note) => (
            <li key={note.id} className="rounded-xl border border-line p-3">
              <strong>{note.title}</strong>
              <p>{note.body}</p>
            </li>
          ))}
          {!notes.length ? <li>No notifications yet.</li> : null}
        </ul>
      </main>
    );
  }
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

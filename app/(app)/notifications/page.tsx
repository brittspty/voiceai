import { forbidden, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { getOrg } from "@/lib/queries";
import { defaultPushPrefs, hourLabel, pushHttpStatus, pushNotificationsEnabled } from "@/lib/push/notify";

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
      <form className="mt-6 grid max-w-lg gap-4 rounded-xl border border-line p-4" method="post" action="/api/push">
        <input type="hidden" name="timeZone" value={prefs.timeZone} />
        <label className="flex min-h-11 items-center gap-3">
          <input name="optedIn" type="checkbox" className="size-6" defaultChecked={prefs.optedIn} />
          Send me urgent alerts
        </label>
        <label className="block">
          Quiet hours start
          <input name="quietStartHour" type="number" min={0} max={23} defaultValue={prefs.quietStartHour} className="mt-1 min-h-11 w-full rounded-lg border border-line px-3" aria-describedby="quiet-help" />
        </label>
        <label className="block">
          Quiet hours end
          <input name="quietEndHour" type="number" min={0} max={23} defaultValue={prefs.quietEndHour} className="mt-1 min-h-11 w-full rounded-lg border border-line px-3" />
        </label>
        <p id="quiet-help" className="text-sm text-muted">Default is 10 PM–7 AM. Decisions and notes are never pushed.</p>
        <label className="flex min-h-11 items-center gap-3">
          <input name="urgentOutageBreaksQuiet" type="checkbox" className="size-6" defaultChecked={prefs.urgentOutageBreaksQuiet} />
          Let urgent outage alerts through during quiet hours
        </label>
        <p role="status">{opted} {quiet} {breakthrough}</p>
        <button className="inline-flex min-h-11 items-center rounded-lg bg-brand px-4 font-semibold text-on-brand" type="submit">Save notification settings</button>
      </form>
    </main>
  );
}

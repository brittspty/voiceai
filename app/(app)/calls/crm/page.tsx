import Link from "next/link";
import { refreshCalendar } from "@/lib/actions";
import { formatDateTime, timeAgo } from "@/lib/format";
import { formatHHMM, parseHHMM, zonedTimeToUtc } from "@/lib/time";
import { getCrm } from "@/lib/queries";

export default async function CrmPage({ searchParams }: { searchParams: Promise<{ day?: string; q?: string }> }) {
  const sp = await searchParams;
  const data = await getCrm(sp.day);
  const office = data.office;
  const weekday = new Date(`${data.iso}T12:00:00Z`).getUTCDay();
  const hours = office?.hours.find((h) => h.weekday === weekday);
  const slots: string[] = [];
  if (hours && !hours.closed) {
    for (let m = parseHHMM(hours.openTime); m + 30 <= parseHHMM(hours.closeTime); m += 30) slots.push(formatHHMM(m));
  }
  const q = (sp.q || "").toLowerCase();
  const tags = data.tags.filter((tag) => tag.name.toLowerCase().includes(q));
  const dayLabel = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: data.tz }).format(zonedTimeToUtc(`${data.iso}T12:00:00`, data.tz));
  const calendarName = office?.calendarName?.trim();
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">Meetings and the month view live on <Link className="underline" href="/calls/calendar">Calendar</Link> and <Link className="underline" href="/calls/appointments">Appointments</Link>. This page is how Avery writes back to GoHighLevel.</p>
      <section className="rounded-xl border border-line bg-card p-4 shadow-[var(--shadow)]">
        <h2 className="font-medium">Open times</h2>
        <p className="text-sm text-muted">Open times on {dayLabel}{calendarName ? `, ${calendarName}` : ""}. These come from GoHighLevel. When Avery may dial is set in Calling rules.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {slots.length === 0 && <span className="text-sm text-muted">Closed this day.</span>}
          {slots.map((slot) => <span key={slot} className="rounded-full border border-line px-2.5 py-1 text-xs">{slot}</span>)}
        </div>
        <p className="mt-3 text-xs text-muted">{slots.length} openings, shown in {data.tz.replaceAll("_", " ")}.</p>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-card p-4 shadow-[var(--shadow)]">
          <h2 className="font-medium">Tags</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">Tags Avery adds: <span className="mx-1 rounded-full bg-chip px-2 py-0.5 text-xs">called</span><span className="mx-1 rounded-full bg-chip px-2 py-0.5 text-xs">booked</span><span className="mx-1 rounded-full bg-chip px-2 py-0.5 text-xs">do-not-call</span></p>
          <p className="mt-1 text-sm text-muted">Last refreshed {office?.syncedAt ? timeAgo(office.syncedAt) : "not yet"}.</p>
          <div className="mt-3 flex gap-2">
            <form className="flex-1"><input name="q" defaultValue={sp.q || ""} placeholder="Search tags" className="h-9 w-full rounded-lg border border-line px-3 text-sm" /></form>
            {office && <form action={async () => { "use server"; await refreshCalendar(office.id); }}><button className="h-9 rounded-lg border border-line px-3 text-sm">↻ Refresh from GoHighLevel</button></form>}
          </div>
          <ul className="mt-3 divide-y divide-line text-sm">
            {tags.map((tag) => (
              <li key={tag.id} className="flex justify-between gap-3 py-2"><span className="truncate">{tag.name}</span><span className="shrink-0 text-muted">{tag.contactCount} contacts</span></li>
            ))}
          </ul>
          <Link href="/settings/calling" className="mt-3 inline-block text-sm text-muted underline">Choose which tags to call in Call settings</Link>
        </section>
        <section className="rounded-xl border border-line bg-card p-4 shadow-[var(--shadow)]">
          <h2 className="font-medium">CRM updates</h2>
          <p className="text-sm text-muted">What the agent wrote back to your CRM — call notes, tags, contact fields and do-not-call flags.</p>
          {data.updates.length === 0 ? (
            <div className="mt-8 rounded-xl border border-dashed border-line px-4 py-10 text-center">
              <div className="font-medium">No CRM updates yet</div>
              <p className="mt-1 text-sm text-muted">Updates appear here as soon as the agent completes a call.</p>
            </div>
          ) : (
            <ul className="mt-4 space-y-2 text-sm">
              {data.updates.map((update) => <li key={update.id} className="rounded-lg border border-line px-3 py-2">{update.summary}<div className="text-xs text-muted">{update.status} · {formatDateTime(update.createdAt)}</div></li>)}
            </ul>
          )}
          <Link href="/settings/failed-jobs" className="mt-3 inline-block text-sm underline">Updates that failed after every retry →</Link>
        </section>
      </div>
    </div>
  );
}

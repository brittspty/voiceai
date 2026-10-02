import Link from "next/link";
import { refreshCalendar } from "@/lib/actions";
import { formatDateTime, timeAgo } from "@/lib/format";
import { addDaysISO, formatHHMM, parseHHMM, zonedISODate, zonedTimeToUtc } from "@/lib/time";
import { getCrm } from "@/lib/queries";

export default async function CrmPage({ searchParams }: { searchParams: Promise<{ day?: string; q?: string }> }) {
  const sp = await searchParams;
  const data = await getCrm(sp.day);
  const office = data.office;
  const [year, month] = data.iso.split("-").map(Number);
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const firstWeekday = new Date(`${first}T12:00:00Z`).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, "0"))];
  const weekday = new Date(`${data.iso}T12:00:00Z`).getUTCDay();
  const hours = office?.hours.find((h) => h.weekday === weekday);
  const slots: string[] = [];
  if (hours && !hours.closed) {
    for (let m = parseHHMM(hours.openTime); m + 30 <= parseHHMM(hours.closeTime); m += 30) slots.push(formatHHMM(m));
  }
  const q = (sp.q || "").toLowerCase();
  const tags = data.tags.filter((tag) => tag.name.toLowerCase().includes(q));
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(zonedTimeToUtc(`${data.iso}T12:00:00`, data.tz));
  const prev = addDaysISO(first, -1).slice(0, 7) + "-01";
  const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-line bg-card p-4 shadow-[var(--shadow)]">
        <h2 className="font-medium">Calendar</h2>
        <p className="text-sm text-muted">Appointments the agent booked into GoHighLevel (your CRM), by day.</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className="rounded-xl border border-line p-3">
            <div className="mb-2 flex items-center justify-between text-sm font-medium">
              <Link href={`/calls/crm?day=${prev}`}>‹</Link>
              {monthLabel}
              <Link href={`/calls/crm?day=${nextMonth}`}>›</Link>
            </div>
            <div className="grid grid-cols-7 text-center text-xs text-muted">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => <div key={d} className="py-1">{d}</div>)}
              {cells.map((day, index) => day ? (
                <Link key={day} href={`/calls/crm?day=${first.slice(0, 8)}${day}`} className={`rounded-md py-1 ${data.iso.endsWith(day) ? "bg-ink text-white dark:bg-white dark:text-black" : "hover:bg-hover"}`}>{Number(day)}</Link>
              ) : <div key={`e-${index}`} />)}
            </div>
          </div>
          <div className="rounded-xl border border-dashed border-line p-6 text-center">
            <div className="text-sm text-muted">{new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: data.tz }).format(zonedTimeToUtc(`${data.iso}T12:00:00`, data.tz))} · {data.appointments.length} appointments</div>
            {data.appointments.length === 0 ? (
              <>
                <div className="mt-6 font-medium">Nothing booked</div>
                <p className="mt-1 text-sm text-muted">Pick another day, or check Availability below for the times still open.</p>
              </>
            ) : (
              <ul className="mt-4 space-y-2 text-left text-sm">
                {data.appointments.map((appt) => <li key={appt.id}>{formatDateTime(appt.startsAt, data.tz)} · {appt.contact.name} · {appt.status}</li>)}
              </ul>
            )}
          </div>
        </div>
      </section>
      <section className="rounded-xl border border-line bg-card p-4 shadow-[var(--shadow)]">
        <h2 className="font-medium">Availability</h2>
        <p className="text-sm text-muted">Open times on {new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: data.tz }).format(zonedTimeToUtc(`${data.iso}T12:00:00`, data.tz))} — {office?.calendarName}. Live from GoHighLevel — the same openings the agent offers.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {slots.length === 0 && <span className="text-sm text-muted">Closed this day.</span>}
          {slots.map((slot) => <span key={slot} className="rounded-full border border-line px-2.5 py-1 text-xs">{slot}</span>)}
        </div>
        <p className="mt-3 text-xs text-muted">{slots.length} openings, shown in {data.tz.replace("_", " ")}.</p>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-card p-4 shadow-[var(--shadow)]">
          <h2 className="font-medium">Tags</h2>
          <p className="text-sm text-muted">Contact tags mirrored from the CRM. Read-only here — refreshing pulls from the CRM and new writes to it. Last refreshed {office?.syncedAt ? timeAgo(office.syncedAt) : "not yet"}.</p>
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

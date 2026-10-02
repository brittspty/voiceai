import Link from "next/link";
import { refreshCalendar } from "@/lib/actions";
import { addDaysISO, formatHHMM, parseHHMM, zonedTimeToUtc } from "@/lib/time";
import { getCalendar } from "@/lib/queries";
import { timeAgo } from "@/lib/format";

const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ office?: string; week?: string }> }) {
  const sp = await searchParams;
  const data = await getCalendar(sp.office, sp.week);
  if (!data.office) return <p>Add an office to see the calendar.</p>;
  const office = data.office;
  const prev = addDaysISO(data.weekStart, -7);
  const next = addDaysISO(data.weekStart, 7);
  const endLabel = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" }).format(zonedTimeToUtc(`${data.days[6]}T12:00:00`, data.tz));
  const startLabel = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" }).format(zonedTimeToUtc(`${data.days[0]}T12:00:00`, data.tz));
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <form>
          <input type="hidden" name="week" value={data.weekStart} />
          <select name="office" defaultValue={office.id} className="h-9 rounded-lg border border-line bg-card px-3 text-sm">
            {data.offices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <button className="ml-2 text-sm text-muted">Apply</button>
        </form>
        <Link className="rounded-md border border-line px-2 py-1 text-sm" href={`/calls/calendar?office=${office.id}&week=${prev}`}>‹</Link>
        <Link className="rounded-md border border-line px-3 py-1 text-sm" href={`/calls/calendar?office=${office.id}`}>Today</Link>
        <Link className="rounded-md border border-line px-2 py-1 text-sm" href={`/calls/calendar?office=${office.id}&week=${next}`}>›</Link>
        <div className="ml-auto text-sm font-medium">{startLabel} – {endLabel}</div>
      </div>
      <div className="overflow-hidden rounded-xl border border-line bg-card shadow-[var(--shadow)]">
        <div className="flex items-center justify-between border-b border-line px-4 py-3 text-sm">
          <div>
            <span className="font-medium">{office.calendarName}</span>
            <span className="text-muted"> · Synced from GoHighLevel {office.syncedAt ? timeAgo(office.syncedAt) : "not yet"}</span>
          </div>
          <form action={async () => { "use server"; await refreshCalendar(office.id); }}>
            <button className="text-sm font-medium">↻ Refresh</button>
          </form>
        </div>
        <div className="flex gap-4 border-b border-line px-4 py-2 text-xs text-muted">
          <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm border border-[#8dcea8] bg-[#e7f6ee]" /> Open for booking</span>
          <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-hatch border border-line" /> Busy in GoHighLevel</span>
          <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-[#dbeafe]" /> Booked by {data.org.agentName}</span>
        </div>
        <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] text-xs">
          <div />
          {data.days.map((iso) => {
            const date = zonedTimeToUtc(`${iso}T12:00:00`, data.tz);
            const label = new Intl.DateTimeFormat("en-US", { weekday: "short", day: "numeric", timeZone: data.tz }).format(date);
            const today = iso === new Intl.DateTimeFormat("en-CA", { timeZone: data.tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
            return <div key={iso} className={`border-b border-line px-2 py-2 text-center font-medium ${today ? "text-ink" : "text-muted"}`}>{label}</div>;
          })}
          {HOURS.map((hour) => (
            <>
              <div key={`h-${hour}`} className="border-t border-line px-2 py-3 text-right text-muted">{formatHHMM(hour * 60).replace(":00 ", " ")}</div>
              {data.days.map((iso) => {
                const weekday = new Date(`${iso}T12:00:00Z`).getUTCDay();
                const hours = office.hours.find((h) => h.weekday === weekday);
                const open = hours && !hours.closed && hour * 60 >= parseHHMM(hours.openTime) && hour * 60 < parseHHMM(hours.closeTime);
                return (
                  <div key={`${iso}-${hour}`} className={`relative h-12 border-l border-t border-line ${open ? "bg-[#e7f6ee]" : "bg-hatch"}`}>
                    {hour === 13 && !open && <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-card px-2 py-0.5 text-[10px] text-muted shadow">Closed</span>}
                    {open && hour === parseHHMM(hours?.openTime || "10:00") / 60 && (
                      <span className="absolute left-2 top-1 text-[10px] font-medium text-[#187a42]">Open<br />{hours?.openTime} – {hours?.closeTime}</span>
                    )}
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>
      <p className="mt-3 text-sm text-muted">Don&apos;t want calls on certain days? Pause calling in <Link className="underline" href="/settings/calling">Settings → Call settings</Link>.</p>
    </div>
  );
}

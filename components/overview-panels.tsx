"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Calendar, Clock, PhoneOutgoing, Percent, Target } from "lucide-react";
import { formatDuration, formatPercent, outcomeLabel } from "@/lib/format";

type Live = { queued: number; dialing: number; inProgress: number; wrapUp: number; items: { id: string; name: string; office: string; status: string; reason?: string | null }[] };

export function RangeSelect({ range }: { range: string }) {
  return (
    <form>
      <select name="range" defaultValue={range} onChange={(event) => { window.location.search = `?range=${event.target.value}`; }} className="h-9 rounded-lg border border-line bg-card px-3 text-sm">
        <option value="today">Today</option>
        <option value="yesterday">Yesterday</option>
        <option value="7d">Last 7 days</option>
        <option value="30d">Last 30 days</option>
      </select>
    </form>
  );
}

export function KpiRow({ kpis }: { kpis: { dials: number; connectRate: number; meetings: number; bookingRate: number; avgLength: number | null } }) {
  const cards = [
    { label: "Dials", value: String(kpis.dials), icon: PhoneOutgoing },
    { label: "Connect rate", value: formatPercent(kpis.connectRate), icon: Percent },
    { label: "Meetings booked", value: String(kpis.meetings), icon: Calendar },
    { label: "Booking rate", value: formatPercent(kpis.bookingRate), icon: Target },
    { label: "Avg call length", value: kpis.avgLength == null ? "—" : formatDuration(kpis.avgLength), icon: Clock },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border border-line bg-card px-4 py-3 shadow-[var(--shadow)]">
          <div className="flex items-center justify-between text-sm text-muted">
            {card.label}
            <card.icon className="h-4 w-4" />
          </div>
          <div className="mt-2 text-[28px] font-semibold tracking-tight">{card.value}</div>
        </div>
      ))}
    </div>
  );
}

export function LiveNow({ initial, range }: { initial: Live; range: string }) {
  const router = useRouter();
  const [live, setLive] = useState(initial);
  useEffect(() => setLive(initial), [initial]);
  useEffect(() => {
    const timer = setInterval(async () => {
      const res = await fetch(`/api/live?range=${range}`);
      if (!res.ok) return;
      const data = await res.json();
      const active = data.live.dialing + data.live.inProgress + data.live.wrapUp;
      setLive(data.live);
      if (active > 0 || data.live.queued !== live.queued) router.refresh();
    }, 4000);
    return () => clearInterval(timer);
  }, [range, router, live.queued]);

  const legend = [
    ["Queued", live.queued, "bg-zinc-400"],
    ["Dialing", live.dialing, "bg-amber-500"],
    ["In progress", live.inProgress, "bg-blue-500"],
    ["Wrap-up", live.wrapUp, "bg-zinc-800"],
  ] as const;

  return (
    <section className="rounded-xl border border-line bg-card p-4 shadow-[var(--shadow)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">Live now</h2>
          <p className="text-sm text-muted">Calls moving through the system</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted"><span className="h-1.5 w-1.5 rounded-full bg-[#22a06b]" /> Refreshes every 4 seconds</div>
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        {legend.map(([label, count, dot]) => (
          <div key={label} className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${dot}`} />{label} <span className="font-medium">{count}</span></div>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {live.items.length === 0 && <p className="text-sm text-muted">Nothing is moving right now.</p>}
        {live.items.map((item) => (
          <div key={item.id} className="rounded-lg border border-line px-3 py-2">
            <div className="text-sm font-medium">{item.name.length > 28 ? `${item.name.slice(0, 26)}…` : item.name} <span className="font-normal text-muted">{item.status === "queued" ? "waiting" : item.status.replaceAll("_", " ")}</span></div>
            <div className="text-xs text-muted">{item.office}</div>
            {item.reason && <div className="mt-1 text-xs text-muted">{item.reason}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

export function DialsChart({ data }: { data: { label: string; dials: number; connects: number }[] }) {
  return (
    <section className="rounded-xl border border-line bg-card p-4 shadow-[var(--shadow)]">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-medium">Dials & connects</h2>
          <p className="text-sm text-muted">Last 7 days</p>
        </div>
        <div className="flex gap-3 text-xs text-muted">
          <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#3b82f6]" /> Dials</span>
          <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#2eb8a0]" /> Connects</span>
        </div>
      </div>
      <div className="mt-3 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="dials" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7dd3c7" stopOpacity={0.8} />
                <stop offset="100%" stopColor="#7dd3c7" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#71717a" }} axisLine={false} tickLine={false} />
            <YAxis width={28} tick={{ fontSize: 12, fill: "#71717a" }} axisLine={false} tickLine={false} allowDecimals={false} domain={[0, 4]} />
            <Tooltip />
            <Area type="monotone" dataKey="dials" stroke="#3b82f6" fill="url(#dials)" strokeWidth={2} />
            <Area type="monotone" dataKey="connects" stroke="#2eb8a0" fill="transparent" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function OutcomesCard({ outcomes }: { outcomes: { outcome: string; count: number }[] }) {
  const total = outcomes.reduce((sum, row) => sum + row.count, 0);
  return (
    <section className="rounded-xl border border-line bg-card p-4 shadow-[var(--shadow)]">
      <h2 className="font-medium">Outcomes</h2>
      <p className="text-sm text-muted">How calls ended · Today</p>
      {total === 0 ? (
        <Empty title="No calls yet" body="Outcomes appear here once calls complete in this period." />
      ) : (
        <ul className="mt-6 space-y-3">
          {outcomes.map((row) => (
            <li key={row.outcome}>
              <div className="mb-1 flex justify-between text-sm"><span>{outcomeLabel(row.outcome)}</span><span>{row.count}</span></div>
              <div className="h-2 rounded-full bg-chip"><div className="h-2 rounded-full bg-[#3b82f6]" style={{ width: `${(row.count / total) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function OfficeRateCard({ offices }: { offices: { name: string; rate: number; dials: number }[] }) {
  return (
    <section className="rounded-xl border border-line bg-card p-4 shadow-[var(--shadow)]">
      <h2 className="font-medium">Connect rate by office</h2>
      <p className="text-sm text-muted">Today</p>
      {offices.length === 0 ? <Empty title="No calls yet" body="Once calls start dialing, their connect rates compare here." /> : (
        <ul className="mt-4 space-y-3">
          {offices.map((office) => (
            <li key={office.name} className="flex items-center justify-between text-sm">
              <span>{office.name}</span>
              <span className="font-medium">{formatPercent(office.rate)} <span className="font-normal text-muted">({office.dials})</span></span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Funnel({ funnel }: { funnel: { triggers: number; passed: number; dialed: number; connected: number; booked: number } }) {
  const rows = [
    ["Triggers", funnel.triggers],
    ["Passed gates", funnel.passed],
    ["Dialed", funnel.dialed],
    ["Connected", funnel.connected],
    ["Booked", funnel.booked],
  ] as const;
  const max = Math.max(1, ...rows.map((row) => row[1]));
  return (
    <section className="rounded-xl border border-line bg-card p-4 shadow-[var(--shadow)]">
      <h2 className="font-medium">Booking funnel</h2>
      <p className="text-sm text-muted">From lead to booked meeting · Today</p>
      <ul className="mt-5 space-y-3">
        {rows.map(([label, count]) => (
          <li key={label} className="grid grid-cols-[110px_1fr_24px] items-center gap-3 text-sm">
            <span className="text-muted">{label}</span>
            <div className="h-2 rounded-full bg-chip"><div className="h-2 rounded-full bg-zinc-300" style={{ width: `${Math.max(count ? 4 : 0, (count / max) * 100)}%` }} /></div>
            <span className="text-right tabular-nums">{count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-6 py-14 text-center">
      <div className="font-medium">{title}</div>
      <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{body}</p>
    </div>
  );
}

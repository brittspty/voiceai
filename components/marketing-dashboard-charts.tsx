"use client";

import { formatCount, formatMoney, formatPct } from "@/lib/marketing/dashboard-model";

function scale(value: number, max: number, size: number) {
  if (!(max > 0)) return 0;
  return (value / max) * size;
}

export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="h-9" aria-hidden="true" />;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = Math.max(max - min, 1);
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 160;
      const y = 32 - ((value - min) / span) * 28;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 160 36" className="h-9 w-full" aria-hidden="true">
      <polyline points={points} fill="none" stroke="var(--brand)" strokeWidth="2" />
    </svg>
  );
}

export function TrendChart({ points, name }: { points: { label: string; value: number; reason?: string }[]; name: string }) {
  if (!points.length) return <p className="text-sm text-muted">No days in this range.</p>;
  const width = 640;
  const height = 240;
  const max = Math.max(...points.map((point) => point.value), 1);
  const coords = points.map((point, index) => ({
    ...point,
    x: 36 + (points.length <= 1 ? 0 : (index / (points.length - 1)) * (width - 52)),
    y: 16 + (height - 48) - scale(point.value, max, height - 48),
  }));
  const line = coords.map((point) => `${point.x},${point.y}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[240px] w-full" role="img" aria-label={`${name} over time`}>
      <line x1="36" y1="16" x2="36" y2={height - 28} stroke="var(--line)" />
      <line x1="36" y1={height - 28} x2={width - 8} y2={height - 28} stroke="var(--line)" />
      <text x="4" y="20" fill="var(--muted)" fontSize="11">{formatCount(max)}</text>
      <text x="4" y={height - 24} fill="var(--muted)" fontSize="11">0</text>
      {coords.length > 1 && <polyline points={line} fill="none" stroke="var(--brand)" strokeWidth="3" />}
      {coords.map((point) => (
        <g key={point.label}>
          <circle cx={point.x} cy={point.y} r={point.reason ? 6 : 3} fill={point.reason ? "var(--danger)" : "var(--brand)"}>
            <title>{point.reason ? `${point.label}: ${formatCount(point.value)}. ${point.reason}` : `${point.label}: ${formatCount(point.value)}`}</title>
          </circle>
          {points.length <= 16 && (
            <text x={point.x} y={height - 10} textAnchor="middle" fill="var(--muted)" fontSize="11">{point.label}</text>
          )}
        </g>
      ))}
    </svg>
  );
}

export function DonutChart({ slices, center }: { slices: { name: string; value: number }[]; center: string }) {
  const colors = ["var(--brand)", "var(--info)", "var(--chart-2)", "var(--brand-ink)", "var(--warning)", "var(--muted)"];
  const total = slices.reduce((sum, slice) => sum + slice.value, 0) || 1;
  const stops = slices.reduce<{ cursor: number; parts: string[] }>(
    (state, slice, index) => {
      const next = state.cursor + (slice.value / total) * 100;
      return { cursor: next, parts: [...state.parts, `${colors[index % colors.length]} ${state.cursor}% ${next}%`] };
    },
    { cursor: 0, parts: [] },
  ).parts;
  return (
    <div role="img" aria-label="Where leads and calls come from">
      <div className="relative mx-auto h-44 w-44">
        <div className="h-full w-full rounded-full" style={{ background: `conic-gradient(${stops.join(", ")})` }} />
        <div className="absolute inset-[22%] grid place-items-center rounded-full bg-card text-center text-sm font-semibold leading-tight whitespace-pre-line">{center}</div>
      </div>
      <ul className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-muted">
        {slices.map((slice, index) => (
          <li key={slice.name} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: colors[index % colors.length] }} />
            {slice.name} ({formatCount(slice.value)})
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CompareScatter({
  points,
  onOpen,
}: {
  points: { id: string; name: string; ctr: number; per100: number; results: number }[];
  onOpen: (id: string) => void;
}) {
  const width = 640;
  const height = 280;
  const maxX = Math.max(...points.map((point) => point.ctr), 0.01);
  const maxY = Math.max(...points.map((point) => point.per100), 1);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[280px] w-full" role="img" aria-label="Campaign comparison. Horizontal axis is click rate. Vertical axis is leads and calls per 100 dollars.">
      <text x={width / 2} y={height - 6} textAnchor="middle" fill="var(--muted)" fontSize="12">Click rate</text>
      <text x="16" y={height / 2} fill="var(--muted)" fontSize="12" transform={`rotate(-90 16 ${height / 2})`}>Leads + calls per $100</text>
      {points.map((point) => {
        const x = 56 + scale(point.ctr, maxX, width - 80);
        const y = height - 36 - scale(point.per100, maxY, height - 70);
        const radius = 8 + Math.sqrt(point.results) * 1.4;
        return (
          <g key={point.id} className="cursor-pointer" onClick={() => onOpen(point.id)}>
            <circle cx={x} cy={y} r={radius} fill="var(--brand)" fillOpacity="0.45" stroke="var(--brand)">
              <title>{`${point.name}. Click rate ${formatPct(point.ctr)}. Leads + calls per $100: ${point.per100.toFixed(1)}`}</title>
            </circle>
          </g>
        );
      })}
    </svg>
  );
}

export function CompareBars({ rows, onOpen }: { rows: { id: string; name: string; value: number }[]; onOpen: (id: string) => void }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  const ordered = [...rows].sort((a, b) => a.value - b.value);
  return (
    <div className="grid gap-2" role="img" aria-label="Leads and calls by campaign">
      {ordered.map((row) => (
        <button key={row.id} type="button" className="grid grid-cols-[150px_1fr_auto] items-center gap-2 text-left text-xs" onClick={() => onOpen(row.id)}>
          <span className="truncate">{row.name}</span>
          <span className="h-4 overflow-hidden rounded bg-chip">
            <span className="block h-full rounded bg-brand" style={{ width: `${(row.value / max) * 100}%` }} />
          </span>
          <span>{formatCount(row.value)}</span>
        </button>
      ))}
    </div>
  );
}

export function AudienceChart({ rows, resultName }: { rows: { name: string; clicks: number; results: number }[]; resultName: string }) {
  const max = Math.max(...rows.flatMap((row) => [row.clicks, row.results]), 1);
  return (
    <div role="img" aria-label="Clicks and results by audience">
      <div className="mb-2 flex gap-3 text-[11px] text-muted">
        <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-info" />Clicks</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-brand" />{resultName}</span>
      </div>
      <div className="grid gap-3">
        {rows.map((row) => (
          <div key={row.name}>
            <div className="mb-1 text-xs">{row.name}</div>
            <div className="mb-1 h-3 overflow-hidden rounded bg-chip"><span className="block h-full bg-info" style={{ width: `${(row.clicks / max) * 100}%` }} /></div>
            <div className="h-3 overflow-hidden rounded bg-chip"><span className="block h-full bg-brand" style={{ width: `${(row.results / max) * 100}%` }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PacingChart({ rows }: { rows: { label: string; spend: number; budget: number; cap: number; over: boolean }[] }) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((row) => Math.max(row.spend, row.cap, row.budget)), 1);
  const width = 640;
  const height = 220;
  const plotTop = 16;
  const plotBottom = 168;
  const yFor = (value: number) => plotBottom - scale(value, max, plotBottom - plotTop);
  const budgetY = yFor(rows[0]?.budget ?? 0);
  const capY = yFor(rows[0]?.cap ?? 0);
  const slot = (width - 56) / Math.max(rows.length, 1);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[240px] w-full" role="img" aria-label="Budget pacing. Bars are spend. The dashed line is the daily budget a person set. The dotted line is 125 percent of that budget.">
      <line x1="48" y1={budgetY} x2={width - 12} y2={budgetY} stroke="var(--ink)" strokeDasharray="6 4" strokeWidth="2" />
      <line x1="48" y1={capY} x2={width - 12} y2={capY} stroke="var(--danger)" strokeDasharray="2 3" strokeWidth="2" />
      {rows.map((row, index) => {
        const barHeight = scale(row.spend, max, plotBottom - plotTop);
        const x = 56 + index * slot;
        return (
          <g key={row.label}>
            <rect x={x} y={plotBottom - barHeight} width={Math.max(slot - 8, 4)} height={barHeight} rx="3" fill={row.over ? "var(--danger)" : "var(--info)"}>
              <title>{`${row.label}: spend ${formatMoney(row.spend)}`}</title>
            </rect>
            <text x={x + 8} y="188" fill="var(--muted)" fontSize="11">{row.label}</text>
          </g>
        );
      })}
      <text x="4" y={budgetY + 4} fill="var(--ink)" fontSize="11">Budget</text>
      <text x="4" y={capY + 4} fill="var(--danger)" fontSize="11">125%</text>
    </svg>
  );
}

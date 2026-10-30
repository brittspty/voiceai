"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { brandTokens } from "@/lib/brand/tokens";
import {
  anomalies,
  anomalyReason,
  awarenessText,
  buildKpis,
  dashSearch,
  effectiveMetric,
  formatCount,
  formatMoney,
  formatPct,
  funnelCaption,
  goalLabel,
  METRIC_NAMES,
  rangeTotal,
  rollupCampaigns,
  series,
  spendOverPacing,
  statusLabel,
  visibleCampaigns,
  type DashCampaign,
  type DashQuery,
  type DashboardModel,
  type MetricKey,
} from "@/lib/marketing/dashboard-model";
import { formatCents } from "@/lib/marketing/lead-value";
import { AudienceChart, CompareBars, CompareScatter, DonutChart, PacingChart, Sparkline, TrendChart } from "@/components/marketing-dashboard-charts";
import { LeadValueForm } from "@/components/lead-value-form";
import type { HomeFeature } from "@/lib/marketing/home-dashboard";

function href(basePath: string, query: DashQuery, patch: Partial<DashQuery> = {}) {
  return `${basePath}${dashSearch(query, { ...patch, editLead: patch.editLead ?? false })}`;
}

function Icon({ format }: { format: string }) {
  if (format === "Video") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="3" y="5" width="14" height="14" rx="2" />
        <path d="M17 10l4-2v8l-4-2" />
      </svg>
    );
  }
  if (format === "Carousel") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="6" y="5" width="12" height="14" rx="2" />
        <path d="M3 8v8M21 8v8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M21 17l-5-5-9 8" />
    </svg>
  );
}

function Kpis({ model, campaigns, days, basePath }: { model: DashboardModel; campaigns: DashCampaign[]; days: number; basePath: string }) {
  const tiles = buildKpis({ campaigns, days, showMoney: model.showMoney, leadValue: model.leadValue ?? null });
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
      {tiles.map((tile) => (
        <article key={tile.label} className="rounded-[14px] border border-line bg-card px-3.5 pb-1.5 pt-3.5">
          <div className="flex items-start justify-between gap-2 text-xs text-muted">
            <span>{tile.label}</span>
            {tile.change != null && (
              <span className={tile.good ? "font-semibold text-success" : "font-semibold text-danger"} aria-label={`${tile.change > 0 ? "up" : "down"} ${Math.abs(tile.change * 100).toFixed(0)} percent versus the previous period`}>
                {tile.change > 0 ? "▲" : "▼"} {Math.abs(tile.change * 100).toFixed(0)}%
              </span>
            )}
          </div>
          {tile.prompt ? (
            model.canEditLeadValue ? (
            <a className="inline-flex min-h-11 items-center text-left text-xs font-medium text-info underline" href={href(basePath, { days: days as 7 | 14 | 30, status: "", goal: "", metric: "l", campaignId: null, editLead: true })}>
              Set lead value to see estimated ROAS
            </a>
            ) : (
              <p className="py-2 text-xs text-muted">Set lead value to see estimated ROAS</p>
            )
          ) : (
            <div className="text-xl font-semibold md:text-2xl">{tile.value}</div>
          )}
          {tile.hint && <p className="text-[11px] text-muted">{tile.hint}</p>}
          {tile.series ? <Sparkline values={tile.series} /> : <p className="py-2 text-[11px] text-muted">vs previous {days} days</p>}
        </article>
      ))}
    </div>
  );
}

function Notes({ model, notes }: { model: DashboardModel; notes: DashboardModel["notes"] }) {
  const staff = model.mode === "staff";
  return (
    <section className="mb-4 rounded-[14px] border border-line bg-card p-4 max-md:order-1">
      <h2 className="text-base font-semibold">{staff ? "Bot recommendations" : "What we're seeing"}</h2>
      <p className="mb-3 text-[13px] text-muted">
        {staff ? "Recommendations only. Bots never change budgets; a person on your team decides." : "Notes from your Specificity team"}
      </p>
      <div className="grid gap-2">
        {notes.length ? (
          notes.map((note) => (
            <article key={`${note.campaignId}-${note.text}`} className="rounded-lg border border-line border-l-4 border-l-brand bg-card px-3 py-2.5 text-[13px]">
              <b className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                {staff ? "Not applied · " : ""}
                {note.campaignName}
              </b>
              {note.text}
            </article>
          ))
        ) : (
          <p className="text-[13px] text-muted">Nothing unusual right now.</p>
        )}
      </div>
    </section>
  );
}

function LeadCard({ model, basePath }: { model: DashboardModel; basePath: string }) {
  if (!model.showMoney) return null;
  const value = model.leadValue;
  return (
    <section className="mb-4 rounded-[14px] border border-line bg-card p-4 max-md:order-1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Lead value · this client</h2>
          <p className="text-[13px] text-muted">Used only to estimate ROAS. Staff only; never shown to the client.</p>
        </div>
        {model.canEditLeadValue && (
          <a className="inline-flex min-h-11 items-center rounded-[10px] border border-ink px-4 font-semibold" href={`${basePath}?edit=lv`}>
            {value ? "Edit" : "Set lead value"}
          </a>
        )}
      </div>
      {value ? (
        <>
          <div className="mt-2.5 flex gap-6">
            <div>
              <span className="block text-xs text-muted">Per lead</span>
              <b className="text-[22px]">{formatCents(value.leadCents)}</b>
            </div>
            <div>
              <span className="block text-xs text-muted">Per call</span>
              <b className="text-[22px]">{value.callCents == null ? "Same as lead" : formatCents(value.callCents)}</b>
            </div>
          </div>
          <p className="mt-2 text-[13px] text-muted">Set by {value.by} · {value.at}</p>
        </>
      ) : (
        <div className="mt-2.5 rounded-lg border border-dashed border-brand bg-warning-soft p-2.5 text-sm">
          No lead value set yet. Estimated ROAS is hidden until you add one.
          {model.canEditLeadValue && (
            <>
              {" "}
              <a className="font-semibold text-info underline" href="/marketing/onboarding?step=4">Set it during onboarding</a>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function CampaignTable({ model, rows, query, basePath }: { model: DashboardModel; rows: ReturnType<typeof rollupCampaigns>; query: DashQuery; basePath: string }) {
  const max = Math.max(...rows.map((row) => row.results), 1);
  const linkFor = (id: string) => href(basePath, query, { campaignId: id });
  return (
    <section className="mb-4 rounded-[14px] border border-line bg-card p-4 max-md:order-2">
      <h2 className="mb-2 text-base font-semibold">Campaigns</h2>
      <div className={model.mode === "client" ? "hidden overflow-x-auto md:block" : "overflow-x-auto"}>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-muted">
              <th scope="col" className="border-b border-line px-2 py-2 font-medium">Campaign</th>
              <th scope="col" className="border-b border-line px-2 py-2 font-medium">Status</th>
              <th scope="col" className={`border-b border-line px-2 py-2 font-medium ${model.showMoney ? "hidden md:table-cell" : ""}`}>Views</th>
              <th scope="col" className={`border-b border-line px-2 py-2 font-medium ${model.showMoney ? "hidden md:table-cell" : ""}`}>Clicks</th>
              <th scope="col" className="hidden border-b border-line px-2 py-2 font-medium md:table-cell">Click rate</th>
              <th scope="col" className="border-b border-line px-2 py-2 font-medium">Leads + calls</th>
              {model.showMoney && (
                <>
                  <th scope="col" className="border-b border-line px-2 py-2 font-medium">Spend</th>
                  <th scope="col" className="border-b border-line px-2 py-2 font-medium">CPA</th>
                  <th scope="col" className="hidden border-b border-line px-2 py-2 font-medium md:table-cell">Daily budget</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.campaign.id} className="hover:bg-warning-soft dark:hover:bg-hover">
                <td className="border-b border-line px-2 py-2.5">
                  <Link className="font-semibold hover:underline" href={linkFor(row.campaign.id)}>{row.campaign.name}</Link>
                </td>
                <td className="border-b border-line px-2 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${row.campaign.status === "active" ? "bg-success-soft text-success" : "bg-chip text-muted"}`}>{statusLabel(row.campaign.status)}</span>
                </td>
                <td className={`border-b border-line px-2 py-2.5 ${model.showMoney ? "hidden md:table-cell" : ""}`}>{formatCount(row.views)}</td>
                <td className={`border-b border-line px-2 py-2.5 ${model.showMoney ? "hidden md:table-cell" : ""}`}>{formatCount(row.clicks)}</td>
                <td className="hidden border-b border-line px-2 py-2.5 md:table-cell">{formatPct(row.ctr)}</td>
                <td className="border-b border-line px-2 py-2.5">
                  {row.campaign.goal === "awareness" ? (
                    <span className="text-xs text-muted">{awarenessText(row.reach)}</span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      {formatCount(row.results)}
                      <span className="h-1.5 w-[90px] overflow-hidden rounded-full bg-chip" aria-hidden="true">
                        <span className="block h-full bg-brand" style={{ width: `${(row.results / max) * 100}%` }} />
                      </span>
                    </span>
                  )}
                </td>
                {model.showMoney && (
                  <>
                    <td className="border-b border-line px-2 py-2.5">{formatMoney(row.spend)}</td>
                    <td className="border-b border-line px-2 py-2.5">{row.results ? formatMoney(row.spend / row.results) : "—"}</td>
                    <td className="hidden border-b border-line px-2 py-2.5 md:table-cell">{row.campaign.dailyBudget != null ? formatMoney(row.campaign.dailyBudget) : "—"}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {model.mode === "client" && (
        <div className="grid gap-2 md:hidden">
          {rows.map((row) => {
            const key = row.campaign.goal === "awareness" ? "r" : row.campaign.goal === "calls" ? "k" : "l";
            const length = row.campaign.ads[0]?.days.length ?? 0;
            const spark = series([row.campaign], key).slice(Math.max(0, length - query.days));
            return (
              <Link key={row.campaign.id} href={linkFor(row.campaign.id)} className="block rounded-xl border border-line p-3">
                <span className="flex items-start justify-between gap-2 font-semibold">
                  <span>{row.campaign.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${row.campaign.status === "active" ? "bg-success-soft text-success" : "bg-chip text-muted"}`}>{statusLabel(row.campaign.status)}</span>
                </span>
                <span className="mt-1.5 block text-sm">
                  {row.campaign.goal === "awareness" ? awarenessText(row.reach) : <><b>{formatCount(row.results)}</b> leads + calls</>}
                </span>
                <Sparkline values={spark} />
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function More({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (ref.current && window.matchMedia("(min-width: 768px)").matches) ref.current.open = true;
  }, []);
  return (
    <>
      <style>{`@media (min-width: 768px) { details.dash-more > summary { display: none; } details.dash-more > :not(summary) { display: block !important; } }`}</style>
      <details ref={ref} className="dash-more mb-4 max-md:order-4">
        <summary className="mb-3 flex min-h-11 cursor-pointer list-none items-center justify-center rounded-xl border border-line bg-card font-semibold md:hidden">More charts</summary>
        {children}
      </details>
    </>
  );
}

export function MarketingDashboard({
  model,
  query,
  basePath,
  features = [],
}: {
  model: DashboardModel;
  query: DashQuery;
  basePath: string;
  features?: HomeFeature[];
}) {
  const router = useRouter();
  const list = visibleCampaigns(model.campaigns, query);
  const selected = query.campaignId ? list.find((campaign) => campaign.id === query.campaignId) || model.campaigns.find((campaign) => campaign.id === query.campaignId) : null;
  const metric = effectiveMetric({ metric: query.metric, goal: selected?.goal ?? null, showMoney: model.showMoney });
  const [leadOpen, setLeadOpen] = useState(query.editLead && Boolean(model.canEditLeadValue));
  const dialog = useRef<HTMLDialogElement>(null);
  const setDialog = (node: HTMLDialogElement | null) => {
    dialog.current = node;
    if (node && leadOpen && !node.open) node.showModal();
    if (node && !leadOpen && node.open) node.close();
  };

  const metricOptions = (Object.keys(METRIC_NAMES) as MetricKey[]).filter((key) => model.showMoney || key !== "s");

  return (
    <div>
      {model.mode === "staff" && (
        <div className="mb-3 flex justify-end">
          <span className="rounded-full bg-ink px-2.5 py-1 text-xs font-semibold text-on-ink">Staff view · Specificity team only</span>
        </div>
      )}
      <div className="mb-4 flex flex-wrap gap-2" role="toolbar" aria-label="Filters">
        <div className="flex overflow-hidden rounded-[10px] border border-line bg-card" role="group" aria-label="Date range">
          {([7, 14, 30] as const).map((days) => (
            <Link key={days} href={href(basePath, query, { days })} aria-current={query.days === days ? "page" : undefined} className={`inline-flex min-h-11 items-center px-4 ${query.days === days ? "bg-ink text-on-ink" : ""}`}>
              {days} days
            </Link>
          ))}
        </div>
        <form action={basePath} method="get" className="flex flex-wrap gap-2">
          {query.days !== 30 && <input type="hidden" name="d" value={query.days} />}
          {metric !== "l" && <input type="hidden" name="m" value={metric} />}
          <select name="st" aria-label="Status" defaultValue={query.status} className="min-h-11 rounded-[10px] border border-line bg-card px-2.5" onChange={(event) => router.push(href(basePath, query, { status: event.target.value as DashQuery["status"], campaignId: null }))}>
            <option value="">Status: All</option>
            <option value="active">Status: Active</option>
            <option value="paused">Status: Paused</option>
          </select>
          <select name="g" aria-label="Campaign goal" defaultValue={query.goal} className="min-h-11 rounded-[10px] border border-line bg-card px-2.5" onChange={(event) => router.push(href(basePath, query, { goal: event.target.value as DashQuery["goal"], campaignId: null }))}>
            <option value="">Campaign goal: All</option>
            <option value="leads">Campaign goal: Leads</option>
            <option value="calls">Campaign goal: Calls</option>
            <option value="awareness">Campaign goal: Awareness</option>
          </select>
          <button className="min-h-11 rounded-[10px] border border-line bg-card px-3 font-semibold" type="submit">Apply</button>
        </form>
        <select aria-label="Chart shows" value={metric} className="min-h-11 rounded-[10px] border border-line bg-card px-2.5" onChange={(event) => router.push(href(basePath, query, { metric: event.target.value as MetricKey }))}>
          {metricOptions.map((key) => (
            <option key={key} value={key}>Chart shows: {METRIC_NAMES[key]}</option>
          ))}
        </select>
      </div>

      {features.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-3 text-base font-semibold">Marketing</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {features.map((feature) => (
              <article key={feature.id} className="rounded-[14px] border border-line border-l-4 border-l-brand bg-card p-4">
                <h3 className="text-sm font-semibold">{feature.title}</h3>
                <p className="mt-1 text-sm text-muted">{feature.detail}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-col">
        {selected ? (
          <Drill model={model} campaign={selected} query={query} metric={metric} basePath={basePath} />
        ) : (
          <Overview model={model} query={query} metric={metric} list={list} basePath={basePath} onOpen={(id) => router.push(href(basePath, query, { campaignId: id }))} />
        )}
      </div>

      <p className="py-6 text-center text-xs text-muted">
        {brandTokens.wordmark} · {brandTokens.tagline} · {model.sourceLine}
        {model.mock ? " · Mock data" : ""}
      </p>

      {model.canEditLeadValue && (
        <dialog ref={setDialog} className="w-[calc(100%-28px)] max-w-[440px] rounded-2xl border-0 p-5" aria-labelledby="lead-value-title" onClose={() => setLeadOpen(false)}>
          <h2 id="lead-value-title" className="text-base font-semibold">Lead value for this client</h2>
          <p className="mb-3 text-[13px] text-muted">What one lead is worth to this client. We use it only to estimate ROAS. The client never sees it.</p>
          <LeadValueForm
            initialLead={model.leadValue ? (model.leadValue.leadCents / 100).toFixed(2) : ""}
            initialCall={model.leadValue?.callCents != null ? (model.leadValue.callCents / 100).toFixed(2) : ""}
            submitLabel="Save"
            byline="Only super admins and account managers can edit this. Changes are logged with name and time."
            onSaved={() => {
              setLeadOpen(false);
              router.replace(href(basePath, query));
            }}
          />
          <button type="button" className="mt-2 min-h-11 text-sm text-muted underline" onClick={() => setLeadOpen(false)}>Cancel</button>
        </dialog>
      )}
    </div>
  );
}

function Overview({
  model,
  query,
  metric,
  list,
  basePath,
  onOpen,
}: {
  model: DashboardModel;
  query: DashQuery;
  metric: MetricKey;
  list: DashCampaign[];
  basePath: string;
  onOpen: (id: string) => void;
}) {
  const rows = rollupCampaigns(list, query.days).sort((a, b) => Number(b.campaign.goal !== "awareness") - Number(a.campaign.goal !== "awareness") || b.results - a.results);
  const length = list[0]?.ads[0]?.days.length ?? model.dates.length;
  const start = Math.max(0, length - query.days);
  const full = series(list, metric);
  const flags = anomalies(full).filter((flag) => flag.index >= start);
  const points = model.dates.slice(start).map((date, index) => {
    const absolute = start + index;
    const flag = flags.find((item) => item.index === absolute);
    return { label: date.slice(5), value: full[absolute] ?? 0, reason: flag ? anomalyReason(METRIC_NAMES[metric], flag.change) : undefined };
  });
  const ranked = rows.filter((row) => row.results > 0).sort((a, b) => b.results - a.results);
  const top = ranked.slice(0, 5);
  const other = ranked.slice(5).reduce((sum, row) => sum + row.results, 0);
  const slices = [...top.map((row) => ({ name: row.campaign.name, value: row.results })), ...(other ? [{ name: "Other", value: other }] : [])];
  const notes = model.notes.filter((note) => !query.goal && !query.status ? true : list.some((campaign) => campaign.id === note.campaignId));

  return (
    <>
      <div className="order-first">
        <h1 className="text-[22px] font-semibold">All campaigns</h1>
        <p className="mb-3 text-[13px] text-muted">Last {query.days} days · {list.length} campaigns · open any campaign to see inside it</p>
      </div>
      <Kpis model={model} campaigns={list} days={query.days} basePath={basePath} />
      <Notes model={model} notes={notes} />
      <LeadCard model={model} basePath={basePath} />
      <section className="mb-4 rounded-[14px] border border-line bg-card p-4 max-md:order-3">
        <h2 className="text-base font-semibold">{METRIC_NAMES[metric]} over time</h2>
        <TrendChart name={METRIC_NAMES[metric]} points={points} />
        {flags.length ? (
          <>
            <p className="mt-2 text-[13px] text-muted">Red flags mark days that were unusual compared with the week before. Tap a flag for details.</p>
            <ul className="mt-1 list-none p-0 text-xs">
              {flags.map((flag) => (
                <li key={flag.index} className="before:text-danger before:content-['●_']">
                  {new Date(`${model.dates[flag.index]}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}: {anomalyReason(METRIC_NAMES[metric], flag.change)}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-[13px] text-muted">No unusual days in this range.</p>
        )}
      </section>
      <More>
        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
          <section className="rounded-[14px] border border-line bg-card p-4">
            <h2 className="text-base font-semibold">{model.showMoney ? "Campaign comparison" : "Leads + calls by campaign"}</h2>
            <p className="mb-2 text-[13px] text-muted">
              {model.showMoney ? "Bubble size = leads + calls. Higher is more leads and calls per $100 spend; further right is a higher click rate." : "Which campaigns brought you the most leads and calls"}
            </p>
            {model.showMoney ? (
              <CompareScatter
                points={ranked.map((row) => ({ id: row.campaign.id, name: row.campaign.name, ctr: row.ctr, per100: (row.results / Math.max(1, row.spend)) * 100, results: row.results }))}
                onOpen={onOpen}
              />
            ) : (
              <CompareBars rows={ranked.map((row) => ({ id: row.campaign.id, name: row.campaign.name, value: row.results }))} onOpen={onOpen} />
            )}
          </section>
          <section className="rounded-[14px] border border-line bg-card p-4">
            <h2 className="text-base font-semibold">Where leads + calls come from</h2>
            <p className="mb-2 text-[13px] text-muted">Top 5 campaigns, the rest grouped as Other</p>
            {slices.length ? <DonutChart slices={slices} center={`${formatCount(ranked.reduce((sum, row) => sum + row.results, 0))}\nleads + calls`} /> : <p className="text-sm text-muted">No leads or calls in this range.</p>}
          </section>
        </div>
      </More>
      {!list.length && <p className="mb-4 text-sm text-muted">No campaigns in this workspace for these filters. Numbers show up after a sync.</p>}
      <CampaignTable model={model} rows={rows} query={query} basePath={basePath} />
    </>
  );
}

function adRollup(campaign: DashCampaign, days: number) {
  const length = campaign.ads[0]?.days.length ?? 0;
  const start = Math.max(0, length - days);
  return campaign.ads
    .map((ad) => {
      const slice = ad.days.slice(start);
      const sum = (key: "i" | "c" | "r" | "l" | "k" | "s") => slice.reduce((total, day) => total + (key === "s" ? day.s ?? 0 : day[key]), 0);
      return { ad, views: sum("i"), clicks: sum("c"), reach: sum("r"), results: sum("l") + sum("k"), spend: sum("s") };
    })
    .sort((a, b) => b.results - a.results || b.clicks - a.clicks);
}

function Drill({
  model,
  campaign,
  query,
  metric,
  basePath,
}: {
  model: DashboardModel;
  campaign: DashCampaign;
  query: DashQuery;
  metric: MetricKey;
  basePath: string;
}) {
  const ads = adRollup(campaign, query.days);
  const length = campaign.ads[0]?.days.length ?? model.dates.length;
  const start = Math.max(0, length - query.days);
  const views = rangeTotal(series([campaign], "i"), start, length);
  const clicks = rangeTotal(series([campaign], "c"), start, length);
  const reach = rangeTotal(series([campaign], "r"), start, length);
  const results = rangeTotal(series([campaign], "l"), start, length) + rangeTotal(series([campaign], "k"), start, length);
  const awareness = campaign.goal === "awareness";
  const full = series([campaign], metric);
  const flags = anomalies(full).filter((flag) => flag.index >= start);
  const points = model.dates.slice(start, length).map((date, index) => {
    const absolute = start + index;
    const flag = flags.find((item) => item.index === absolute);
    return { label: date.slice(5), value: full[absolute] ?? 0, reason: flag ? anomalyReason(METRIC_NAMES[metric], flag.change) : undefined };
  });
  const audiences = new Map<string, { name: string; clicks: number; results: number }>();
  for (const row of ads) {
    const current = audiences.get(row.ad.audience) ?? { name: row.ad.audience, clicks: 0, results: 0 };
    current.clicks += row.clicks;
    current.results += awareness ? row.reach : row.results;
    audiences.set(row.ad.audience, current);
  }
  const paceStart = Math.max(0, length - 7);
  const spendSeries = series([campaign], "s");
  const pace = model.dates.slice(paceStart, length).map((date, index) => {
    const spend = spendSeries[paceStart + index] ?? 0;
    const budget = campaign.dailyBudget ?? 0;
    return { label: date.slice(5), spend, budget, cap: budget * 1.25, over: spendOverPacing(spend, budget) };
  });
  const notes = model.notes.filter((note) => note.campaignId === campaign.id);

  return (
    <>
      <div className="order-first">
        <Link className="inline-flex min-h-11 items-center font-medium text-info" href={href(basePath, query, { campaignId: null })}>← All campaigns</Link>
        <h1 className="text-[22px] font-semibold">{campaign.name}</h1>
        <p className="mb-3 text-[13px] text-muted">
          <span className={`mr-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${campaign.status === "active" ? "bg-success-soft text-success" : "bg-chip text-muted"}`}>{statusLabel(campaign.status)}</span>
          · Goal: {goalLabel(campaign.goal)} · {new Set(campaign.ads.map((ad) => ad.audience)).size} audience{new Set(campaign.ads.map((ad) => ad.audience)).size === 1 ? "" : "s"} · {ads.length} ads · last {query.days} days
        </p>
      </div>
      <Kpis model={model} campaigns={[campaign]} days={query.days} basePath={basePath} />
      <Notes model={model} notes={notes} />
      <div className="mb-4 grid gap-4 md:grid-cols-[2fr_1fr]">
        <section className="rounded-[14px] border border-line bg-card p-4">
          <h2 className="text-base font-semibold">Who saw it, who clicked, who reached out</h2>
          <p className="mb-2 text-[13px] text-muted">{funnelCaption({ awareness, views, clicks, reach, results })}</p>
          <div className="flex h-[240px] flex-col justify-center gap-1 md:h-[300px]" role="img" aria-label="Funnel from views to clicks to results">
            {(awareness
              ? [
                  { name: "Views", value: views, color: "var(--ink)" },
                  { name: "Clicks", value: clicks, color: "var(--info)" },
                ]
              : [
                  { name: "Views", value: views, color: "var(--ink)" },
                  { name: "Clicks", value: clicks, color: "var(--info)" },
                  { name: "Leads + calls", value: results, color: "var(--brand-ink)" },
                ]
            ).map((step) => (
              <div key={step.name} className="mx-auto flex h-14 items-center justify-center rounded-md px-2 text-center text-sm font-semibold text-white" style={{ width: `${Math.max(46, (step.value / Math.max(views, 1)) * 100)}%`, background: step.color }}>
                {step.name} {formatCount(step.value)}
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-[14px] border border-line bg-card p-4">
          <h2 className="text-base font-semibold">{METRIC_NAMES[metric]} by day</h2>
          <TrendChart name={METRIC_NAMES[metric]} points={points} />
          {flags.length ? (
            <ul className="mt-2 list-none p-0 text-xs">
              {flags.map((flag) => (
                <li key={flag.index} className="before:text-danger before:content-['●_']">
                  {model.dates[flag.index]?.slice(5)}: {anomalyReason(METRIC_NAMES[metric], flag.change)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[13px] text-muted">No unusual days in this range.</p>
          )}
        </section>
      </div>
      {model.showMoney && (
        <section className="mb-4 rounded-[14px] border border-line bg-card p-4">
          <h2 className="text-base font-semibold">Budget pacing (last 7 days)</h2>
          <p className="mb-2 text-[13px] text-muted">
            {campaign.dailyBudget != null
              ? `Read-only. Daily budget ${formatMoney(campaign.dailyBudget)}${campaign.budgetSetBy ? `, set by ${campaign.budgetSetBy}` : ""}${campaign.budgetSetAt ? ` on ${campaign.budgetSetAt}` : ""}. Red bars spent over 125% of it.`
              : "Read-only. No daily budget has been set by a person, so the 125% line stays hidden."}
          </p>
          {campaign.dailyBudget != null ? <PacingChart rows={pace} /> : <p className="text-sm text-muted">Spend for these days is {formatMoney(pace.reduce((sum, row) => sum + row.spend, 0))}.</p>}
          <p className="mt-2 rounded-lg border border-dashed border-line px-2 py-1.5 text-xs text-muted">
            Bots can&apos;t change budgets. To change it, the account owner edits it in Meta
            {model.canEditLeadValue ? <> or <a className="font-semibold text-info underline" href="/marketing?view=budget">Budget settings</a></> : " or Budget settings"}.
          </p>
        </section>
      )}
      <More>
        <section className="rounded-[14px] border border-line bg-card p-4">
          <h2 className="text-base font-semibold">Audiences</h2>
          <p className="mb-2 text-[13px] text-muted">Clicks and {awareness ? "people reached" : "leads + calls"} by audience</p>
          <AudienceChart rows={[...audiences.values()]} resultName={awareness ? "People reached" : "Leads + calls"} />
        </section>
      </More>
      <section className="mb-4 rounded-[14px] border border-line bg-card p-4">
        <h2 className="text-base font-semibold">Your ads</h2>
        <p className="mb-3 text-[13px] text-muted">Ranked by {awareness ? "clicks" : "leads + calls"} · swipe to see more</p>
        <div className="flex snap-x gap-3 overflow-x-auto pb-1 md:grid md:grid-cols-[repeat(auto-fill,minmax(210px,1fr))] md:overflow-visible">
          {ads.map((row, index) => (
            <article key={row.ad.id} className="w-[78%] shrink-0 snap-start overflow-hidden rounded-xl border border-line md:w-auto">
              <div className="relative flex h-24 flex-col items-center justify-center gap-0.5 bg-chip text-xs text-ink">
                <span className="absolute left-2 top-2 rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-on-ink">#{index + 1}</span>
                {row.ad.thumbnailUrl ? (
                  // Real creative thumbnails are https links cached from the ad platform. Everything else stays a grey preview.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.ad.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <>
                    <Icon format={row.ad.format} />
                    <span>{row.ad.format}</span>
                    <span className="text-[11px] text-muted">Preview coming</span>
                  </>
                )}
              </div>
              <div className="p-2.5 text-xs">
                <strong className="mb-1 block text-[13px]">{row.ad.name}</strong>
                {row.ad.audience}
                <br />
                {formatCount(row.views)} views · {formatPct(row.clicks / Math.max(1, row.views))} click rate
                <br />
                <b>{awareness ? `${formatCount(row.reach)} reached` : `${formatCount(row.results)} leads + calls`}</b>
                {model.showMoney && <> · {formatMoney(row.spend)} spend · CPA {row.results ? formatMoney(row.spend / row.results) : "—"}</>}
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

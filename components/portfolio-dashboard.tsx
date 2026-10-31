"use client";

import { useEffect, useMemo, useState } from "react";
import { analyticsThemeCss } from "@/lib/brand/tokens";
import {
  PORTFOLIO_REFRESH_MS,
  formatPortfolioSpend,
  sortPortfolio,
  type PortfolioModel,
  type PortfolioSortKey,
} from "@/lib/portfolio";

export function PortfolioDashboard({ initial }: { initial: PortfolioModel }) {
  const [model, setModel] = useState(initial);
  const [sortKey, setSortKey] = useState<PortfolioSortKey>("alerts");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [customSort, setCustomSort] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const pull = window.setInterval(async () => {
      try {
        const response = await fetch("/api/portfolio");
        if (!response.ok) return;
        const body = (await response.json()) as PortfolioModel;
        if (body?.clients) setModel(body);
      } catch {
        /* Keep the last staff snapshot. Sign-in is unaffected. */
      }
    }, PORTFOLIO_REFRESH_MS);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(pull);
    };
  }, []);

  const clients = useMemo(() => (customSort ? sortPortfolio(model.clients, sortKey, direction) : model.clients), [model.clients, customSort, sortKey, direction]);
  const refreshed = Math.max(0, Math.round((now - Date.parse(model.generatedAt)) / 1000));

  function toggle(key: PortfolioSortKey) {
    if (customSort && sortKey === key) setDirection((value) => (value === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setDirection(key === "client" ? "asc" : "desc");
    }
    setCustomSort(true);
  }

  return (
    <div className="jarvis-dark min-h-screen">
      <style dangerouslySetInnerHTML={{ __html: analyticsThemeCss() }} />
      <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-4 min-[701px]:px-8">
        <div className="text-lg font-bold">
          spec<span className="text-brand">i</span>ficity · Jarvis
        </div>
        <p className="num text-right text-[13px] text-soft">{model.roleLine}</p>
      </header>
      <main className="px-4 py-6 min-[701px]:px-8 min-[701px]:py-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] font-semibold tracking-tight">Portfolio</h1>
          <p className="num text-xs text-muted">Live · refreshed {refreshed}s ago</p>
        </div>
        <div className={`mt-6 grid grid-cols-2 gap-3 ${model.showMoney ? "min-[701px]:grid-cols-5" : "min-[701px]:grid-cols-4"}`}>
          <Kpi value={model.totals.clients.toLocaleString("en-US")} label="Clients" />
          <Kpi value={model.totals.leads.toLocaleString("en-US")} label="Leads this month" />
          <Kpi value={model.totals.qualityMedian == null ? "—" : String(model.totals.qualityMedian)} label="Lead quality (median)" />
          <Kpi value={model.totals.openAlerts.toLocaleString("en-US")} label="Open alerts" alert={model.totals.openAlerts > 0} />
          {model.showMoney && model.totals.spend != null && <Kpi value={formatPortfolioSpend(model.totals.spend)} label="Spend MTD (staff only)" />}
        </div>
        <div className="mt-6 hidden overflow-x-auto rounded-lg border border-line bg-card min-[701px]:block">
          <table className="w-full border-collapse text-sm">
            <caption className="num px-3 py-2.5 text-left text-xs text-muted">Sorted by alerts, then leads. Click a client to open its Command Center.</caption>
            <thead>
              <tr>
                <SortHead label="Client" column="client" sortKey={customSort ? sortKey : "alerts"} direction={customSort ? direction : "desc"} onSort={toggle} sticky />
                <th scope="col" className="num border-b border-line px-2.5 py-2.5 text-left text-xs font-semibold text-muted">Channels</th>
                <SortHead label="Leads" column="leads" sortKey={customSort ? sortKey : "alerts"} direction={customSort ? direction : "desc"} onSort={toggle} />
                <SortHead label="Quality (0–100)" column="quality" sortKey={customSort ? sortKey : "alerts"} direction={customSort ? direction : "desc"} onSort={toggle} />
                <th scope="col" className="num border-b border-line px-2.5 py-2.5 text-left text-xs font-semibold text-muted">Scale · Still learning · Cut</th>
                <SortHead label="Alerts" column="alerts" sortKey={customSort ? sortKey : "alerts"} direction={customSort ? direction : "desc"} onSort={toggle} />
                <th scope="col" className="num border-b border-line px-2.5 py-2.5 text-left text-xs font-semibold text-muted">Pixel</th>
                <th scope="col" className="num border-b border-line px-2.5 py-2.5 text-left text-xs font-semibold text-muted">Match rate</th>
                {model.showMoney && <SortHead label="Spend MTD" column="spend" sortKey={customSort ? sortKey : "alerts"} direction={customSort ? direction : "desc"} onSort={toggle} />}
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <PortfolioRow key={client.id} client={client} showMoney={model.showMoney} />
              ))}
            </tbody>
          </table>
          {!clients.length && <p className="px-3 py-6 text-sm text-muted">No clients in this view yet.</p>}
        </div>
        <ul className="mt-6 grid gap-3 min-[701px]:hidden">
          {clients.map((client) => (
            <li key={client.id} className="rounded-lg border border-line bg-card p-4">
              <a className="inline-flex min-h-11 items-center font-semibold underline-offset-2 hover:underline" href={client.href}>
                {client.name}
              </a>
              {client.detail && <p className="num mt-1 text-xs text-muted">{client.detail}</p>}
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-muted">Channels</dt>
                  <dd className="num">{client.channels}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Leads</dt>
                  <dd className="num">{client.leads.toLocaleString("en-US")}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Quality (0–100)</dt>
                  <dd className="num">
                    {client.quality == null ? "—" : client.quality}
                    {client.provisional && <small className="ml-1 text-muted">provisional</small>}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Alerts</dt>
                  <dd className={`num ${client.alerts > 0 ? "text-danger" : ""}`}>{client.alertLabel}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Pixel</dt>
                  <dd className="num">{client.pixelLabel}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Match rate</dt>
                  <dd className={`num ${client.matchOnHold ? "text-danger" : ""}`}>{client.matchLabel}</dd>
                </div>
                {model.showMoney && (
                  <div>
                    <dt className="text-xs text-muted">Spend MTD</dt>
                    <dd className="num">{formatPortfolioSpend(client.spend ?? 0)}</dd>
                  </div>
                )}
              </dl>
              <p className="mt-3 flex flex-wrap gap-1">
                <Mix client={client} />
              </p>
            </li>
          ))}
        </ul>
        <p className="num mt-4 text-xs text-muted">{model.budgetNote}</p>
      </main>
    </div>
  );
}

function Kpi({ value, label, alert = false }: { value: string; label: string; alert?: boolean }) {
  return (
    <article className="rounded-lg border border-line bg-card p-4">
      <p className={`num text-[28px] leading-none font-semibold ${alert ? "text-danger" : ""}`}>{value}</p>
      <p className="mt-2 text-[13px] text-soft">{label}</p>
    </article>
  );
}

function SortHead({
  label,
  column,
  sortKey,
  direction,
  onSort,
  sticky = false,
}: {
  label: string;
  column: PortfolioSortKey;
  sortKey: PortfolioSortKey;
  direction: "asc" | "desc";
  onSort: (column: PortfolioSortKey) => void;
  sticky?: boolean;
}) {
  const active = sortKey === column;
  const aria = active ? (direction === "asc" ? "ascending" : "descending") : "none";
  const mark = active ? (direction === "asc" ? "↑" : "↓") : "↕";
  return (
    <th scope="col" aria-sort={aria} className={`border-b border-line px-2.5 py-2.5 text-left ${sticky ? "sticky-col" : ""}`}>
      <button type="button" className="num min-h-6 text-xs font-semibold text-muted" onClick={() => onSort(column)}>
        {label} {mark}
      </button>
    </th>
  );
}

function Mix({ client }: { client: PortfolioModel["clients"][number] }) {
  return (
    <>
      <span className="chip-scale num mr-1 inline-block rounded px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap">{client.scale} Scale</span>
      <span className="chip-learning num mr-1 inline-block rounded px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap">{client.learning} Learning</span>
      <span className="chip-cut num inline-block rounded px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap">{client.cut} Cut</span>
    </>
  );
}

function PortfolioRow({ client, showMoney }: { client: PortfolioModel["clients"][number]; showMoney: boolean }) {
  return (
    <tr>
      <td className="sticky-col border-b border-line px-2.5 py-3">
        <a className="font-semibold underline-offset-2 hover:underline" href={client.href}>
          {client.name}
        </a>
        {client.detail && <span className="num mt-1 block text-xs text-muted">{client.detail}</span>}
      </td>
      <td className="num border-b border-line px-2.5 py-3">{client.channels}</td>
      <td className="num border-b border-line px-2.5 py-3">{client.leads.toLocaleString("en-US")}</td>
      <td className="num border-b border-line px-2.5 py-3">
        {client.quality == null ? "—" : client.quality}
        {client.provisional && <small className="ml-1 text-muted">provisional</small>}
      </td>
      <td className="border-b border-line px-2.5 py-3">
        <Mix client={client} />
      </td>
      <td className={`num border-b border-line px-2.5 py-3 ${client.alerts > 0 ? "text-danger" : ""}`}>{client.alertLabel}</td>
      <td className={`num border-b border-line px-2.5 py-3 ${client.pixelTone === "ok" ? "text-success" : client.pixelTone === "warn" ? "text-warning" : client.pixelTone === "bad" ? "text-danger" : "text-muted"}`}>
        {client.pixelLabel}
      </td>
      <td className={`num border-b border-line px-2.5 py-3 ${client.matchOnHold ? "text-danger" : ""}`}>{client.matchLabel}</td>
      {showMoney && <td className="num border-b border-line px-2.5 py-3">{formatPortfolioSpend(client.spend ?? 0)}</td>}
    </tr>
  );
}

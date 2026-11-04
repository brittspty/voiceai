import Link from "next/link";
import { formatCount, formatMoney, DASH_DAY_OPTIONS } from "@/lib/marketing/dashboard-model";
import { realViewSearch, type RealStatus } from "@/lib/marketing/real-view";
import type { CtvAttributionPage, CtvBreakdownKind } from "@/lib/marketing/ctv/attribution";

function rate(value: number | null) {
  if (value == null) return "—";
  return value.toFixed(1);
}

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatMoney(value);
}

const BREAKDOWN_LABEL: Record<CtvBreakdownKind, string> = {
  publisher: "Publishers",
  app: "Apps",
  device: "Devices",
  geo: "Country",
};

/**
 * Stored StackAdapt conversion attribution.
 * Black and orange only. View-through visits are pixel-tracked site visits after a CTV impression.
 */
export function CtvAttributionLive({ model }: { model: CtvAttributionPage }) {
  const href = (patch: { days?: CtvAttributionPage["days"]; status?: RealStatus; clientId?: string | null }) =>
    realViewSearch({
      days: patch.days ?? model.days,
      status: patch.status !== undefined ? patch.status : model.status,
      staff: model.staff,
      clientId: patch.clientId !== undefined ? patch.clientId : model.clientId,
      path: model.path,
    });
  const groups = new Map<CtvBreakdownKind, CtvAttributionPage["breakdowns"]>();
  for (const row of model.breakdowns) {
    const list = groups.get(row.kind) ?? [];
    list.push(row);
    groups.set(row.kind, list);
  }
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Filters">
        <div className="flex overflow-hidden rounded-[10px] border border-line bg-card" role="group" aria-label="Date range">
          {DASH_DAY_OPTIONS.map((days) => (
            <Link key={days} href={href({ days })} aria-current={model.days === days ? "page" : undefined} className={`inline-flex min-h-11 items-center px-4 ${model.days === days ? "bg-ink text-on-ink" : ""}`}>
              {days} days
            </Link>
          ))}
        </div>
        <div className="flex overflow-hidden rounded-[10px] border border-line bg-card" role="group" aria-label="Status">
          <Link href={href({ status: "active" })} className={`inline-flex min-h-11 items-center px-4 ${model.status === "active" ? "bg-ink text-on-ink" : ""}`} aria-current={model.status === "active" ? "page" : undefined}>Active</Link>
          <Link href={href({ status: "paused" })} className={`inline-flex min-h-11 items-center px-4 ${model.status === "paused" ? "bg-ink text-on-ink" : ""}`} aria-current={model.status === "paused" ? "page" : undefined}>Paused</Link>
          <Link href={href({ status: "" })} className={`inline-flex min-h-11 items-center px-4 ${model.status === "" ? "bg-ink text-on-ink" : ""}`} aria-current={model.status === "" ? "page" : undefined}>All</Link>
        </div>
        {model.staff && model.clients.length ? (
          <form method="get" action={model.path || "/marketing/ctv"} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="d" value={model.days} />
            <input type="hidden" name="st" value={model.status || "all"} />
            <label className="text-xs text-muted" htmlFor="ctv-client">Client</label>
            <select id="ctv-client" name="client" defaultValue={model.clientId ?? ""} aria-label="Client" className="min-h-11 max-w-full rounded-[10px] border border-line bg-card px-2.5">
              <option value="">All clients</option>
              {model.clients.map((client) => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
            <button type="submit" className="min-h-11 rounded-[10px] bg-ink px-3 font-semibold text-on-ink">Open</button>
          </form>
        ) : null}
      </div>
      <p className="border-l-4 border-l-brand pl-3 text-sm">{model.viewThroughLabel}</p>
      <p className="text-sm text-muted">{model.clientName} · Last {model.days} days · Updated {model.updatedLabel}. This page is read only.</p>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Conversion attribution">
        <Tile label="View-through site visits" value={formatCount(model.totals.viewConversions)} />
        <Tile label="Click-through" value={formatCount(model.totals.clickConversions)} />
        <Tile label="Conversions per 1K impressions" value={rate(model.totals.perThousand)} />
        <Tile label="Impressions" value={formatCount(model.totals.impressions)} />
      </section>
      {model.ipSplitAvailable ? (
        <p className="text-sm">IP or household conversions {formatCount(model.totals.ipConversions)}. Cookie conversions {formatCount(model.totals.cookieConversions)}.</p>
      ) : (
        <p className="text-sm text-muted">{model.ipSplitNote}</p>
      )}
      {model.showMoney && model.totals.spend != null ? (
        <p className="text-sm">Spend {money(model.totals.spend)}. CPA {money(model.totals.cpa)}. eCPM {money(model.totals.ecpm)}. Staff only.</p>
      ) : null}
      <section className="rounded-xl border border-line bg-card p-4">
        <h2 className="font-semibold">Daily trend</h2>
        <ul className="mt-3 grid gap-2 text-sm">
          {model.trend.map((row) => (
            <li key={row.date} className="flex justify-between gap-3">
              <span>{row.date}</span>
              <span>{formatCount(row.viewConversions)} view-through · {formatCount(row.clickConversions)} click-through</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-xl border border-line bg-card p-4">
        <h2 className="font-semibold">Conversions by pixel</h2>
        {model.pixelAvailable && model.pixels.length ? (
          <ul className="mt-3 grid gap-2 text-sm">
            {model.pixels.map((row) => (
              <li key={row.id} className="flex justify-between gap-3">
                <span>{row.name}</span>
                <span>{formatCount(row.viewConversions)} view-through · {formatCount(row.clickConversions)} click-through · {rate(row.perThousand)} per 1K</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">{model.pixelNote || "No conversions in this range."}</p>
        )}
      </section>
      <section className="rounded-xl border border-line bg-card p-4">
        <h2 className="font-semibold">Publisher, app, device, and geo</h2>
        {model.breakdownLabel ? <p className="mt-2 text-sm text-muted">{model.breakdownLabel}</p> : null}
        {model.breakdownNote ? <p className="mt-3 text-sm text-muted">{model.breakdownNote}</p> : (
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            {(["publisher", "app", "device", "geo"] as const).map((kind) => (
              <div key={kind}>
                <h3 className="text-sm font-semibold text-brand">{BREAKDOWN_LABEL[kind]}</h3>
                {(groups.get(kind) ?? []).length ? (
                  <ul className="mt-2 grid gap-1 text-sm">
                    {(groups.get(kind) ?? []).map((row) => (
                      <li key={`${row.kind}-${row.name}`} className="flex justify-between gap-3">
                        <span>{row.name}</span>
                        <span>{formatCount(row.viewConversions)} view-through · {formatCount(row.impressions)} impressions{model.showMoney && row.spend != null ? ` · ${money(row.spend)}` : ""}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-2 text-sm text-muted">None in this range.</p>}
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="overflow-x-auto rounded-xl border border-line bg-card">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="px-3 py-2">Campaign</th>
              <th className="px-3 py-2">View-through</th>
              <th className="px-3 py-2">Click-through</th>
              <th className="px-3 py-2">Per 1K</th>
              {model.showMoney ? <th className="px-3 py-2">Spend</th> : null}
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {model.campaigns.map((row) => (
              <tr key={row.id} className="border-b border-line">
                <td className="px-3 py-2">{row.name}</td>
                <td className="px-3 py-2">{formatCount(row.viewConversions)}</td>
                <td className="px-3 py-2">{formatCount(row.clickConversions)}</td>
                <td className="px-3 py-2">{rate(row.perThousand)}</td>
                {model.showMoney ? <td className="px-3 py-2">{money(row.spend)}</td> : null}
                <td className="px-3 py-2">{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!model.campaigns.length ? <p className="p-4 text-sm text-muted">No connected TV attribution in this range.</p> : null}
      </section>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line border-t-[3px] border-t-brand bg-card p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

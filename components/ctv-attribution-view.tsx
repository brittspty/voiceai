import type { CtvView } from "@/lib/marketing/ctv/report";

function num(value: number | null | undefined, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function pct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${(value * 100).toFixed(1)}%`;
}

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function CtvAttributionView({ view, showMoney }: { view: CtvView; showMoney: boolean }) {
  const segment = view.segments[0];
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {view.exampleData ? <span className="rounded bg-ink px-2 py-1 text-[11px] font-semibold tracking-wide text-on-ink">EXAMPLE DATA</span> : null}
        <span className="rounded border border-line px-2 py-1">{view.platformLabel}</span>
        <span className="text-muted">Verified-human rule: {view.verifiedHumanLabel}</span>
      </div>
      <p className="text-sm text-muted">Unflagged conversions are excluded. No third-party vendor. Recommendations never change a budget.</p>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Exposed households" value={num(view.funnel.exposedHouseholds)} />
        <Tile label="Site visits" value={num(view.funnel.siteVisits)} />
        <Tile label="Leads and conversions" value={num(view.funnel.leadsAndConversions)} />
        <Tile label="Completion rate" value={pct(view.delivery.completionRate)} />
      </section>
      <section className="rounded-xl border border-line bg-card p-4">
        <h2 className="font-semibold">Attribution windows</h2>
        <p className="mt-2 text-sm">{view.windows.label}</p>
        <p className="mt-1 text-sm text-muted">{view.windows.nativeLabel}</p>
        <p className="mt-3 text-sm">{view.sensitivity.note}</p>
        <p className="mt-1 text-sm text-muted">3-day view: {num(view.sensitivity.view3Days)} verified view-through. 7-day view: {num(view.sensitivity.view7Days)} verified view-through.</p>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-line bg-card p-4">
          <h2 className="font-semibold">Time to conversion</h2>
          <ul className="mt-3 grid gap-2 text-sm">
            {view.lag.map((row) => (
              <li key={row.id} className="flex justify-between gap-3">
                <span>{row.label}</span>
                <span>{num(row.count)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-line bg-card p-4">
          <h2 className="font-semibold">CTV assists</h2>
          {view.assists.length ? (
            <ul className="mt-3 grid gap-2 text-sm">
              {view.assists.map((row) => (
                <li key={row.channel} className="flex justify-between gap-3">
                  <span>{view.platformLabel} assisted {row.channel}</span>
                  <span>{num(row.count)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-muted">No assists in this window.</p>}
        </div>
      </section>
      <section className="rounded-xl border border-line bg-card p-4">
        <h2 className="font-semibold">{view.platformLabel}</h2>
        <p className="mt-2 text-sm text-muted">Impressions {num(view.delivery.impressions)}. Unique impressions {num(view.delivery.uniqueImpressions)}. Frequency {num(view.delivery.frequency, 1)}. Completions at 25/50/75/100: {num(view.delivery.completion25)} / {num(view.delivery.completion50)} / {num(view.delivery.completion75)} / {num(view.delivery.completion100)}.</p>
        <p className="mt-1 text-sm text-muted">Reported click-through {num(view.delivery.reportedClickConversions)} and view-through {num(view.delivery.reportedViewConversions)}. Household and IP conversions {num(view.delivery.ipConversions)}. Cross-device {num(view.delivery.cookieConversions)}.</p>
        {showMoney ? <p className="mt-1 text-sm">Spend {money(view.delivery.spend)}. CPM {money(view.delivery.cpm)}. CPA {money(view.delivery.cpa)}. CPL {money(view.delivery.cpl)}. ROAS {num(view.delivery.roas, 2)}.</p> : null}
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <Breakdown title="Device" rows={view.devices} showMoney={showMoney} />
        <Breakdown title="Publisher and app" rows={view.publishers} showMoney={showMoney} />
      </section>
      <section className="overflow-x-auto rounded-xl border border-line bg-card">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="px-3 py-2">MAID list</th>
              <th className="px-3 py-2">Sub-segment</th>
              {showMoney ? <th className="px-3 py-2">Vendor</th> : null}
              <th className="px-3 py-2">Households</th>
              <th className="px-3 py-2">Deterministic match</th>
              <th className="px-3 py-2">Verified click</th>
              <th className="px-3 py-2">Verified view</th>
              <th className="px-3 py-2">Deterministic only</th>
              <th className="px-3 py-2">Lift</th>
              {showMoney ? <th className="px-3 py-2">Cost per incremental verified</th> : null}
              <th className="px-3 py-2">Recommendation</th>
            </tr>
          </thead>
          <tbody>
            {view.segments.map((row) => (
              <tr key={`${row.maidListId}-${row.subSegmentKey}`} className="border-b border-line">
                <td className="px-3 py-2">{row.maidListId || "n/a"}</td>
                <td className="px-3 py-2">{row.subSegmentKey || "n/a"}</td>
                {showMoney ? <td className="px-3 py-2">{row.vendorId || "n/a"}</td> : null}
                <td className="px-3 py-2">{num(row.householdsReached)}</td>
                <td className="px-3 py-2">{pct(row.deterministicMatchRate)}</td>
                <td className="px-3 py-2">{num(row.verifiedClickConversions)}</td>
                <td className="px-3 py-2">{num(row.verifiedViewConversions)}</td>
                <td className="px-3 py-2">{num(row.deterministicClickConversions)} click / {num(row.deterministicViewConversions)} view</td>
                <td className="px-3 py-2">{row.lift == null ? row.liftLabel : `${pct(row.lift)} (${row.liftLabel})`}</td>
                {showMoney ? <td className="px-3 py-2">{money(row.costPerIncrementalVerified) || "n/a"}</td> : null}
                <td className="px-3 py-2">{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!view.segments.length ? <p className="p-4 text-sm text-muted">No CTV rows in this window.</p> : null}
      </section>
      {segment ? <p className="text-sm text-muted">{segment.note}</p> : null}
      {view.warnings.length ? (
        <ul className="grid gap-1 text-sm text-muted">
          {view.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function Breakdown({ title, rows, showMoney }: { title: string; rows: { name: string; impressions: number; spend: number }[]; showMoney: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <h2 className="font-semibold">{title}</h2>
      <ul className="mt-3 grid gap-2 text-sm">
        {rows.map((row) => (
          <li key={row.name} className="flex justify-between gap-3">
            <span>{row.name}</span>
            <span>{num(row.impressions)}{showMoney ? ` · ${money(row.spend)}` : ""}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

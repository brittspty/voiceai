import type { ClientShareView } from "@/lib/marketing/client-view";

export function ClientPerformance({ data }: { data: ClientShareView }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <p className="text-sm text-muted">View only</p>
      <h1 className="mt-1 text-2xl font-semibold text-ink">Results for {data.client}</h1>
      <p className="mt-2 text-sm text-muted">{data.rangeLabel}</p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {data.kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-xl bg-canvas p-3">
            <div className="text-sm text-muted">{kpi.label}</div>
            <b className="block text-xl">{kpi.value}</b>
            {kpi.delta && <div className="text-sm text-muted">{kpi.delta}</div>}
            <p className="mt-1 text-sm text-muted">{kpi.meaning}</p>
          </div>
        ))}
      </div>
      {data.notes?.map((note) => (
        <p key={note} className="mt-4 text-sm text-ink">{note}</p>
      ))}
      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-muted">Your campaigns</h2>
      {data.campaigns.length === 0 && <p className="text-sm text-muted">No results yet for these dates. New campaigns can take a day or two to show numbers.</p>}
      <div className="space-y-3">
        {data.campaigns.map((row) => (
          <article key={row.name} className="rounded-xl border border-line bg-card p-4">
            <b>{row.name}</b> <span className="rounded-md border border-line px-2 py-0.5 text-xs font-bold">{row.status}</span>
            <p className="mt-1 text-sm text-muted">{row.detail}</p>
          </article>
        ))}
      </div>
      <p className="mt-4 text-sm text-muted">
        {data.updated}. Link shared by {data.sharedBy}
        {data.expires ? `, ${data.expires}` : ""}.
      </p>
    </div>
  );
}

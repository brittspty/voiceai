import { brandTokens } from "@/lib/brand/tokens";
import type { ClientViewerResponse } from "@/lib/marketing/client-view";

function percent(value: number | null) {
  if (value === null) return "—";
  return `${(value * 100).toFixed(2)}%`;
}

function count(value: number) {
  return value.toLocaleString("en-US");
}

export function ClientPerformance({ data }: { data: ClientViewerResponse }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <p className="text-sm text-muted">{brandTokens.tagline}</p>
      <h1 className="mt-1 text-2xl font-semibold text-ink">{data.client}</h1>
      <p className="mt-1 text-sm text-muted">How the ads are being seen. This view does not include spend.</p>
      <div className="mt-6 overflow-hidden rounded-xl border border-line bg-card">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              {["Date", "Campaign", "Ad", "Impressions", "Reach", "Clicks", "Click rate", "Conversions", "Leads", "Frequency"].map((header) => (
                <th key={header} className="px-3 py-2 font-medium">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.metrics.map((row) => (
              <tr key={`${row.date}-${row.ad}`} className="border-b border-line last:border-0">
                <td className="px-3 py-2">{row.date}</td>
                <td className="px-3 py-2">{row.campaign}</td>
                <td className="px-3 py-2">{row.ad}</td>
                <td className="px-3 py-2">{count(row.impressions)}</td>
                <td className="px-3 py-2">{count(row.reach)}</td>
                <td className="px-3 py-2">{count(row.clicks)}</td>
                <td className="px-3 py-2">{percent(row.ctr)}</td>
                <td className="px-3 py-2">{count(row.conversions)}</td>
                <td className="px-3 py-2">{count(row.leads)}</td>
                <td className="px-3 py-2">{row.frequency === null ? "—" : row.frequency.toFixed(2)}</td>
              </tr>
            ))}
            {!data.metrics.length && (
              <tr>
                <td className="px-3 py-6 text-muted" colSpan={10}>No performance yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {data.creatives.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 font-medium">Creative previews</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.creatives.map((creative) => (
              <article key={creative.ad} className="rounded-xl border border-line bg-card p-4 text-sm">
                <div className="font-medium">{creative.headline || creative.ad}</div>
                {creative.body && <p className="mt-1 text-muted">{creative.body}</p>}
                {creative.previewUrl && <p className="mt-2 break-all text-xs text-muted">{creative.previewUrl}</p>}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

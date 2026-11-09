import { formatCount } from "@/lib/marketing/dashboard-model";
import { clarityHeatmapsUrl } from "@/lib/marketing/clarity/scope";
import type { ClarityFrustrationView } from "@/lib/marketing/clarity/view";

function scrollLabel(value: number | null) {
  if (value === null) return "—";
  return `${Math.round(value)}%`;
}

/** Frustrated landing pages from Clarity. Traffic behavior only. Spend stays off this card. */
export function ClarityFrustration({ view }: { view: ClarityFrustrationView }) {
  return (
    <section className="mb-4 rounded-[14px] border border-line border-l-4 border-l-brand bg-card p-4 text-ink">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Frustrated landing pages</h2>
        {view.clarityUrl ? (
          <a className="text-sm font-semibold text-brand" href={view.clarityUrl} target="_blank" rel="noreferrer">
            View in Clarity
          </a>
        ) : null}
      </div>
      <p className="mb-3 text-[13px] text-muted">Rage clicks, dead clicks, quick backs, and scroll depth from Microsoft Clarity for this date range.</p>
      {view.pages.length ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-muted">
                <th scope="col" className="border-b border-line px-2 py-2 font-medium">Landing page</th>
                <th scope="col" className="border-b border-line px-2 py-2 font-medium">Sessions</th>
                <th scope="col" className="border-b border-line px-2 py-2 font-medium">Rage clicks</th>
                <th scope="col" className="border-b border-line px-2 py-2 font-medium">Dead clicks</th>
                <th scope="col" className="border-b border-line px-2 py-2 font-medium">Quick backs</th>
                <th scope="col" className="border-b border-line px-2 py-2 font-medium">Scroll depth</th>
                {view.clarityUrl ? null : <th scope="col" className="border-b border-line px-2 py-2 font-medium">Clarity</th>}
              </tr>
            </thead>
            <tbody>
              {view.pages.map((page) => (
                <tr key={`${page.projectId}-${page.url}`}>
                  <td className="max-w-[280px] truncate border-b border-line px-2 py-2 font-semibold">{page.url}</td>
                  <td className="border-b border-line px-2 py-2">{formatCount(page.sessions)}</td>
                  <td className="border-b border-line px-2 py-2">{formatCount(page.rageClicks)}</td>
                  <td className="border-b border-line px-2 py-2">{formatCount(page.deadClicks)}</td>
                  <td className="border-b border-line px-2 py-2">{formatCount(page.quickbacks)}</td>
                  <td className="border-b border-line px-2 py-2">{scrollLabel(page.scrollDepth)}</td>
                  {view.clarityUrl ? null : (
                    <td className="border-b border-line px-2 py-2">
                      {clarityHeatmapsUrl(page.projectId) ? (
                        <a className="font-semibold text-brand" href={clarityHeatmapsUrl(page.projectId)} target="_blank" rel="noreferrer">
                          View in Clarity
                        </a>
                      ) : null}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[13px] text-muted">No frustrated landing pages in this window yet.</p>
      )}
    </section>
  );
}

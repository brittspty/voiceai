import { formatCount } from "@/lib/marketing/dashboard-model";
import type { AnalyticsTrafficView } from "@/lib/marketing/google-analytics/view";

function tiles(view: AnalyticsTrafficView) {
  return [
    { label: "Sessions", value: view.sessions },
    { label: "Engaged sessions", value: view.engagedSessions },
    { label: "Conversions", value: view.conversions },
  ];
}

/** Site traffic beside campaign performance. Traffic only. Spend stays on the campaign table. */
export function AnalyticsTraffic({ view, campaignName = null }: { view: AnalyticsTrafficView; campaignName?: string | null }) {
  const wanted = campaignName?.trim().toLowerCase() || "";
  const rows = wanted ? view.rows.filter((row) => row.campaign.toLowerCase() === wanted) : view.rows;
  const sessions = wanted ? rows.reduce((sum, row) => sum + row.sessions, 0) : view.sessions;
  const engagedSessions = wanted ? rows.reduce((sum, row) => sum + row.engagedSessions, 0) : view.engagedSessions;
  const conversions = wanted ? rows.reduce((sum, row) => sum + row.conversions, 0) : view.conversions;
  const shown = { ...view, sessions, engagedSessions, conversions, rows };
  const pages = wanted
    ? [...rows.reduce((map, row) => {
        if (!row.landingPage || row.landingPage === "Unassigned") return map;
        const current = map.get(row.landingPage) ?? { path: row.landingPage, sessions: 0, engagedSessions: 0, conversions: 0 };
        current.sessions += row.sessions;
        current.engagedSessions += row.engagedSessions;
        current.conversions += row.conversions;
        map.set(row.landingPage, current);
        return map;
      }, new Map<string, AnalyticsTrafficView["landingPages"][number]>()).values()].sort((a, b) => b.sessions - a.sessions).slice(0, 8)
    : view.landingPages;

  return (
    <section className="mb-4 rounded-[14px] border border-line border-l-4 border-l-brand bg-card p-4">
      <h2 className="text-base font-semibold">Site traffic</h2>
      <p className="mb-3 text-[13px] text-muted">Sessions, engaged sessions, and conversions from Google Analytics, by campaign, source, and medium.</p>
      <div className="mb-3 grid grid-cols-3 gap-3">
        {tiles(shown).map((tile) => (
          <article key={tile.label} className="rounded-[14px] border border-line bg-card px-3 py-2">
            <div className="text-xs text-muted">{tile.label}</div>
            <div className="text-xl font-semibold">{formatCount(tile.value)}</div>
          </article>
        ))}
      </div>
      {pages.length ? (
        <div className="mb-3">
          <h3 className="mb-1 text-sm font-semibold">Top landing pages</h3>
          <ul className="grid gap-1 text-[13px]">
            {pages.map((page) => (
              <li key={page.path} className="flex items-baseline justify-between gap-3 border-b border-line py-1">
                <span className="truncate">{page.path}</span>
                <span className="shrink-0 text-muted">{formatCount(page.sessions)} sessions · {formatCount(page.conversions)} conversions</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-muted">
                <th scope="col" className="border-b border-line px-2 py-2 font-medium">Campaign</th>
                <th scope="col" className="border-b border-line px-2 py-2 font-medium">Source</th>
                <th scope="col" className="border-b border-line px-2 py-2 font-medium">Medium</th>
                <th scope="col" className="border-b border-line px-2 py-2 font-medium">Landing page</th>
                <th scope="col" className="border-b border-line px-2 py-2 font-medium">Sessions</th>
                <th scope="col" className="border-b border-line px-2 py-2 font-medium">Engaged</th>
                <th scope="col" className="border-b border-line px-2 py-2 font-medium">Conversions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.campaign}-${row.source}-${row.medium}-${row.landingPage}`}>
                  <td className="border-b border-line px-2 py-2 font-semibold">{row.campaign}</td>
                  <td className="border-b border-line px-2 py-2">{row.source}</td>
                  <td className="border-b border-line px-2 py-2">{row.medium}</td>
                  <td className="max-w-[240px] truncate border-b border-line px-2 py-2">{row.landingPage}</td>
                  <td className="border-b border-line px-2 py-2">{formatCount(row.sessions)}</td>
                  <td className="border-b border-line px-2 py-2">{formatCount(row.engagedSessions)}</td>
                  <td className="border-b border-line px-2 py-2">{formatCount(row.conversions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[13px] text-muted">{wanted ? "No site traffic for this campaign in this window." : "No site traffic in this window yet."}</p>
      )}
    </section>
  );
}

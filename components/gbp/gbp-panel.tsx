import type { GbpClientView } from "@/lib/marketing/gbp-view";

function tone(status: string) {
  if (status === "pass") return "bg-success-soft text-success";
  if (status === "warn") return "bg-warning-soft text-warning";
  return "bg-danger-soft text-danger";
}

function label(status: string) {
  if (status === "pass") return "Pass";
  if (status === "warn") return "Warn";
  return "Fail";
}

export function GbpPanel({ view }: { view: GbpClientView }) {
  const tiles = [
    ["Calls", view.calls],
    ["Direction requests", view.directionRequests],
    ["Website clicks", view.websiteClicks],
    ["Bookings", view.bookings],
    ["Search impressions", view.searchImpressions],
    ["Maps impressions", view.mapsImpressions],
  ] as const;
  return (
    <section className="mb-6" aria-labelledby="gbp-heading">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Google Business Profile</p>
          <h2 id="gbp-heading" className="text-2xl font-semibold text-ink">{view.locationTitle || view.clientName}</h2>
          <p className="text-sm text-muted">{view.clientName} · {view.periodLabel} · Read only</p>
        </div>
        {view.exampleData ? <span className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-on-brand">EXAMPLE DATA</span> : null}
      </div>
      {view.empty ? (
        <p className="rounded-xl border border-line bg-card p-4 text-sm">No location is assigned to this client yet. A person on the team maps it from Add a channel.</p>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
            {tiles.map(([name, value]) => (
              <article key={name} className="rounded-xl border border-line border-l-4 border-l-brand bg-card px-4 py-3">
                <div className="text-xs text-muted">{name}</div>
                <div className="mt-1 text-2xl font-semibold">{value.toLocaleString("en-US")}</div>
              </article>
            ))}
          </div>
          <p className="mb-4 text-sm text-muted">
            Search is {view.searchDesktop.toLocaleString("en-US")} on desktop and {view.searchMobile.toLocaleString("en-US")} on mobile.
            Maps is {view.mapsDesktop.toLocaleString("en-US")} on desktop and {view.mapsMobile.toLocaleString("en-US")} on mobile.
          </p>
          <div className="mb-4 grid gap-4 lg:grid-cols-[220px_1fr]">
            <article className="rounded-xl border border-line bg-card p-4">
              <div className="text-xs text-muted">Audit score</div>
              <div className="mt-1 text-5xl font-semibold text-ink">{view.score}</div>
              <p className="text-sm text-muted">out of 100</p>
              <p className="mt-3 text-sm">Rating {view.rating == null ? "—" : view.rating.toFixed(1)} · {view.reviewCount} reviews · {view.newReviews} new in 30 days</p>
              <p className="text-sm text-muted">{view.responseLabel}</p>
            </article>
            <article className="rounded-xl border border-line bg-card p-4">
              <h3 className="mb-2 text-base font-semibold">Checks</h3>
              <ul className="grid gap-2">
                {view.checks.map((check) => (
                  <li key={check.id} className="rounded-lg border border-line px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone(check.status)}`}>{label(check.status)}</span>
                      <b className="text-sm">{check.label}</b>
                      <span className="text-xs text-muted">{check.earned} of {check.weight}</span>
                    </div>
                    <p className="mt-1 text-sm">{check.detail}</p>
                    <p className="text-sm text-muted">{check.fix}</p>
                  </li>
                ))}
              </ul>
            </article>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-xl border border-line bg-card p-4">
              <h3 className="mb-2 text-base font-semibold">Search keywords this month</h3>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-muted">
                    <th className="py-1 font-medium">Keyword</th>
                    <th className="py-1 font-medium">Impressions</th>
                  </tr>
                </thead>
                <tbody>
                  {view.keywords.map((row) => (
                    <tr key={row.keyword} className="border-t border-line">
                      <td className="py-2">{row.keyword}</td>
                      <td className="py-2">{row.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
            <article className="rounded-xl border border-line bg-card p-4">
              <h3 className="mb-2 text-base font-semibold">Reviews</h3>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-muted">
                    <th className="py-1 font-medium">Date</th>
                    <th className="py-1 font-medium">Stars</th>
                    <th className="py-1 font-medium">Reply</th>
                    <th className="py-1 font-medium">Reply date</th>
                  </tr>
                </thead>
                <tbody>
                  {view.reviews.map((row) => (
                    <tr key={`${row.date}-${row.stars}-${row.replyDate}`} className="border-t border-line">
                      <td className="py-2">{row.date}</td>
                      <td className="py-2">{row.stars}</td>
                      <td className="py-2">{row.replied}</td>
                      <td className="py-2">{row.replyDate || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          </div>
        </>
      )}
    </section>
  );
}

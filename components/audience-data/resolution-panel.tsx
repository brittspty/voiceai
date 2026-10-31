import type { PresentedResolution } from "@/lib/marketing/audience-data/resolution";

export function ResolutionPanel({ resolution }: { resolution: PresentedResolution }) {
  const peak = Math.max(...resolution.trend.map((row) => row.matched + row.unmatched), 1);
  return (
    <section className="ad-grp" aria-labelledby="resolution-heading">
      <div className="top" style={{ border: 0, marginBottom: 8, paddingBottom: 0 }}>
        <h2 id="resolution-heading">Identity resolution</h2>
        <span className="ex">EXAMPLE DATA</span>
      </div>
      <p className="ad-prov">Counts only. Raw identifiers are not stored on this screen. Nothing is sent to a platform.</p>
      <div className="ad-res-tiles">
        <article>
          <span>Records uploaded</span>
          <b className="ad-mono">{resolution.uploadedLabel}</b>
        </article>
        {resolution.parts.map((part) => (
          <article key={part.kind}>
            <span>{part.label}</span>
            <b className="ad-mono">{part.countLabel}</b>
          </article>
        ))}
      </div>
      <h3>Match rate by platform</h3>
      <table className="ad-table">
        <thead>
          <tr>
            <th scope="col">Platform</th>
            <th scope="col">Resolution rate</th>
            <th scope="col">Matched</th>
            <th scope="col">Unmatched</th>
          </tr>
        </thead>
        <tbody>
          {resolution.platforms.map((platform) => (
            <tr key={platform.id}>
              <th scope="row">{platform.label}</th>
              <td className="ad-mono">{platform.rateLabel}</td>
              <td className="ad-mono">{platform.matchedLabel}</td>
              <td className="ad-mono">{platform.unmatchedLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ad-cards">
        {resolution.platforms.map((platform) => (
          <article key={platform.id} className="ad-card">
            <h3>{platform.label}</h3>
            <dl>
              <dt>Resolution rate</dt><dd>{platform.rateLabel}</dd>
              <dt>Matched</dt><dd>{platform.matchedLabel}</dd>
              <dt>Unmatched</dt><dd>{platform.unmatchedLabel}</dd>
            </dl>
          </article>
        ))}
      </div>
      <div className="ad-res-split">
        <div>
          <h3>By identifier type</h3>
          <table className="ad-table">
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Resolved</th>
                <th scope="col">Matched</th>
                <th scope="col">Unmatched</th>
              </tr>
            </thead>
            <tbody>
              {resolution.byIdentifier.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td className="ad-mono">{row.rateLabel}</td>
                  <td className="ad-mono">{row.matchedLabel}</td>
                  <td className="ad-mono">{row.unmatchedLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h3>By source</h3>
          <table className="ad-table">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Resolved</th>
                <th scope="col">Matched</th>
                <th scope="col">Unmatched</th>
              </tr>
            </thead>
            <tbody>
              {resolution.bySource.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td className="ad-mono">{row.rateLabel}</td>
                  <td className="ad-mono">{row.matchedLabel}</td>
                  <td className="ad-mono">{row.unmatchedLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <h3>Trend</h3>
      <ol className="ad-trend">
        {resolution.trend.map((row) => (
          <li key={row.label}>
            <span>{row.label}</span>
            <span className="ad-trend-bar" aria-hidden="true">
              <i style={{ width: `${Math.round((row.matched / peak) * 100)}%` }} />
            </span>
            <span className="ad-mono">{formatPair(row.matched, row.unmatched)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function formatPair(matched: number, unmatched: number) {
  return `${compact(matched)} matched · ${compact(unmatched)} unmatched`;
}

function compact(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

"use client";

import Link from "next/link";
import { useState } from "react";
import type { ResolutionReport, ResolutionWindow } from "@/lib/marketing/audience-data/resolution";

function formatCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

function rateBand(percent: number) {
  if (percent < 30) return { word: "Low — on hold", hold: true };
  if (percent < 50) return { word: "Fair", hold: false };
  return { word: "Good", hold: false };
}

function RateBar({ percent, hold }: { percent: number; hold: boolean }) {
  const band = rateBand(percent);
  return (
    <span className="ad-rate">
      <span className={`ad-rate-fill${hold ? " hold" : ""}`} style={{ width: `${Math.max(4, Math.min(100, percent))}%` }} />
      <span className="ad-mono">{percent}% matched</span>
      <span> · {band.word}</span>
      {hold ? <span className="ad-hold"> On hold: low match rate</span> : null}
    </span>
  );
}

export function ResolutionScreen({
  report,
  mode,
  accountName = "",
  crumb,
  tabs,
}: {
  report: ResolutionReport;
  mode: "staff" | "client";
  accountName?: string;
  crumb: { href?: string; label: string }[];
  tabs?: { id: string; current: "selections" | "resolution" };
}) {
  const [windowDays, setWindowDays] = useState<ResolutionWindow>(30);
  const [worked, setWorked] = useState(false);
  const [notice, setNotice] = useState("");
  const window = report.windows[windowDays];
  const holds = report.platforms.filter((row) => rateBand(row.percent).hold).length;
  const matchedPct = Math.round((report.matchedAny / report.uploaded) * 100);
  const unmatchedPct = 100 - matchedPct;
  return (
    <main>
      <nav className="crumb" aria-label="Breadcrumb">
        {crumb.map((item, index) => (
          <span key={`${item.label}-${index}`}>
            {index > 0 ? " › " : null}
            {item.href && index < crumb.length - 1 ? <Link href={item.href}>{item.label}</Link> : <b aria-current="page">{item.label}</b>}
          </span>
        ))}
      </nav>
      <div className="top">
        <h1>{report.title}</h1>
        <span className="ex">EXAMPLE DATA</span>
      </div>
      {tabs ? <SourceTabs id={tabs.id} current={tabs.current} /> : null}
      <div className="ad-bar">
        <label htmlFor="res-audience">Audience</label>
        <select id="res-audience" defaultValue="implant">
          <option value="implant">{report.audienceName}</option>
          <option value="all">All audiences</option>
        </select>
        <label htmlFor="res-segment">Segment</label>
        <select id="res-segment" defaultValue="all">
          <option value="all">All segments (3)</option>
          <option value="recency">Sub-segment: 30-day recency</option>
        </select>
        <label htmlFor="res-campaign">Campaign</label>
        <select id="res-campaign" defaultValue="all">
          <option value="all">All campaigns</option>
        </select>
      </div>
      <p className="ad-prov">{report.updated} · {report.definition}</p>
      <div className="ad-res-tiles">
        <article>
          <span>Records uploaded</span>
          <b className="ad-mono">{formatCount(report.uploaded)}</b>
          <span className="ad-prov">{report.parts.map((part) => `${part.short} ${formatCount(part.uploaded)}`).join(" · ")}</span>
        </article>
        <article>
          <span>Matched (any platform)</span>
          <b className="ad-mono">{formatCount(report.matchedAny)}</b>
          <span className="ad-prov">{matchedPct}% of uploaded · {rateBand(matchedPct).word}</span>
        </article>
        <article>
          <span>Unmatched</span>
          <b className="ad-mono">{formatCount(report.unmatched)}</b>
          <span className="ad-prov">{unmatchedPct}% of uploaded</span>
        </article>
        <article>
          <span>Platforms on hold</span>
          <b className="ad-mono">{holds} of {report.platforms.length}</b>
          <span className="ad-prov">Under 30% match rate</span>
        </article>
      </div>
      {holds > 0 ? (
        <div className="ad-why">
          <b>Why this?</b> {report.why} <b>Recommendation only:</b> {report.recommendation}{" "}
          <button type="button" className="ad-btn" onClick={() => setWorked((value) => !value)}>How this was worked out</button>
          {worked ? <ol>{report.workedOut.map((line) => <li key={line}>{line}</li>)}</ol> : null}
        </div>
      ) : null}
      <section className="ad-grp" aria-labelledby="platforms">
        <h2 id="platforms">Match rate by platform</h2>
        <p className="ad-prov">Match rate by platform. Under 30% puts the audience on hold on that platform.</p>
        <table className="ad-table">
          <thead>
            <tr>
              <th scope="col">Platform</th>
              <th scope="col">Records sent</th>
              <th scope="col">Matched</th>
              <th scope="col">Unmatched</th>
              <th scope="col">Match rate</th>
            </tr>
          </thead>
          <tbody>
            {report.platforms.map((row) => (
              <tr key={row.id}>
                <th scope="row">{row.label}{row.placeholder ? " · placeholder" : ""}</th>
                <td className="ad-mono">{formatCount(row.sent)}</td>
                <td className="ad-mono">{formatCount(row.matched)}</td>
                <td className="ad-mono">{formatCount(row.unmatched)}</td>
                <td><RateBar percent={row.percent} hold={rateBand(row.percent).hold} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ad-cards">
          {report.platforms.map((row) => (
            <article key={row.id} className="ad-card">
              <h3>{row.label}{row.placeholder ? " · placeholder" : ""}</h3>
              <dl>
                <dt>Records sent</dt><dd>{formatCount(row.sent)}</dd>
                <dt>Matched</dt><dd>{formatCount(row.matched)}</dd>
                <dt>Unmatched</dt><dd>{formatCount(row.unmatched)}</dd>
              </dl>
              <RateBar percent={row.percent} hold={rateBand(row.percent).hold} />
            </article>
          ))}
        </div>
        {report.moreChannels?.length ? (
          <div>
            <p>More channels <span className="ad-mono">+{report.moreChannels.length} more</span></p>
            {report.moreChannels.map((row) => (
              <p key={row.id}>
                {row.label}
                {row.percent == null ? "" : ` · ${row.percent}%`}
                {` · ${row.status}`}
                {row.placeholder ? " · placeholder" : ""}
                {row.percent != null && rateBand(row.percent).hold ? <span className="ad-hold"> On hold: low match rate</span> : null}
              </p>
            ))}
          </div>
        ) : null}
      </section>
      <div className="ad-res-split">
        <section className="ad-grp" aria-labelledby="by-id">
          <h2 id="by-id">By identifier type</h2>
          <table className="ad-table">
            <thead>
              <tr>
                <th scope="col">Identifier</th>
                <th scope="col">Uploaded</th>
                <th scope="col">Matched</th>
                <th scope="col">Unmatched</th>
                <th scope="col">Match rate</th>
              </tr>
            </thead>
            <tbody>
              {report.parts.map((row) => (
                <tr key={row.id}>
                  <th scope="row">{row.label}</th>
                  <td className="ad-mono">{formatCount(row.uploaded)}</td>
                  <td className="ad-mono">{formatCount(row.matched)}</td>
                  <td className="ad-mono">{formatCount(row.unmatched)}</td>
                  <td><RateBar percent={row.percent} hold={rateBand(row.percent).hold} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="ad-cards">
            {report.parts.map((row) => (
              <article key={row.id} className="ad-card">
                <h3>{row.label}</h3>
                <dl>
                  <dt>Uploaded</dt><dd>{formatCount(row.uploaded)}</dd>
                  <dt>Matched</dt><dd>{formatCount(row.matched)}</dd>
                  <dt>Unmatched</dt><dd>{formatCount(row.unmatched)}</dd>
                </dl>
                <RateBar percent={row.percent} hold={rateBand(row.percent).hold} />
              </article>
            ))}
          </div>
        </section>
        <section className="ad-grp" aria-labelledby="by-source">
          <h2 id="by-source">{mode === "client" ? "By data source type" : "By data source"}</h2>
          <table className="ad-table">
            <thead>
              <tr>
                <th scope="col">{mode === "client" ? "Source type" : "Data source"}</th>
                <th scope="col">Category</th>
                <th scope="col">Uploaded</th>
                <th scope="col">Matched</th>
                <th scope="col">Match rate</th>
              </tr>
            </thead>
            <tbody>
              {report.bySource.map((row) => (
                <tr key={row.id}>
                  <th scope="row">{row.label}</th>
                  <td>{row.category}</td>
                  <td className="ad-mono">{formatCount(row.sent)}</td>
                  <td className="ad-mono">{formatCount(row.matched)}</td>
                  <td><RateBar percent={row.percent} hold={rateBand(row.percent).hold} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="ad-cards">
            {report.bySource.map((row) => (
              <article key={row.id} className="ad-card">
                <h3>{row.label}</h3>
                <dl>
                  <dt>{mode === "client" ? "Source type" : "Data source"}</dt><dd>{row.category}</dd>
                  <dt>Uploaded</dt><dd>{formatCount(row.sent)}</dd>
                  <dt>Matched</dt><dd>{formatCount(row.matched)}</dd>
                </dl>
                <RateBar percent={row.percent} hold={rateBand(row.percent).hold} />
              </article>
            ))}
          </div>
        </section>
      </div>
      <section className="ad-grp" aria-labelledby="trend">
        <div className="top" style={{ border: 0, margin: 0, padding: 0 }}>
          <h2 id="trend">Match rate over time</h2>
          <div role="group" aria-label="Trend window">
            {([30, 60, 90] as ResolutionWindow[]).map((days) => (
              <button key={days} type="button" className="ad-btn" aria-pressed={windowDays === days} onClick={() => setWindowDays(days)}>{days} days</button>
            ))}
          </div>
        </div>
        <p className="ad-chart" aria-hidden="true">
          {window.points.map((point) => (
            <span key={point.label}><b>{point.percent}%</b><i style={{ height: `${point.percent}%` }} /></span>
          ))}
        </p>
        <p>Overall match rate went from {window.from}% to {window.to}% in {windowDays} days. Same data as a table:</p>
        <table className="ad-table">
          <caption className="ad-prov">Overall match rate by week, last {windowDays} days</caption>
          <thead>
            <tr>
              <th scope="col">Period</th>
              {window.points.map((point) => <th key={point.label} scope="col">{point.label}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Match rate</th>
              {window.points.map((point) => <td key={point.label} className="ad-mono">{point.percent}%</td>)}
            </tr>
          </tbody>
        </table>
      </section>
      <section aria-label="States">
        <h2>States</h2>
        <div className="ad-state" role="status"><h3>Loading</h3>Loading resolution data… (cards and table headers stay, values show as grey bars)</div>
        <div className="ad-state">
          <h3>No resolution data yet</h3>
          Match rates appear after the audience is synced to a platform, usually within 24 hours.
          {mode === "staff" ? <> <Link className="ad-btn p" href="/marketing/audiences">Open Audience Library</Link></> : null}
        </div>
        <div className="ad-state" role="alert">
          <h3>Couldn&apos;t load resolution data</h3>
          A platform didn&apos;t respond. Numbers below are from the last sync 6h ago.{" "}
          <button type="button" className="ad-btn" onClick={() => setNotice("Still the last example sync. Nothing was requested.")}>Try again</button>
        </div>
        {notice ? <p className="ad-prov" role="status">{notice}</p> : null}
      </section>
      <p className="ad-prov">{mode === "client" ? `Jarvis by Specificity · ${accountName || report.accountName} workspace · All figures are EXAMPLE DATA` : "Jarvis by Specificity · All figures are EXAMPLE DATA · Vendor names are placeholders"}</p>
    </main>
  );
}

export function SourceTabs({ id, current }: { id: string; current: "selections" | "resolution" }) {
  return (
    <div className="ad-tabs" role="tablist" aria-label="Audience data source">
      <Link href={`/audience-data/${id}`} aria-current={current === "selections" ? "page" : undefined}>Selections</Link>
      <Link href={`/audience-data/${id}/resolution`} aria-current={current === "resolution" ? "page" : undefined}>Resolution Data</Link>
    </div>
  );
}

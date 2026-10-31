"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { listAudienceSources, type PresentedDetail, type PresentedMatch, type PresentedRow, type SortKey } from "@/lib/marketing/audience-data/present";
import "./audience-data.css";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "vendor", label: "Data source" },
  { key: "type", label: "Type" },
  { key: "campaigns", label: "Campaigns" },
  { key: "audiences", label: "Audiences" },
  { key: "maids", label: "MAIDs" },
  { key: "match", label: "Match rate" },
  { key: "refreshed", label: "Last refresh" },
  { key: "leads", label: "Leads" },
  { key: "quality", label: "Lead quality" },
  { key: "decisions", label: "Decisions" },
];

function MatchRates({ match }: { match: PresentedMatch[] }) {
  return (
    <div>
      {match.map((row) => (
        <div key={row.platform}>
          <abbr title={row.full} aria-label={`${row.full} ${row.percent} percent`}>
            {row.short}
          </abbr>{" "}
          <span className="ad-mono">{row.percent}%</span>
          {row.hold ? <span className="ad-hold"> On hold: low match rate</span> : null}
        </div>
      ))}
    </div>
  );
}

function DecisionChips({ decisions }: { decisions: PresentedRow["decisions"] }) {
  return (
    <div>
      <span className="ad-chip sc">Scale {decisions.scale}</span>
      <span className="ad-chip sl">Still learning {decisions.learning}</span>
      <span className="ad-chip cu">Cut {decisions.cut}</span>
    </div>
  );
}

function States({ notice }: { notice: string }) {
  return (
    <section aria-label="States">
      <h2 style={{ fontSize: 16, marginTop: 24 }}>States</h2>
      <div className="ad-state" role="status">
        <h3>Loading</h3>
        Loading data sources… (skeleton rows, table header stays visible)
      </div>
      <div className="ad-state">
        <h3>No data sources yet</h3>
        This campaign has no data-market audiences.{" "}
        <button type="button" className="ad-btn p">Build an audience in the data market</button>
      </div>
      <div className="ad-state" role="alert">
        <h3>Couldn&apos;t load data sources</h3>
        The data market didn&apos;t respond. Your audiences are unchanged.{" "}
        <button type="button" className="ad-btn" onClick={() => undefined}>Try again</button>
      </div>
      <div className="ad-state">
        <h3>No matches</h3>
        {notice || "No source matches a search that is not in the example."}{" "}
        <span className="ad-prov">These buttons do not call the data market.</span>
      </div>
      <p className="ad-prov" style={{ marginTop: 20 }}>Jarvis by Specificity · All figures are EXAMPLE DATA · Vendor names are placeholders</p>
    </section>
  );
}

export function AudienceDataList() {
  const [campaignId, setCampaignId] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("leads");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const model = useMemo(
    () => listAudienceSources({ reader: "staff", campaignId, search, sort, direction }),
    [campaignId, search, sort, direction],
  );
  const empty = model.rows.length === 0;
  const toggle = (key: SortKey) => {
    if (sort === key) setDirection((value) => (value === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDirection(key === "vendor" || key === "type" ? "asc" : "desc");
    }
  };
  return (
    <main>
      <nav className="crumb" aria-label="Breadcrumb">
        <b aria-current="page">Audience Data</b>
      </nav>
      <div className="top">
        <h1>Every data source behind your audiences</h1>
        <span className="ex">EXAMPLE DATA</span>
      </div>
      <p>All audiences are MAID audiences built in the data market. Pick a source to see every selection used to build it. Recommendations only. Nothing here changes a campaign amount.</p>
      <div className="ad-bar">
        <label htmlFor="ad-campaign">Campaign</label>
        <select id="ad-campaign" value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>
          <option value="all">All campaigns</option>
          {model.campaigns.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
          ))}
        </select>
        <label htmlFor="ad-search">Search</label>
        <input id="ad-search" type="search" placeholder="Vendor or source type" value={search} onChange={(event) => setSearch(event.target.value)} />
        <label htmlFor="ad-sort">Sort</label>
        <select
          id="ad-sort"
          value={sort}
          onChange={(event) => {
            setSort(event.target.value as SortKey);
            setDirection("desc");
          }}
        >
          <option value="leads">Leads, high to low</option>
          <option value="quality">Lead quality</option>
          <option value="match">Match rate</option>
          <option value="refreshed">Last refresh</option>
        </select>
      </div>
      <p className="ad-prov">{model.summary} · Lead quality 0–100 is provisional until CRM outcomes arrive · Match rate under 30% puts that platform on hold</p>
      {empty ? (
        <div className="ad-state">
          <h3>No matches</h3>
          No source matches “{search || "that campaign"}”.{" "}
          <button type="button" className="ad-btn" onClick={() => { setSearch(""); setCampaignId("all"); }}>Clear search</button>
        </div>
      ) : (
        <>
          <table className="ad-table">
            <caption className="ad-prov" style={{ textAlign: "left" }}>Data sources, sortable by any column</caption>
            <thead>
              <tr>
                {SORTS.map((column) => (
                  <th key={column.key} scope="col" aria-sort={sort === column.key ? (direction === "asc" ? "ascending" : "descending") : "none"}>
                    <button type="button" onClick={() => toggle(column.key)}>{column.label} ↕</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.rows.map((row) => (
                <tr key={row.id}>
                  <td><Link className="ad-src" href={`/audience-data/${row.id}`}>{row.vendor}</Link></td>
                  <td>{row.type}</td>
                  <td className="ad-mono">{row.campaigns}</td>
                  <td className="ad-mono">{row.audiences}</td>
                  <td className="ad-mono">{row.maidsLabel}</td>
                  <td><MatchRates match={row.match} /></td>
                  <td>{row.refreshed}</td>
                  <td className="ad-mono">{row.leads}</td>
                  <td>{row.leadQuality === null ? <>— <span className="ad-prov">no CRM outcome yet</span></> : <><span className="ad-mono">{row.leadQuality}</span>{row.provisional ? <span className="ad-prov"> provisional</span> : null}</>}</td>
                  <td><DecisionChips decisions={row.decisions} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="ad-cards">
            {model.rows.map((row) => (
              <article key={row.id} className="ad-card">
                <h3><Link className="ad-src" href={`/audience-data/${row.id}`}>{row.vendor} ›</Link></h3>
                <div className="ad-prov">{row.type} · refreshed {row.refreshed}</div>
                <dl>
                  <dt>Campaigns</dt><dd>{row.campaigns}</dd>
                  <dt>Audiences</dt><dd>{row.audiences}</dd>
                  <dt>MAIDs</dt><dd>{row.maidsLabel}</dd>
                  <dt>Leads</dt><dd>{row.leads}</dd>
                  <dt>Lead quality</dt><dd>{row.qualityLabel}</dd>
                </dl>
                <MatchRates match={row.match} />
                <div style={{ marginTop: 6 }}><DecisionChips decisions={row.decisions} /></div>
              </article>
            ))}
          </div>
        </>
      )}
      <States notice={empty ? `No source matches “${search}”.` : ""} />
    </main>
  );
}

export function AudienceDataSource({ detail }: { detail: PresentedDetail }) {
  const [worked, setWorked] = useState(false);
  const [notice, setNotice] = useState("");
  const cost = detail.dataCostCpm;
  return (
    <main>
      <nav className="crumb" aria-label="Breadcrumb">
        <Link href="/audience-data">Audience Data</Link> › <b aria-current="page">{detail.vendor}</b>
      </nav>
      <div className="top">
        <h1>{detail.vendor} · {detail.type}</h1>
        <span className="ex">EXAMPLE DATA</span>
      </div>
      <div className="ad-bar">
        <label htmlFor="ad-audience">Audience</label>
        <select id="ad-audience" defaultValue={detail.audienceId}>
          <option value={detail.audienceId}>{detail.audienceName} · {detail.maidsLabel} MAIDs</option>
        </select>
        <label htmlFor="ad-source-campaign">Campaign</label>
        <select id="ad-source-campaign" defaultValue="all">
          <option value="all">All campaigns ({detail.campaigns})</option>
        </select>
      </div>
      <div className="ad-lin" aria-label="Lineage">
        <Link href={`/audience-data/${detail.id}`}>{detail.vendor}</Link>
        <b>›</b>
        <a href="#selections">{detail.selectionCount} selections</a>
        <b>›</b>
        <a href="#audience">Audience: {detail.audienceName} · {detail.maidsLabel}</a>
        <b>›</b>
        <a href="#campaigns">{detail.campaigns} campaigns</a>
        <b>›</b>
        <a href="#leads">{detail.leads} leads</a>
      </div>
      <p className="ad-prov" id="audience">
        Match rate: {detail.match.map((row) => `${row.full} ${row.percent}%`).join(" · ")} · Refreshed {detail.refreshed}
        {cost != null ? <> · <span className="ad-prov">Staff only:</span> data cost ${cost.toFixed(2)} CPM</> : null}
      </p>
      <div className="ad-why" id="campaigns">
        <b>Why this?</b> {detail.why} <b>Recommendation only:</b> {detail.recommendation}{" "}
        <button type="button" className="ad-btn" onClick={() => setWorked((value) => !value)}>How this was worked out</button>
        {worked ? (
          <ol>
            {detail.workedOut.map((line) => <li key={line}>{line}</li>)}
          </ol>
        ) : null}
      </div>
      <p className="ad-prov" id="leads">Logic reads top to bottom: OR selections widen the pool, AND selections narrow it, Exclude removes devices. “Not measurable alone” means the selection only filters and has no leads of its own.</p>
      <div id="selections">
        {detail.groups.map((group) => (
          <section key={group.id} className="ad-grp" aria-labelledby={`g-${group.id}`}>
            <h2 id={`g-${group.id}`}>{group.title} · {group.count}</h2>
            <table className="ad-table">
              <thead>
                <tr>
                  <th scope="col">Selection</th>
                  <th scope="col">Logic</th>
                  <th scope="col">MAIDs added / removed</th>
                  <th scope="col">Leads</th>
                  <th scope="col">Lead quality</th>
                </tr>
              </thead>
              <tbody>
                {group.selections.map((row) => (
                  <tr key={row.id}>
                    <th scope="row" style={{ fontWeight: 600, border: 0, whiteSpace: "normal" }}>{row.value}</th>
                    <td>{row.logic}</td>
                    <td className="ad-mono">{row.maidsLabel}</td>
                    <td className="ad-mono">{row.leadsLabel}</td>
                    <td>{row.measurable && row.qualityLabel !== "Not measurable alone" ? <><span className="ad-mono">{row.qualityLabel.replace(" provisional", "")}</span>{row.qualityLabel.includes("provisional") ? <span className="ad-prov"> provisional</span> : null}</> : <span className="ad-prov">{row.qualityLabel}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ad-cards">
              {group.selections.map((row) => (
                <article key={row.id} className="ad-card">
                  <h3>{row.value}</h3>
                  <dl>
                    <dt>Logic</dt><dd>{row.logic}</dd>
                    <dt>MAIDs added / removed</dt><dd>{row.maidsLabel}</dd>
                    <dt>Leads</dt><dd>{row.leadsLabel}</dd>
                    <dt>Lead quality</dt><dd>{row.qualityLabel}</dd>
                  </dl>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
      <section aria-label="States">
        <h2 style={{ fontSize: 16, marginTop: 20 }}>States</h2>
        <div className="ad-state" role="status"><h3>Loading</h3>Loading selections from the data market…</div>
        <div className="ad-state">
          <h3>No selections recorded</h3>
          This audience was imported without its build recipe.{" "}
          <button type="button" className="ad-btn" onClick={() => setNotice("Re-sync stays a request. Nothing was sent.")}>Ask the data team to re-sync</button>
        </div>
        <div className="ad-state" role="alert">
          <h3>Couldn&apos;t load this source</h3>
          Performance numbers are unavailable; selections shown are from the last sync.{" "}
          <button type="button" className="ad-btn" onClick={() => setNotice("Still the last example sync. Nothing was requested.")}>Try again</button>
        </div>
        {notice ? <p className="ad-prov" role="status">{notice}</p> : null}
        <p className="ad-prov" style={{ marginTop: 20 }}>Jarvis by Specificity · All figures are EXAMPLE DATA · Vendor names are placeholders</p>
      </section>
    </main>
  );
}

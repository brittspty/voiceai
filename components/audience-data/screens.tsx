"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { PresentedDetail, PresentedMatch, PresentedRow, SortKey } from "@/lib/marketing/audience-data/present";
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

function DecisionChips({ decisions }: { decisions: NonNullable<PresentedRow["decisions"]> }) {
  return (
    <div>
      <span className="ad-chip sc">Scale {decisions.scale}</span>
      <span className="ad-chip sl">Still learning {decisions.learning}</span>
      <span className="ad-chip cu">Cut {decisions.cut}</span>
    </div>
  );
}

function States({ notice, mode, accountName }: { notice: string; mode: "staff" | "client"; accountName: string }) {
  return (
    <section aria-label="States">
      <h2 style={{ fontSize: 16, marginTop: 24 }}>States</h2>
      <div className="ad-state" role="status">
        <h3>Loading</h3>
        {mode === "client" ? "Loading your data sources…" : "Loading data sources… (skeleton rows, table header stays visible)"}
      </div>
      <div className="ad-state">
        <h3>No data sources yet</h3>
        {mode === "client" ? "Your team at Specificity is still building audiences for this campaign." : <>This campaign has no data-market audiences. <button type="button" className="ad-btn p">Build an audience in the data market</button></>}
      </div>
      <div className="ad-state" role="alert">
        <h3>Couldn&apos;t load data sources</h3>
        {mode === "client" ? "Your audiences are unchanged. " : "The data market didn't respond. Your audiences are unchanged. "}
        <button type="button" className="ad-btn">Try again</button>
      </div>
      {mode === "staff" ? (
        <div className="ad-state">
          <h3>No matches</h3>
          {notice || "No source matches a search that is not in the example."}{" "}
          <span className="ad-prov">These buttons do not call the data market.</span>
        </div>
      ) : null}
      <p className="ad-prov" style={{ marginTop: 20 }}>{mode === "client" ? `Jarvis by Specificity · ${accountName} workspace · All figures are EXAMPLE DATA` : "Jarvis by Specificity · All figures are EXAMPLE DATA · Vendor names are placeholders"}</p>
    </section>
  );
}

export function AudienceDataList({
  mode,
  rows,
  campaigns,
  accountName = "",
}: {
  mode: "staff" | "client";
  rows: PresentedRow[];
  campaigns: { id: string; name: string }[];
  accountName?: string;
}) {
  const [campaignId, setCampaignId] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("leads");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const model = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (campaignId !== "all" && !row.campaignIds.includes(campaignId)) return false;
      if (!query) return true;
      const name = (row.label || row.vendor || "").toLowerCase();
      return name.includes(query) || row.type.toLowerCase().includes(query);
    });
    const sign = direction === "asc" ? 1 : -1;
    const sorted = [...filtered].sort((a, b) => {
      const name = (row: PresentedRow) => row.label || row.vendor || "";
      if (sort === "vendor") return name(a).localeCompare(name(b)) * sign;
      if (sort === "type") return a.type.localeCompare(b.type) * sign;
      if (sort === "quality") return ((a.leadQuality ?? -1) - (b.leadQuality ?? -1)) * sign;
      if (sort === "match") return (Math.min(...a.match.map((item) => item.percent)) - Math.min(...b.match.map((item) => item.percent))) * sign;
      if (sort === "campaigns") return (a.campaigns - b.campaigns) * sign;
      if (sort === "audiences") return (a.audiences - b.audiences) * sign;
      if (sort === "maids") return (a.maids - b.maids) * sign;
      return (a.leads - b.leads) * sign;
    });
    const audiences = sorted.reduce((sum, row) => sum + row.audiences, 0);
    const maids = sorted.reduce((sum, row) => sum + row.maids, 0);
    const noun = mode === "client" ? (sorted.length === 1 ? "source type" : "source types") : "sources";
    const maidsLabel = maids >= 1_000_000
      ? `${mode === "client" ? (maids / 1_000_000).toFixed(2) : (maids / 1_000_000).toFixed(2).replace(/(\.\d)0$/, "$1").replace(/\.0+$/, "")}M`
      : `${Math.round(maids / 1_000)}K`;
    return {
      rows: sorted,
      summary: `${sorted.length} ${noun} · ${audiences} audiences · ${maidsLabel} MAIDs`,
    };
  }, [rows, campaignId, search, sort, direction, mode]);
  const empty = model.rows.length === 0;
  const columns = SORTS.filter((column) => mode === "staff" || column.key !== "decisions").map((column) => {
    if (mode === "client" && column.key === "vendor") return { ...column, label: "Data source type" };
    if (mode === "client" && column.key === "type") return { ...column, label: "Category" };
    return column;
  });
  const sourceName = (row: PresentedRow) => row.label || row.vendor || "Source";
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
        <h1>{mode === "client" ? "The data behind your audiences" : "Every data source behind your audiences"}</h1>
        <span className="ex">EXAMPLE DATA</span>
      </div>
      <p>{mode === "client" ? "Every audience is built from mobile ad IDs (MAIDs) in the data market. Sources are shown by type. Pick one to see every selection used to build it." : "All audiences are MAID audiences built in the data market. Pick a source to see every selection used to build it. Recommendations only. Nothing here changes a campaign amount."}</p>
      <div className="ad-bar">
        <label htmlFor="ad-campaign">Campaign</label>
        <select id="ad-campaign" value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>
          <option value="all">{mode === "client" ? `All your campaigns (${campaigns.length})` : "All campaigns"}</option>
          {campaigns.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
          ))}
        </select>
        <label htmlFor="ad-search">Search</label>
        <input id="ad-search" type="search" placeholder={mode === "client" ? "Source type or category" : "Vendor or source type"} value={search} onChange={(event) => setSearch(event.target.value)} />
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
            <caption className="ad-prov" style={{ textAlign: "left" }}>{mode === "client" ? "Data sources by type, sortable by any column" : "Data sources, sortable by any column"}</caption>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key} scope="col" aria-sort={sort === column.key ? (direction === "asc" ? "ascending" : "descending") : "none"}>
                    <button type="button" onClick={() => toggle(column.key)}>{column.label} ↕</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.rows.map((row) => (
                <tr key={row.id}>
                  <td><Link className="ad-src" href={`/audience-data/${row.id}`}>{sourceName(row)}</Link></td>
                  <td>{row.type}</td>
                  <td className="ad-mono">{row.campaigns}</td>
                  <td className="ad-mono">{row.audiences}</td>
                  <td className="ad-mono">{row.maidsLabel}</td>
                  <td><MatchRates match={row.match} /></td>
                  <td>{row.refreshed}</td>
                  <td className="ad-mono">{row.leads}</td>
                  <td>{row.leadQuality === null ? <>— <span className="ad-prov">no CRM outcome yet</span></> : <><span className="ad-mono">{row.leadQuality}</span>{row.provisional ? <span className="ad-prov"> provisional</span> : null}</>}</td>
                  {mode === "staff" && row.decisions ? <td><DecisionChips decisions={row.decisions} /></td> : null}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="ad-cards">
            {model.rows.map((row) => (
              <article key={row.id} className="ad-card">
                <h3><Link className="ad-src" href={`/audience-data/${row.id}`}>{sourceName(row)} ›</Link></h3>
                <div className="ad-prov">{row.type} · refreshed {row.refreshed}</div>
                <dl>
                  <dt>Campaigns</dt><dd>{row.campaigns}</dd>
                  <dt>Audiences</dt><dd>{row.audiences}</dd>
                  <dt>MAIDs</dt><dd>{row.maidsLabel}</dd>
                  <dt>Leads</dt><dd>{row.leads}</dd>
                  <dt>Lead quality</dt><dd>{row.qualityLabel}</dd>
                </dl>
                <MatchRates match={row.match} />
                {mode === "staff" && row.decisions ? <div style={{ marginTop: 6 }}><DecisionChips decisions={row.decisions} /></div> : null}
              </article>
            ))}
          </div>
        </>
      )}
      <States notice={empty ? `No source matches “${search}”.` : ""} mode={mode} accountName={accountName} />
    </main>
  );
}

export function AudienceDataSource({ detail, mode = "staff", accountName = "" }: { detail: PresentedDetail; mode?: "staff" | "client"; accountName?: string }) {
  const [worked, setWorked] = useState(false);
  const [notice, setNotice] = useState("");
  const cost = mode === "staff" ? detail.dataCostCpm : undefined;
  const name = detail.label || detail.vendor || "Source";
  return (
    <main>
      <nav className="crumb" aria-label="Breadcrumb">
        <Link href="/audience-data">Audience Data</Link> › <b aria-current="page">{name}</b>
      </nav>
      <div className="top">
        <h1>{name} · {detail.type}</h1>
        <span className="ex">EXAMPLE DATA</span>
      </div>
      <div className="ad-bar">
        <label htmlFor="ad-audience">Audience</label>
        <select id="ad-audience" defaultValue={detail.audienceId}>
          <option value={detail.audienceId}>{detail.audienceName} · {detail.maidsLabel} MAIDs</option>
        </select>
        <label htmlFor="ad-source-campaign">Campaign</label>
        <select id="ad-source-campaign" defaultValue="all">
          <option value="all">{mode === "client" ? `All your campaigns (${detail.campaigns})` : `All campaigns (${detail.campaigns})`}</option>
        </select>
      </div>
      <div className="ad-lin" aria-label="Lineage">
        <Link href={`/audience-data/${detail.id}`}>{name}</Link>
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
        <b>Why this?</b> {detail.why} {mode === "staff" ? <><b>Recommendation only:</b> {detail.recommendation}</> : detail.recommendation}{" "}
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
        <div className="ad-state" role="status"><h3>Loading</h3>{mode === "client" ? "Loading selections…" : "Loading selections from the data market…"}</div>
        {mode === "staff" ? (
          <div className="ad-state">
            <h3>No selections recorded</h3>
            This audience was imported without its build recipe.{" "}
            <button type="button" className="ad-btn" onClick={() => setNotice("Re-sync stays a request. Nothing was sent.")}>Ask the data team to re-sync</button>
          </div>
        ) : null}
        <div className="ad-state" role="alert">
          <h3>Couldn&apos;t load this source</h3>
          {mode === "client" ? "Selections shown are from the last sync. " : "Performance numbers are unavailable; selections shown are from the last sync. "}
          <button type="button" className="ad-btn" onClick={() => setNotice("Still the last example sync. Nothing was requested.")}>Try again</button>
        </div>
        {notice ? <p className="ad-prov" role="status">{notice}</p> : null}
        <p className="ad-prov" style={{ marginTop: 20 }}>{mode === "client" ? `Jarvis by Specificity · ${accountName} workspace · All figures are EXAMPLE DATA` : "Jarvis by Specificity · All figures are EXAMPLE DATA · Vendor names are placeholders"}</p>
      </section>
    </main>
  );
}

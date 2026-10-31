"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BRAND_TAGLINE, BRAND_WORDMARK, PRODUCT_NAME } from "@/lib/brand";
import { EXAMPLE_FEED } from "@/lib/marketing/channels/catalog";
import { scopeLiveFeed, urgentEmail, type FeedViewer } from "@/lib/marketing/channels/feed";
import { measureSpeed } from "@/lib/marketing/channels/speed";
import { Crumbs, End, Tile } from "./bits";

const end = { productName: PRODUCT_NAME, wordmark: BRAND_WORDMARK, tagline: BRAND_TAGLINE };

export function ClientHome() {
  return (
    <main>
      <div className="top">
        <div>
          <div className="sub">Harbor Dental · October so far · Updated 9:12 PM ET</div>
          <h1>You got 48 qualified leads this month, 6 more than September.</h1>
        </div>
        <span className="ex">EXAMPLE DATA</span>
      </div>
      <section className="kpis" aria-label="Your results">
        <div className="kpi"><div className="l">Qualified leads</div><div className="v">48</div><span className="d-up">▲ up 6 vs September</span></div>
        <div className="kpi"><div className="l">Booked appointments</div><div className="v">21</div><span className="d-up">▲ up 4</span></div>
        <div className="kpi"><div className="l">Answered in 30 seconds</div><div className="v">86%</div><span className="sub">goal 90%</span></div>
        <div className="kpi"><div className="l">Google reviews</div><div className="v">4.8</div><span className="sub">3 new this month</span></div>
      </section>
      <div className="grid2">
        <section>
          <h2>Where your leads came from</h2>
          <table>
            <thead><tr><th>Source</th><th>Leads</th><th>Qualified</th><th>Booked</th></tr></thead>
            <tbody>
              <tr><td><Link href="/c/harbor/facebook">Facebook & Instagram ads</Link></td><td>72</td><td>22</td><td>9</td></tr>
              <tr><td><Link href="/c/harbor/google">Google search ads</Link></td><td>51</td><td>17</td><td>8</td></tr>
              <tr><td>Google Maps listing</td><td>19</td><td>7</td><td>3</td></tr>
              <tr><td>Display ads</td><td>8</td><td>2</td><td>1</td></tr>
            </tbody>
          </table>
          <p className="sub">Counted once per person. Last non-direct touch, 7-day click / 1-day view.</p>
        </section>
        <aside>
          <h2>Needs your answer</h2>
          <article className="dec hot">
            <div className="tag">Lead check · 1 tap</div>
            <h3>Was Maria G. a good lead?</h3>
            <p>She asked about implants from your Google ad yesterday.</p>
            <div className="acts">
              <Link className="btn p" href="/decisions/D-1101">Qualified</Link>
              <Link className="btn" href="/decisions/D-1101">Not a fit</Link>
            </div>
          </article>
          <article className="dec">
            <div className="tag">Your website</div>
            <h3>All 4 pages are up</h3>
            <p>Last checked 2 minutes ago.</p>
            <Link className="btn" href="/sites/landing-pages">See pages</Link>
          </article>
          <article className="dec">
            <div className="tag">Your account manager</div>
            <h3>Dana Ruiz</h3>
            <p>Questions about your results? Message Dana.</p>
          </article>
        </aside>
      </div>
      <End {...end} />
    </main>
  );
}

export function ClientChannel() {
  return (
    <main>
      <Crumbs items={[{ label: "Home", href: "/" }, { label: "Facebook & Instagram ads" }]} />
      <div className="top">
        <div>
          <div className="sub">Harbor Dental · Facebook & Instagram ads · Last 30 days · Updated 9:12 PM ET</div>
          <h1>Your Facebook and Instagram ads brought 72 leads; 22 were qualified.</h1>
        </div>
        <span className="ex">EXAMPLE DATA</span>
      </div>
      <section className="mt">
        <Tile hero glossaryId="leads" label="Leads" value="72" prior="▲ 8% vs prior" priorGood goal="over 65 vs goal" why="Most came from the Free Consult ad." />
        <Tile glossaryId="qualified_leads" label="Qualified leads" value="22" prior="▲ 3 vs prior" priorGood goal="on goal" why="You and Dana marked 22 as real prospects." />
        <Tile glossaryId="booked" label="Booked" value="9" prior="▲ 1 vs prior" priorGood goal="▼ 1 under vs goal" why="Two people asked to book next month." />
        <Tile glossaryId="ctr" label="CTR" value="1.2%" prior="▼ 0.4 pts vs prior" priorGood={false} goal="under 1.5% vs goal" why="One video ad is getting tired. Dana is preparing a new version." />
      </section>
      <h2 style={{ margin: "28px 0 8px" }}>Your ads</h2>
      <p className="sub">Results only</p>
      <table className="stack">
        <thead><tr><th>Ad</th><th>Leads</th><th>Qualified</th><th>Booked</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td>Free Consult carousel</td><td>31</td><td>11</td><td>5</td><td><span className="st ok">● Working well</span></td></tr>
          <tr><td>Smile Again 55+ video</td><td>24</td><td>6</td><td>2</td><td><span className="st w">▲ Getting tired, new version coming</span></td></tr>
        </tbody>
      </table>
      <End {...end} />
    </main>
  );
}

type LeadRow = { id: string; name: string; source: string; landedAt: string | null; submittedAt: string | null; contactedAt: string; qualified: boolean | null };
const LEADS: LeadRow[] = [
  { id: "maria", name: "Maria G.", source: "Google search ads", landedAt: "2026-10-30T14:00:00Z", submittedAt: "2026-10-30T14:00:20Z", contactedAt: "2026-10-30T14:00:28Z", qualified: null },
  { id: "ray", name: "Ray S.", source: "AIS2L", landedAt: null, submittedAt: "2026-10-30T15:00:00Z", contactedAt: "2026-10-30T15:02:10Z", qualified: true },
];

export function LeadsPage({ canMark }: { canMark: boolean }) {
  const [rows, setRows] = useState(LEADS);
  const [undo, setUndo] = useState<{ id: string; previous: boolean | null } | null>(null);
  return (
    <main>
      <Crumbs items={[{ label: "All clients", href: "/" }, { label: "Leads & pipeline" }]} />
      <div className="top">
        <div>
          <div className="sub">Conversion · Leads & pipeline · Last 7 days · Updated 9:12 PM ET</div>
          <h1>62% of leads were contacted within 30 seconds of landing. Goal is 90%.</h1>
        </div>
        <span className="ex">EXAMPLE DATA</span>
      </div>
      <section className="mt">
        <Tile hero glossaryId="leads" label="Leads" value="212" prior="▲ 4% vs prior" priorGood goal="on goal" why="Counted once per person across channels." />
        <Tile glossaryId="qualified_leads" label="Qualified leads" value="71" prior="▼ 18% vs prior" priorGood={false} goal="▼ 13 under vs goal" why="Fewer Meta leads, not lower quality." />
        <Tile glossaryId="speed_to_lead" label="Speed to lead" value="41s" prior="▼ 6s faster" priorGood goal="11s over 30s" why="Clock starts when the visitor lands. Goal is 30 seconds." />
        <Tile glossaryId="booked" label="Booked" value="29" prior="▲ 2 vs prior" priorGood goal="▼ 3 under vs goal" why="Harbor Dental booked 21." />
      </section>
      <p className="sub" style={{ marginTop: 20 }}>{canMark ? "You can mark Qualified or Not qualified. Every mark is logged, and you can undo it for 30 seconds." : "You can see the result. Marking a lead is turned off for this role."}</p>
      <table className="stack">
        <thead><tr><th>Lead</th><th>Source</th><th>Speed to lead</th><th>Qualified?</th></tr></thead>
        <tbody>
          {rows.map((row) => {
            const speed = measureSpeed(row);
            return (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.source}</td>
                <td>{speed?.label}{speed?.footnote ? <span className="sub"> {speed.footnote}</span> : null}</td>
                <td>
                  {canMark ? (
                    <span className="acts">
                      <button type="button" className="btn" onClick={() => { setUndo({ id: row.id, previous: row.qualified }); setRows((list) => list.map((item) => item.id === row.id ? { ...item, qualified: true } : item)); }}>Qualified</button>
                      <button type="button" className="btn" onClick={() => { setUndo({ id: row.id, previous: row.qualified }); setRows((list) => list.map((item) => item.id === row.id ? { ...item, qualified: false } : item)); }}>Not qualified</button>
                    </span>
                  ) : (
                    <span>{row.qualified == null ? "Not marked" : row.qualified ? "Qualified" : "Not qualified"}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {undo && <div className="toast" role="status">Mark saved. <button type="button" onClick={() => { setRows((list) => list.map((item) => item.id === undo.id ? { ...item, qualified: undo.previous } : item)); setUndo(null); }}>Undo</button></div>}
      <End {...end} />
    </main>
  );
}

export function LandingPage() {
  return (
    <main>
      <Crumbs items={[{ label: "All clients", href: "/" }, { label: "Landing pages" }]} />
      <div className="top">
        <div>
          <div className="sub">Checked every minute · Updated 9:12 PM ET</div>
          <h1>1 page is down. 2 Meta ads still send people to it.</h1>
        </div>
        <span className="ex">EXAMPLE DATA</span>
      </div>
      <section className="mt">
        <Tile hero glossaryId="uptime" label="Uptime" value="99.2%" prior="▼ 0.7 pts" priorGood={false} goal="under 99.5%" why="All of the drop is Gulf Pest /spring-offer, down since 9:28 PM ET." />
        <Tile glossaryId="conv_rate" label="Conv. rate" value="8.4%" prior="▲ 0.6 pts" priorGood goal="over 7%" why="Harbor /implants got a faster form." />
        <Tile glossaryId="leads" label="Leads" value="212" prior="▲ 4%" priorGood goal="on goal" why="Steady except Gulf Pest, which lost leads tonight." />
        <Tile glossaryId="speed_to_lead" label="Speed to lead" value="41s" prior="▼ 6s faster" priorGood goal="11s over 30s" why="Measured from page landing. Goal 30 seconds." />
      </section>
      <h2 style={{ margin: "28px 0 8px" }}>Pages</h2>
      <table className="stack">
        <thead><tr><th>Page</th><th>Status</th><th>Uptime 7d</th><th>Ads pointing here</th></tr></thead>
        <tbody>
          <tr>
            <td>gulfpest.com/spring-offer</td>
            <td><span className="st e">✕ Down 3 checks</span></td>
            <td>96%</td>
            <td>2 Meta ads</td>
          </tr>
          <tr>
            <td>harbordental.com/implants</td>
            <td><span className="st ok">● Up</span></td>
            <td>100%</td>
            <td>4 ads</td>
          </tr>
        </tbody>
      </table>
      <article className="dec" style={{ marginTop: 20 }}>
        <div className="tag">Outage · dry run only</div>
        <h3>/spring-offer failed 3 checks</h3>
        <div className="pend"><b>Waiting on Jason: ad-account write access.</b> The server logged “would pause 2 ads”. Nothing was paused. Resume after 2 good checks is pending confirmation. There is no auto-resume.</div>
        <p className="sub">Log · 9:31 PM ET · Gulf Pest · /spring-offer · 2 ads · reason: 3 failed checks · actor: system · result: dry run</p>
        <div className="acts"><Link className="btn d" href="/decisions/D-1043">Open decision</Link></div>
      </article>
      <End {...end} />
    </main>
  );
}

export function LiveFeed({ viewer }: { viewer: FeedViewer }) {
  const items = useMemo(() => scopeLiveFeed(EXAMPLE_FEED, viewer), [viewer]);
  const [rows, setRows] = useState(items);
  const [undo, setUndo] = useState<string | null>(null);
  const [channel, setChannel] = useState("All");
  const [severity, setSeverity] = useState("All");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const shown = rows.filter((item) => (channel === "All" || item.channel === channel) && (severity === "All" || item.severity === severity) && (!unreadOnly || item.unread));
  return (
    <main>
      <div className="top">
        <div>
          <div className="sub">Live · your assigned clients only · quiet hours 10 PM–7 AM · urgent alerts by email only ({urgentEmail(true)})</div>
          <h1>Live notes · {shown.filter((item) => item.unread).length} need you now</h1>
        </div>
        <div className="ctl">
          <span className="ex">EXAMPLE DATA</span>
          <Link href="/live" className="bell" aria-label={`Notifications, ${rows.filter((item) => item.unread).length} unread`}>🔔<b>{rows.filter((item) => item.unread).length}</b></Link>
        </div>
      </div>
      <div className="ctl" style={{ marginBottom: 12 }} role="group" aria-label="Filters">
        <label className="sel">Channel <select value={channel} onChange={(event) => setChannel(event.target.value)}><option>All</option><option>Meta</option><option>Google Ads</option><option>Landing page</option></select></label>
        <label className="sel">Severity <select value={severity} onChange={(event) => setSeverity(event.target.value)}><option>All</option><option>urgent</option><option>decision</option><option>note</option></select></label>
        <button type="button" className="btn" aria-pressed={unreadOnly} onClick={() => setUnreadOnly((value) => !value)}>Unread only</button>
        <button type="button" className="btn" onClick={() => setRows((list) => list.map((item) => ({ ...item, unread: false })))}>Mark all read</button>
      </div>
      <ul className="feed">
        {shown.map((item) => (
          <li key={item.id} className={item.unread ? "fi unread" : "fi"}>
            <span className="dot" aria-label={item.unread ? "Unread" : "Read"} />
            <div>
              <span className={item.severity === "urgent" ? "sev u" : item.severity === "decision" ? "sev h" : "sev i"}>{item.severity.toUpperCase()}</span>{" "}
              <span className="tag">{item.clientName} · {item.channel}</span>
              <h3><Link href={item.decisionId ? `/decisions/${item.decisionId}` : "/live"} style={{ color: "inherit" }}>{item.title}</Link></h3>
              <p>{item.reason}</p>
              <div className="acts">
                {item.severity === "decision" && <button type="button" className="btn p" onClick={() => setUndo(item.id)}>Approve</button>}
                {item.severity === "decision" && <button type="button" className="btn" onClick={() => setUndo(item.id)}>Decline</button>}
                <button type="button" className="btn" onClick={() => setRows((list) => list.map((row) => row.id === item.id ? { ...row, unread: false } : row))}>Mark read</button>
                <button type="button" className="btn" onClick={() => setRows((list) => list.map((row) => row.id === item.id ? { ...row, unread: false } : row))}>Snooze</button>
              </div>
            </div>
            <span className="sub">{item.createdAt.slice(11, 16)}</span>
          </li>
        ))}
      </ul>
      <aside className="box" style={{ marginTop: 16 }}>
        <div className="tag">Hourly recap</div>
        <h2>Each line opens the decision it covers</h2>
        <ol>
          {shown.slice(0, 4).map((item) => (
            <li key={item.id}><Link href={item.decisionId ? `/decisions/${item.decisionId}` : "/live"}>{item.title}</Link></li>
          ))}
        </ol>
        <p className="sub">Notes batch every 15 minutes. At most one toast per client every 10 minutes. Quiet hours hold decisions and notes until 7 AM. Urgent email still sends.</p>
      </aside>
      {undo && <div className="toast" role="status">Saved. Nothing was paused and no budget changed. <button type="button" onClick={() => setUndo(null)}>Undo (30s)</button></div>}
      <End {...end} />
    </main>
  );
}

export function SettingsConnections() {
  return (
    <main>
      <Crumbs items={[{ label: "Harbor Dental", href: "/" }, { label: "Settings & connections" }]} />
      <div className="top">
        <div>
          <div className="sub">Account · Settings & connections</div>
          <h1>5 of 6 connections are healthy. Conversion feedback needs setup.</h1>
        </div>
        <span className="ex">EXAMPLE DATA</span>
      </div>
      <table className="stack">
        <thead><tr><th>Source</th><th>Status</th><th>Access</th><th>Write access</th></tr></thead>
        <tbody>
          <tr><td>Meta</td><td><span className="st ok">● Connected</span></td><td>Read only</td><td><span className="pill t">PENDING JASON APPROVAL</span> <button type="button" className="btn" disabled>Request write access</button></td></tr>
          <tr><td>Google Ads</td><td><span className="st ok">● Connected</span></td><td>Read only</td><td><span className="pill t">PENDING JASON APPROVAL</span> <button type="button" className="btn" disabled>Request write access</button></td></tr>
          <tr><td>StackAdapt</td><td><span className="st ok">● Connected</span></td><td>Read only</td><td>Not needed</td></tr>
          <tr><td>Google Business Profile</td><td><span className="st ok">● Connected</span></td><td>Read</td><td>—</td></tr>
          <tr><td>AIS2L / GoHighLevel</td><td><span className="st ok">● Synced</span></td><td>Leads</td><td>—</td></tr>
        </tbody>
      </table>
      <p className="sub">Write access can only pause ads on a down page, and only after approval. It cannot change budgets. The request stays disabled.</p>
      <section className="box" style={{ marginTop: 16 }}>
        <h2>Client options</h2>
        <p>Creative approvals for client owners: <b>Off</b>. Off by default. Turn on per client.</p>
        <p>Owners can mark leads Qualified: <b>On</b></p>
        <p>Lead credit: <b>7-day click / 1-day view</b>. Learned windows show when there are at least 30 leads.</p>
        <p>Quiet hours: <b>10 PM–7 AM</b>. Urgent outages still alert by email.</p>
      </section>
      <End {...end} />
    </main>
  );
}

export function Ais2lPage({ testMode }: { testMode: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <main>
      <Crumbs items={[{ label: "All clients", href: "/" }, { label: "AIS2L" }]} />
      <div className="top">
        <div>
          <div className="sub">AIS2L voice module · {testMode ? "TEST MODE" : "LIVE"} · server-enforced</div>
          <h1>AIS2L answered 94% of calls and booked 9 consults this week.</h1>
        </div>
        <span className="ex">EXAMPLE DATA</span>
      </div>
      {testMode && <p className="pill t">TEST MODE · only test numbers are called</p>}
      <section className="mt" style={{ marginTop: 16 }}>
        <Tile hero glossaryId="speed_to_lead" label="Speed to lead" value="22s" prior="▼ 9s faster" priorGood goal="8s under 30s" why="Outbound calls start after landing. Goal 30 seconds." />
        <Tile glossaryId="booked" label="Booked" value="9" prior="▲ 3" priorGood goal="▼ 1 under" why="Most bookings came from emergency-dentist searches." />
        <Tile glossaryId="leads" label="Leads" value="118" prior="▲ 12%" priorGood goal="over 100" why="AIS2L calls Google leads first." />
        <Tile glossaryId="qual_rate" label="Qual. rate" value="41%" prior="▲ 5 pts" priorGood goal="over 35%" why="The insurance question is asked earlier." />
      </section>
      <h2 style={{ margin: "24px 0 8px" }}>Calls</h2>
      <article className="dec">
        <div className="tag">Ray S. · Coastal Roofing · Booked</div>
        <h3>Summary</h3>
        <p>Asked for a roof inspection after the storm ad. Booked Thursday at 10.</p>
        <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? "Hide transcript" : "Show transcript"}</button>
        {open && <p>Caller: The leak is over the kitchen. Agent: I can hold Thursday at 10.</p>}
      </article>
      <End {...end} />
    </main>
  );
}

export function ReportsPage({ expiryDays = 30 }: { expiryDays?: number }) {
  return (
    <main>
      <Crumbs items={[{ label: "All clients", href: "/" }, { label: "Reports" }]} />
      <div className="top">
        <div>
          <div className="sub">Share · client versions never include cost</div>
          <h1>Reports and client share</h1>
        </div>
        <span className="ex">EXAMPLE DATA</span>
      </div>
      <p>Charts, PDF export, and live reports come from Reports v2. This page only lists share links. New links expire in {expiryDays} days, can require a passcode, send noindex, and revoke immediately.</p>
      <table>
        <thead><tr><th>Report</th><th>Includes cost?</th><th>Expires</th></tr></thead>
        <tbody>
          <tr><td>Harbor Dental · October</td><td>No</td><td>30 days</td></tr>
          <tr><td>Staff cross-channel</td><td>Staff only</td><td>Not shared</td></tr>
        </tbody>
      </table>
      <p className="sub">Revoke stops a link immediately. Passcodes lock after 5 tries in 15 minutes.</p>
      <End {...end} />
    </main>
  );
}

import Link from "next/link";
import { BRAND_TAGLINE, BRAND_WORDMARK, PRODUCT_NAME } from "@/lib/brand";
import { recommendAd, type AdSignal } from "@/lib/marketing/channels/recommend";
import { Crumbs, End, Flag, RecChip, Tile } from "./bits";
import { ChannelTable } from "./channel-table";

const brand = { productName: PRODUCT_NAME, wordmark: BRAND_WORDMARK, tagline: BRAND_TAGLINE };

const learned = { clickDays: 9, viewDays: 1, learnedClickDays: 9, learnedViewDays: 1, source: "learned" as const };

export const DRILL_ADS: AdSignal[] = [
  { name: "Smile Again 55+", leads: 6, clicksChangePct: -31, frequency: 4.2, confidence: 88, decisionId: "D-1042", productName: PRODUCT_NAME, credit: learned },
  { name: "Free Consult", leads: 8, clicksChangePct: 14, frequency: 2.1, confidence: 84, rising: true, decisionId: "D-1048", productName: PRODUCT_NAME, credit: learned },
  { name: "Before/After", leads: 0, clicksChangePct: -10, frequency: 1.2, confidence: 71, decisionId: "D-1049", productName: PRODUCT_NAME, credit: learned },
  { name: "New test", leads: 1, clicksChangePct: null, frequency: null, confidence: 42, decisionId: "D-1099", productName: PRODUCT_NAME, credit: { clickDays: 7, viewDays: 1, source: "default" } },
];

export function StaffHome() {
  return (
    <main>
      <Crumbs items={[{ label: "All clients", href: "/" }, { label: "Overview" }]} />
      <div className="top">
        <div>
          <div className="sub">Friday, Oct 30 · All clients · Last 7 days vs prior 7 days · Updated 9:12 PM ET</div>
          <h1>Qualified leads are down 18%. One Meta ad set explains most of it.</h1>
        </div>
        <div className="ctl">
          <span className="ex">EXAMPLE DATA</span>
          <span className="sel">Last 7 days</span>
          <span className="sel">All clients</span>
        </div>
      </div>
      <section className="mt" aria-label="Cross-channel results">
        <Tile hero glossaryId="qualified_leads" label="Qualified leads" value="71" prior="▼ 18% vs prior 7 days" priorGood={false} goal="▼ 13 under vs goal" why="Down 18% vs last week, mostly from Meta ad set Retirees FL after its top ad got tired." />
        <Tile glossaryId="cpql" staff label="Cost per qualified lead" value="$124" prior="▲ $8 worse vs prior" priorGood={false} goal="$14 over $110 vs goal" why="Rose because Meta spend held steady while its qualified leads fell 27%." />
        <Tile glossaryId="spend" staff label="Spend" value="$8.3k" prior="▲ 2% vs prior" priorGood={false} goal="96% of plan vs goal" why={`${PRODUCT_NAME} never edits budgets. Google Ads Harbor Implants is pacing 14% high.`} />
        <Tile glossaryId="speed_to_lead" label="Speed to lead" value="41s" prior="▼ 6s faster vs prior" priorGood goal="11s over 30s vs goal" why="Faster because AIS2L now calls Google leads first. Measured from landing. Goal 30 seconds." />
      </section>
      <div className="grid2">
        <section>
          <div className="sec-h">
            <h2>Channels</h2>
            <span className="sub">Click a channel to drill in</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Channel</th>
                <th>Spend</th>
                <th>Leads</th>
                <th>CPL</th>
                <th>Qualified</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <ChannelRow href="/c/all/meta" name="Meta" spend="$3.9k" leads="96" cpl="$41" qualified="31" status="▼ Anomaly" tone="e" />
              <ChannelRow href="/c/all/google-ads" name="Google Ads" spend="$3.1k" leads="74" cpl="$42" qualified="29" status="▲ Opportunity" tone="ok" />
              <ChannelRow href="/c/all/stackadapt" name="StackAdapt" spend="$1.3k" leads="15" cpl="$87" qualified="4" status="◆ Opportunity" tone="w" />
              <ChannelRow href="/c/all/google-business-profile" name="Google Business Profile" spend="n/a" leads="22" cpl="n/a" qualified="7" status="● Normal" tone="ok" />
            </tbody>
          </table>
          <p className="sub">Attribution: last non-direct touch, 7-day click / 1-day view. A lead is counted once even if Meta and Google both claim it.</p>
        </section>
        <aside>
          <h2>Flags</h2>
          <Flag tone="an" label="ANOMALY" href="/decisions/D-1042">Meta · Harbor Dental · Retirees FL: leads −38% in 7 days; top ad frequency 4.6 (threshold 3.5).</Flag>
          <Flag tone="an" label="ANOMALY" href="/decisions/D-1043">Landing page /spring-offer failed 3 checks. 2 Meta ads point there.</Flag>
          <Flag tone="op" label="OPPORTUNITY" href="/decisions/D-1044">Google Ads “emergency dentist” converts at 14%, 2× the account average.</Flag>
          <Flag tone="oo" label="OPPORTUNITY" href="/decisions/D-1045">StackAdapt cost per lead is 2.1× Google’s. Reallocation is a recommendation only.</Flag>
          <div className="sec-h" style={{ marginTop: 16 }}>
            <h2>Top decision</h2>
            <Link href="/decisions">Open inbox (7)</Link>
          </div>
          <article className="dec hot">
            <div className="tag">Creative tired · Harbor Dental · Meta</div>
            <h3>Approve a new version of Smile Again 55+</h3>
            <p>Seen 4.6 times per person, clicks down 41%. Pause is not automatic.</p>
            <div className="acts">
              <Link className="btn p" href="/decisions/D-1042">Approve</Link>
              <Link className="btn" href="/decisions/D-1042">Decline</Link>
              <Link className="btn" href="/decisions/D-1042">Later</Link>
            </div>
          </article>
        </aside>
      </div>
      <End {...brand} />
    </main>
  );
}

function ChannelRow({ href, name, spend, leads, cpl, qualified, status, tone }: { href: string; name: string; spend: string; leads: string; cpl: string; qualified: string; status: string; tone: "ok" | "w" | "e" }) {
  return (
    <tr>
      <td><Link className="ch" href={href}><span className="sw" />{name}</Link></td>
      <td>{spend}</td>
      <td>{leads}</td>
      <td>{cpl}</td>
      <td>{qualified}</td>
      <td><span className={`st ${tone}`}>{status}</span></td>
    </tr>
  );
}

export function ChannelDetail({ channel }: { channel: string }) {
  const meta = channel !== "google-ads";
  return (
    <main>
      <Crumbs items={[{ label: "All clients", href: "/" }, { label: "Overview", href: "/" }, { label: meta ? "Meta" : "Google Ads" }]} />
      <div className="top">
        <div>
          <div className="sub">{meta ? "Channel · Meta · Connected, read-only · Last 7 days" : "Channel · Google Ads · Last 7 days"} · Updated 9:12 PM ET</div>
          <h1>{meta ? "Meta leads are down 22%. Retirees FL accounts for 22 of the 27 missing." : "Google search is the bright spot. One term is wasting spend."}</h1>
        </div>
        <div className="ctl"><span className="ex">EXAMPLE DATA</span><span className="sel">Last 7 days</span></div>
      </div>
      <section className="mt" aria-label="Channel results">
        <Tile hero glossaryId="leads" label="Leads" value={meta ? "96" : "74"} prior={meta ? "▼ 22% vs prior 7 days" : "▲ 9% vs prior 7 days"} priorGood={!meta} goal={meta ? "▼ 14 under vs goal" : "over goal"} why={meta ? "Down 27 leads vs last week; 22 of them are Harbor Dental · Retirees FL." : "Search for emergency dentist is converting at twice the account average."} />
        <Tile glossaryId="cpl" staff label="CPL" value={meta ? "$41" : "$42"} prior="▲ vs prior" priorGood={false} goal="over goal" why="Spend held while the mix of leads changed." />
        <Tile glossaryId="ctr" label="CTR" value="1.2%" prior="▼ 0.4 pts vs prior" priorGood={false} goal="under 1.5% vs goal" why="One tired ad pulled the rate down." />
        <Tile glossaryId="frequency" label="Frequency" value={meta ? "2.9" : "1.4"} prior="▲ vs prior" priorGood={false} goal="under 3.5 vs goal" why={meta ? "Still under 3.5 overall. Retirees FL is at 4.6." : "Search frequency stays low."} />
      </section>
      <div className="sec-h" style={{ marginTop: 28 }}>
        <h2>{meta ? "Campaigns" : "Campaigns, ad groups, keywords"}</h2>
        <span className="sub">Enter or Space expands a row. Names open the drill page.</span>
      </div>
      <ChannelTable
        rows={
          meta
            ? [
                {
                  id: "harbor",
                  name: "Harbor Dental · Implants Q4",
                  href: "/c/all/meta/harbor-implants/retirees-fl",
                  cells: ["$1.6k", "38", "$42", "1.0%", "▼ Anomaly"],
                  children: [
                    { id: "retirees", name: "Retirees FL", href: "/c/all/meta/harbor-implants/retirees-fl", cells: ["$820", "14", "$59", "0.7%", "▼ Anomaly"], children: [
                      { id: "smile", name: "Smile Again 55+ video", href: "/decisions/D-1042", cells: ["$610", "6", "$102", "0.5%", "Rotate"] },
                    ] },
                  ],
                },
                { id: "gulf", name: "Gulf Pest · Spring Offer", href: "/decisions/D-1043", cells: ["$0.9k", "17", "$53", "1.1%", "Page down"] },
              ]
            : [
                {
                  id: "search",
                  name: "Harbor Implants Search",
                  href: "/decisions/D-1044",
                  cells: ["$1.9k", "44", "$43", "6.1%", "▲ Opportunity"],
                  children: [
                    { id: "kw", name: "emergency dentist near me", href: "/decisions/D-1044", cells: ["$410", "14", "$29", "9.2%", "Budget recommendation"] },
                    { id: "waste", name: "free dental work", href: "/decisions/D-1047", cells: ["$96", "0", "—", "3.1%", "Approve negative keyword"] },
                  ],
                },
              ]
        }
      />
      <End {...brand} />
    </main>
  );
}

export function Drill() {
  const ads = DRILL_ADS.map((ad) => ({ ad, rec: recommendAd(ad) }));
  return (
    <main>
      <Crumbs
        items={[
          { label: "All clients", href: "/" },
          { label: "Overview", href: "/" },
          { label: "Meta", href: "/c/all/meta" },
          { label: "Harbor Dental · Implants Q4", href: "/c/all/meta" },
          { label: "Retirees FL" },
        ]}
      />
      <div className="top">
        <div>
          <div className="sub">Ad set · Meta · Harbor Dental · Last 7 days vs prior 7 days · Updated 9:12 PM ET</div>
          <h1>Retirees FL lost 22 leads because its top ad wore out.</h1>
        </div>
        <span className="ex">EXAMPLE DATA</span>
      </div>
      <section className="mt" aria-label="Ad set results">
        <Tile hero glossaryId="leads" label="Leads" value="14" prior="▼ 61% vs prior 7 days" priorGood={false} goal="▼ 11 under vs goal" why="22 fewer leads than last week. 20 of those came from one ad, Smile Again 55+." />
        <Tile glossaryId="cpl" staff label="CPL" value="$59" prior="▲ $31 worse" priorGood={false} goal="$24 over $35" why="Spend held while leads fell, so each lead cost more." />
        <Tile glossaryId="frequency" label="Frequency" value="4.6" prior="▲ 1.9 vs prior" priorGood={false} goal="over 3.5 vs goal" why="The same people keep seeing the top ad." />
        <Tile glossaryId="ctr" label="CTR" value="0.7%" prior="▼ 0.5 pts" priorGood={false} goal="under 1.5%" why="People stopped clicking the video around day 18 of its run." />
      </section>
      <h2 style={{ margin: "28px 0 12px" }}>Ads in this ad set</h2>
      <table className="stack">
        <thead>
          <tr>
            <th>Ad</th>
            <th>{PRODUCT_NAME} recommends</th>
            <th>Leads</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {ads.map(({ ad, rec }) => (
            <tr key={ad.decisionId}>
              <td>{ad.name}</td>
              <td style={{ textAlign: "left" }}><RecChip rec={rec} /></td>
              <td>{ad.leads}</td>
              <td>{rec.action === "insufficient" ? "Not enough data" : rec.label}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <section className="box" style={{ marginTop: 24 }} aria-label="What changed and why">
        <h2>What changed and why</h2>
        <p className="sub">High confidence 88%</p>
        <ol>
          <li>Leads down 61% vs last week, mostly from the Smile Again video after it got tired.</li>
          <li>Cost per lead doubled because spend stayed put while leads fell. {PRODUCT_NAME} never edits budgets.</li>
          <li>The carousel is still healthy.</li>
        </ol>
        <p>Not the cause: the page is up, the form works, and speed to lead held at 34s.</p>
      </section>
      <End {...brand} />
    </main>
  );
}

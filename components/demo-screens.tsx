import Link from "next/link";
import { PRODUCT_WORDMARK } from "@/lib/brand";
import { DemoBudgetMoment } from "@/components/demo-budget-moment";
import { DemoEntry } from "@/components/demo-entry";
import { ClientEndingScreen, CloseScreen, InvestorScreen, ProblemScreen, VendorScreen, VerifiedScreen } from "@/components/demo-story-screens";
import { demoBudgetAttempt, demoChannels, formatDemoStamp } from "@/lib/demo/story";
import { BASED_ON_LABEL, DEMO_SUPPORTING_LINE, DEMO_TAGLINE, HUMANS_CONTROL_BUDGETS, ILLUSTRATIVE_BADGE, type TourMode } from "@/lib/demo/tour";
import type { presentDemo } from "@/lib/demo/present";

type Presentation = ReturnType<typeof presentDemo>;
export type DemoScreenId =
  | "command"
  | "problem"
  | "audiences"
  | "serving"
  | "segments"
  | "verified"
  | "compare"
  | "explanations"
  | "decisions"
  | "vendors"
  | "report"
  | "close"
  | "client"
  | "investor";

const NAV: Array<{ href: string; label: string; id: DemoScreenId }> = [
  { href: "/demo", label: "Home", id: "command" },
  { href: "/demo/problem", label: "Problem", id: "problem" },
  { href: "/demo/audiences", label: "Audience", id: "audiences" },
  { href: "/demo/serving", label: "Serving", id: "serving" },
  { href: "/demo/segments", label: "Segments", id: "segments" },
  { href: "/demo/verified", label: "Verified", id: "verified" },
  { href: "/demo/compare", label: "Compare", id: "compare" },
  { href: "/demo/explanations", label: "Explanations", id: "explanations" },
  { href: "/demo/decisions", label: "Decisions", id: "decisions" },
  { href: "/demo/vendors", label: "Vendors", id: "vendors" },
  { href: "/demo/report", label: "Report", id: "report" },
  { href: "/demo/close", label: "Ending", id: "close" },
  { href: "/demo/client", label: "Client", id: "client" },
  { href: "/demo/investor", label: "Investor", id: "investor" },
];

const PLATFORM: Record<string, string> = {
  meta: "Meta",
  google_ads: "Google",
  tiktok: "TikTok",
  stackadapt: "StackAdapt",
  ais2l: "AIS2L voice",
};

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function DemoScreens({
  screen,
  data,
  tourEnabled,
  tourMode = null,
}: {
  screen: DemoScreenId;
  data: Presentation;
  tourEnabled: boolean;
  tourMode?: TourMode | null;
}) {
  const view = data.view;
  const q = `view=${view}`;
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 pb-40">
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Demo">
        {NAV.map((item) => (
          <Link key={item.href} href={`${item.href}?${q}`} className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-3 text-sm ${item.id === screen ? "bg-brand font-semibold text-on-brand" : "border border-line"}`}>
            {item.label}
          </Link>
        ))}
      </nav>
      {screen === "command" ? <DemoEntry view={view} tourEnabled={tourEnabled} /> : null}
      {screen === "command" ? <CommandCenter data={data} /> : null}
      {screen === "problem" ? <ProblemScreen /> : null}
      {screen === "audiences" ? <Audiences data={data} /> : null}
      {screen === "serving" ? <Serving data={data} /> : null}
      {screen === "segments" ? <Segments data={data} /> : null}
      {screen === "verified" ? <VerifiedScreen /> : null}
      {screen === "compare" ? <Compare data={data} /> : null}
      {screen === "explanations" ? <Explanations data={data} /> : null}
      {screen === "decisions" ? <Decisions data={data} /> : null}
      {screen === "vendors" ? <VendorScreen /> : null}
      {screen === "report" ? <Report data={data} /> : null}
      {screen === "close" ? <CloseScreen view={view} tourMode={tourMode} /> : null}
      {screen === "client" ? <ClientEndingScreen view={view} /> : null}
      {screen === "investor" ? <InvestorScreen view={view} /> : null}
    </div>
  );
}

function spendCentsOf(row: object) {
  const value = (row as { spendCents?: unknown }).spendCents;
  return typeof value === "number" ? value : null;
}

function CommandCenter({ data }: { data: Presentation }) {
  const view = data.view;
  const illustrative = data.totals.map((row) => ({ row, spend: spendCentsOf(row) })).find((item) => item.row.illustrative && item.spend !== null);
  const stops = [
    { href: `/demo/problem?view=${view}`, title: "The problem", body: "Published research on non-human traffic. Not a Specificity result." },
    { href: `/demo/audiences?view=${view}`, title: "Live data market", body: `${data.audiences.matched} of ${data.audiences.uploaded} seeded ids, with vendor and list id.` },
    { href: `/demo/serving?view=${view}`, title: "One audience, everywhere", body: "The same sample list, prepared for four channels." },
    { href: `/demo/verified?view=${view}`, title: "Verified conversions", body: "Platform-reported rows beside the ones this demo counts." },
    { href: `/demo/decisions?view=${view}`, title: "Decisions inbox", body: `${data.decisions.length} seeded decisions. ${HUMANS_CONTROL_BUDGETS}.` },
    { href: `/demo/report?view=${view}`, title: "Client report", body: data.report[0]?.title || "Weekly report" },
  ];
  return (
    <section data-tour-anchor="command">
      <p className="text-sm font-semibold">{PRODUCT_WORDMARK}</p>
      <p className="mt-1 text-sm font-semibold text-brand">{DEMO_TAGLINE}</p>
      <p className="mt-1 text-sm">{DEMO_SUPPORTING_LINE}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Command center</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Morning view of the fictional demo accounts. Start the tour on the problem, then the fresh list, the channels, and the decision a person still makes.</p>
      <ul className="mt-4 grid gap-3 md:grid-cols-2">
        {stops.map((stop) => (
          <li key={stop.href}>
            <Link href={stop.href} className="block rounded-xl border border-line bg-card p-4">
              <div className="font-semibold">{stop.title}</div>
              <p className="mt-1 text-sm text-muted">{stop.body}</p>
            </Link>
          </li>
        ))}
      </ul>
      {illustrative?.spend != null ? (
        <p className="mt-4 text-sm font-semibold">{ILLUSTRATIVE_BADGE}. Platform targeting spend in the seed: {money(illustrative.spend)}. Not a live account.</p>
      ) : (
        <p className="mt-4 text-sm text-muted">Client view. Spend stays off this page.</p>
      )}
      <h2 className="mt-6 text-lg font-semibold">Sample accounts</h2>
      <ul className="mt-3 grid gap-3 md:grid-cols-2">
        {data.clients.map((client) => (
          <li key={client.name} className="rounded-xl border border-line bg-card p-4">
            <div className="font-semibold">{client.name}</div>
            <div className="mt-1 text-sm text-muted">{client.email}</div>
            <div className="text-sm text-muted">{client.phone}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Audiences({ data }: { data: Presentation }) {
  const fresh = data.audiences;
  return (
    <section data-tour-anchor="audience">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand">Live data market</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Sourced for this campaign</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
        Harbor Point Marine (Demo), campaign {fresh.campaign}. {fresh.matched} of {fresh.uploaded} seeded ids are marked matched. Owned files go stale. This list was sourced for the campaign.
      </p>
      <p className="mt-3 text-xs font-semibold">{ILLUSTRATIVE_BADGE}</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <article className="rounded-2xl border-2 border-brand bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Fresh for this campaign</p>
          <h2 className="mt-2 font-semibold">{fresh.vendor}</h2>
          <p className="mt-1 text-sm">List {fresh.listId}</p>
          <p className="mt-1 text-sm">Sourced {formatDemoStamp(fresh.sourcedAt)}</p>
        </article>
        <article className="rounded-2xl border border-line bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">On file, not used</p>
          <h2 className="mt-2 font-semibold">{fresh.stale.name}</h2>
          <p className="mt-1 text-sm">List {fresh.stale.listId}</p>
          <p className="mt-1 text-sm">Sourced {formatDemoStamp(fresh.stale.sourcedAt)}</p>
          <p className="mt-2 text-sm text-muted">{fresh.stale.note}</p>
        </article>
      </div>
      <ul className="mt-4 space-y-2">
        {fresh.sample.map((row) => (
          <li key={row.maid} className="rounded-xl border border-line bg-card p-4 text-sm">
            <div className="font-semibold">{row.maid}</div>
            <div className="text-muted">{row.matched ? "Marked matched in the sample file" : "Unmatched in the sample file"}</div>
            <div className="mt-1">Vendor {row.vendor} · list {row.listId}</div>
            <div>Sourced {formatDemoStamp(row.sourcedAt)}</div>
            <div className="mt-1">{BASED_ON_LABEL} {row.lineage}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Serving({ data }: { data: Presentation }) {
  const channels = demoChannels();
  return (
    <section data-tour-anchor="serving">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand">One audience</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">The same list, prepared everywhere</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
        {channels[0] ? `${channels[0].vendor}, list ${channels[0].listId}. ${channels[0].matched} of ${channels[0].uploaded} seeded ids are marked matched in the sample file.` : ""} Pixels can retarget people who engage. Nothing here calls a live platform.
      </p>
      <ul className="mt-4 grid gap-3 md:grid-cols-2">
        {channels.map((channel) => (
          <li key={channel.platform} className="rounded-2xl border border-line bg-card p-4">
            <h2 className="text-lg font-semibold">{channel.platform}</h2>
            <p className="mt-1 text-sm">List {channel.listId}</p>
            <p className="mt-1 text-sm font-semibold">{channel.status}</p>
            <p className="mt-2 text-sm text-muted">{channel.note}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-muted">AIS2L voice sits beside the ads. The table under this is the rest of the sample workspace.</p>
      {data.view === "staff" ? <p className="mt-2 text-xs font-semibold">{ILLUSTRATIVE_BADGE}. Spend in this table is seed data.</p> : <p className="mt-2 text-sm text-muted">Client view. Spend stays off this page.</p>}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="text-muted">
              <th className="py-2">Client</th>
              <th>Platform</th>
              <th>Campaign</th>
              <th>Leads</th>
              {data.view === "staff" ? <th>Illustrative spend</th> : null}
            </tr>
          </thead>
          <tbody>
            {data.serving.map((row) => (
              <tr key={row.id} className="border-t border-line">
                <td className="py-2">{row.client}</td>
                <td>{PLATFORM[row.platform] || row.platform}</td>
                <td>{row.name}</td>
                <td>{row.leads.toLocaleString("en-US")}</td>
                {data.view === "staff" && "spendCents" in row && typeof row.spendCents === "number" ? <td>{money(row.spendCents)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Segments({ data }: { data: Presentation }) {
  return (
    <section data-tour-anchor="segments">
      <h1 className="text-3xl font-semibold tracking-tight">Segment tests</h1>
      <ul className="mt-4 space-y-3">
        {data.segments.map((row) => (
          <li key={row.id} className="rounded-xl border border-line bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">{row.action}</div>
            <div className="mt-1 font-semibold">{row.name}</div>
            <p className="mt-1 text-sm text-muted">{row.client}. {row.note}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Compare({ data }: { data: Presentation }) {
  return (
    <section data-tour-anchor="compare">
      <p className="text-xs font-semibold">{data.compare.badge || ILLUSTRATIVE_BADGE}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Audience and platform targeting</h1>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <article className="rounded-xl border border-line bg-card p-4">
          <h2 className="font-semibold">Our audience</h2>
          <p className="mt-2 text-sm">{data.compare.ours}</p>
        </article>
        <article className="rounded-xl border border-line bg-card p-4">
          <h2 className="font-semibold">Platform targeting</h2>
          <p className="mt-2 text-sm">{data.compare.platform}</p>
        </article>
      </div>
      <p className="mt-4 text-sm text-muted">{data.compare.note}</p>
    </section>
  );
}

function Explanations({ data }: { data: Presentation }) {
  return (
    <section data-tour-anchor="explanations">
      <h1 className="text-3xl font-semibold tracking-tight">What {PRODUCT_WORDMARK} would say</h1>
      <ul className="mt-4 space-y-3">
        {data.bots.map((note) => (
          <li key={note.id} className="rounded-xl border border-line bg-card p-4">
            <h2 className="font-semibold">{note.title}</h2>
            <p className="mt-2 text-sm leading-6">{note.plain}</p>
            <p className="mt-2 text-sm font-semibold">{BASED_ON_LABEL} {note.basedOn}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Decisions({ data }: { data: Presentation }) {
  const attempt = demoBudgetAttempt();
  return (
    <section data-tour-anchor="decisions">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand">{DEMO_SUPPORTING_LINE}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">A bot tried. A person decides.</h1>
      <div className="mt-4">
        <DemoBudgetMoment title={attempt.title} detail={attempt.detail} basedOn={attempt.basedOn} field={attempt.field} blocked={attempt.blocked} message={attempt.message} />
      </div>
      <p className="mt-6 text-sm font-semibold">{HUMANS_CONTROL_BUDGETS}</p>
      <ul className="mt-4 space-y-3">
        {data.feed.map((item) => (
          <li key={item.id} className="rounded-xl border border-line bg-card p-4 text-sm">
            <div className="font-semibold">{item.title}</div>
            <p className="mt-1">{item.body}</p>
            <p className="mt-2 font-semibold">{BASED_ON_LABEL} {item.basedOn}</p>
          </li>
        ))}
      </ul>
      <ul className="mt-4 space-y-3">
        {data.decisions.map((item) => (
          <li key={item.id} className="rounded-xl border border-line bg-card p-4">
            <div className="font-semibold">{item.title}</div>
            <p className="mt-1 text-sm">{item.summary}</p>
            <p className="mt-2 text-sm font-semibold">{BASED_ON_LABEL} {item.basedOn}</p>
            <button type="button" disabled className="mt-3 inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-semibold opacity-70">
              Read only in the demo
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Report({ data }: { data: Presentation }) {
  const report = data.report[0];
  if (!report) return null;
  return (
    <section data-tour-anchor="report">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand">Plain English</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{report.title}</h1>
      <p className="mt-3 max-w-3xl text-base leading-7">
        Over these four sample weeks, this demo account recorded {report.weeks.reduce((sum, week) => sum + week.leads, 0)} leads and {report.weeks.reduce((sum, week) => sum + week.booked, 0)} booked visits. Booked visits are the number this report leads with. A person still approves any suggestion. This page does not send a change.
      </p>
      <p className="mt-2 text-sm font-semibold">{BASED_ON_LABEL} Gulf Coast Dental (Demo), four seeded weeks.</p>
      <p className="mt-3 text-sm text-muted">{data.view === "client" ? "Client view. Spend stays off this page." : `${ILLUSTRATIVE_BADGE}. Staff view. Spend below is seed data.`}</p>
      <ul className="mt-4 space-y-3">
        {report.weeks.map((week) => (
          <li key={week.label} className="rounded-xl border border-line bg-card p-4 text-sm">
            <div className="font-semibold">{week.label}</div>
            <p className="mt-1">{week.leads} leads · {week.booked} booked</p>
            {"spendCents" in week && typeof week.spendCents === "number" ? <p className="mt-1">{money(week.spendCents)}</p> : null}
            <p className="mt-1 text-muted">{week.note}</p>
          </li>
        ))}
      </ul>
      <h2 className="mt-6 text-lg font-semibold">Speed-to-lead</h2>
      <ul className="mt-2 space-y-2 text-sm">
        {data.leads.map((lead) => (
          <li key={lead.id}>{lead.name} · {lead.client} · {lead.secondsToLead} seconds · {lead.email}</li>
        ))}
      </ul>
    </section>
  );
}

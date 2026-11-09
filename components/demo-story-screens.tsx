import Link from "next/link";
import { PRODUCT_WORDMARK } from "@/lib/brand";
import { DEMO_FACTS } from "@/lib/demo/dataset";
import {
  CLIENT_PRICING,
  CLIENT_SETUP,
  CLIENT_WEEKLY,
  FRESH_LIST,
  INVESTOR_DISCLAIMER,
  MARKET_STATS,
  PROBLEM_FRAME,
  PROBLEM_LIMIT,
  PROBLEM_STATS,
  RESEARCH_BADGE,
  REVENUE_LEVERS,
  SAMPLE_BADGE,
  SPECIFICITY_FIGURE,
  STALE_LIST,
  WHY_NOW,
  demoChannels,
  demoVendorChecks,
  demoVerifiedGap,
  formatDemoStamp,
} from "@/lib/demo/story";
import { BASED_ON_LABEL, DEMO_SUPPORTING_LINE, DEMO_TAGLINE, renderTourSteps, tourLocation, type TourMode } from "@/lib/demo/tour";

function Kicker({ children }: { children: string }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-brand">{children}</p>;
}

function endingHref(ending: "client" | "investor", view: "staff" | "client", tourMode: TourMode | null) {
  const steps = renderTourSteps(DEMO_FACTS, ending);
  const index = steps.length - 1;
  const step = steps[index];
  if (!step || !tourMode) return ending === "client" ? `/demo/client?view=${view}` : `/demo/investor?view=${view}`;
  return tourLocation(step, tourMode, view, index, ending);
}

export function ProblemScreen() {
  const lead = PROBLEM_STATS[0];
  const rest = PROBLEM_STATS.slice(1);
  return (
    <section data-tour-anchor="problem">
      <Kicker>Opening</Kicker>
      <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight md:text-4xl">Half the web is not a person. Unprotected buying is where that shows up.</h1>
      <p className="mt-3 max-w-3xl text-base leading-7">{PROBLEM_FRAME}</p>
      <p className="mt-3 text-xs font-semibold text-muted">{RESEARCH_BADGE}</p>
      {lead ? (
        <article className="mt-6 rounded-2xl border border-line bg-card p-6">
          <p className="text-6xl font-semibold tracking-tight text-brand">{lead.figure}</p>
          <h2 className="mt-2 text-2xl font-semibold">{lead.title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6">{lead.detail}</p>
          <p className="mt-4 text-xs leading-5 text-muted">{lead.source}. {lead.date}. {lead.scope}</p>
        </article>
      ) : null}
      <ul className="mt-4 grid gap-3 md:grid-cols-3">
        {rest.map((stat) => (
          <li key={stat.id} className="rounded-2xl border border-line bg-card p-4">
            <p className="text-2xl font-semibold text-brand">{stat.figure}</p>
            <h2 className="mt-2 font-semibold">{stat.title}</h2>
            <p className="mt-2 text-sm leading-6">{stat.detail}</p>
            <p className="mt-3 text-xs leading-5 text-muted">{stat.source}. {stat.date}. {stat.scope}</p>
          </li>
        ))}
      </ul>
      <p className="mt-6 max-w-3xl text-sm leading-6 text-muted">{PROBLEM_LIMIT}</p>
    </section>
  );
}

export function VerifiedScreen() {
  const gap = demoVerifiedGap();
  const width = gap.reported > 0 ? Math.round((gap.verified / gap.reported) * 100) : 0;
  return (
    <section data-tour-anchor="verified">
      <Kicker>Counted wins</Kicker>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Verified vs platform-reported</h1>
      <p className="mt-3 max-w-3xl text-base leading-7">
        Platforms report every conversion they see. {PRODUCT_WORDMARK} counts one only when it came from a data-market MAID campaign, passed a contact check, and is not a duplicate. These rows were run through that rule.
      </p>
      <p className="mt-3 text-xs font-semibold text-muted">{SAMPLE_BADGE}. Not a client result.</p>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <article className="rounded-2xl border border-line bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Platform-reported</p>
          <p className="mt-2 text-4xl font-semibold">{gap.reported}</p>
        </article>
        <article className="rounded-2xl border border-brand bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">JAI verified</p>
          <p className="mt-2 text-4xl font-semibold text-brand">{gap.verified}</p>
        </article>
        <article className="rounded-2xl border border-line bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Not counted</p>
          <p className="mt-2 text-4xl font-semibold">{gap.gap}</p>
        </article>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-chip" role="img" aria-label={`${gap.verified} of ${gap.reported} sample conversions counted`}>
        <div className="h-full bg-brand" style={{ width: `${width}%` }} />
      </div>
      <ul className="mt-4 space-y-2">
        {gap.rows.map((row) => (
          <li key={row.id} className="rounded-xl border border-line bg-card p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{row.label}</p>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${row.status === "verified" ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>
                {row.status === "verified" ? "Verified" : "Not counted"}
              </span>
            </div>
            <p className="mt-2 text-muted">{row.reason}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function VendorScreen() {
  const report = demoVendorChecks();
  return (
    <section data-tour-anchor="vendors">
      <Kicker>Vendor honesty</Kicker>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Known fake IDs, and a holdout</h1>
      <p className="mt-3 max-w-3xl text-base leading-7">
        Each sample list is checked by mixing in IDs that are not real devices. A vendor that matches too many of them is flagged. A holdout group sees no ads, and lift is measured against that group. Nothing is sent.
      </p>
      <p className="mt-3 text-xs font-semibold text-muted">{SAMPLE_BADGE}. The matched-fake count on the flagged list is a sample input.</p>
      <ul className="mt-6 grid gap-3 md:grid-cols-2">
        {report.checks.map((check) => {
          const seed = check.flags.find((flag) => flag.code === "seed" || flag.code === "seed_unreliable");
          return (
            <li key={check.id} className={`rounded-2xl border bg-card p-5 ${check.tone === "flagged" ? "border-brand" : "border-line"}`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{check.tone === "flagged" ? "Flagged" : "Within the check"}</p>
              <h2 className="mt-2 text-xl font-semibold">{check.vendor}</h2>
              <p className="mt-1 text-sm text-muted">List {check.listId} · {check.size.toLocaleString("en-US")} sample rows</p>
              {seed ? <p className="mt-3 text-sm leading-6">{seed.message}</p> : null}
            </li>
          );
        })}
      </ul>
      <article className="mt-4 rounded-2xl border border-line bg-card p-5">
        <h2 className="text-xl font-semibold">Holdout lift</h2>
        <p className="mt-2 text-sm leading-6">{report.holdout.message}</p>
        <p className="mt-2 text-sm text-muted">
          Sample inputs: {report.holdout.exposedConversions} conversions in the exposed group of {report.holdout.exposedSize}, and {report.holdout.holdoutConversions} in the holdout of {report.holdout.holdoutSize}.
        </p>
        <p className="mt-2 text-xs text-muted">{report.holdout.note}</p>
      </article>
      <p className="mt-4 text-xs leading-5 text-muted">{report.policy} These checks recommend only.</p>
    </section>
  );
}

export function CloseScreen({ view, tourMode }: { view: "staff" | "client"; tourMode: TourMode | null }) {
  const cards = [
    {
      href: endingHref("client", view, tourMode),
      kicker: "Client",
      title: "What you would get",
      body: "Setup, the weekly view, and pricing placeholders. No quote.",
    },
    {
      href: endingHref("investor", view, tourMode),
      kicker: "Investor",
      title: "Why this market, why now",
      body: "The problem, the proof screens, public market size, and business lines. Specificity figures are placeholders.",
    },
  ];
  return (
    <section data-tour-anchor="close">
      <Kicker>Ending</Kicker>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Choose the room</h1>
      <p className="mt-3 max-w-3xl text-base leading-7">The tour is the same up to here. Pick the ending for the people in front of you. You can switch after.</p>
      <ul className="mt-6 grid gap-3 md:grid-cols-2">
        {cards.map((card) => (
          <li key={card.kicker}>
            <Link href={card.href} className="block h-full rounded-2xl border border-line bg-card p-5 hover:border-brand">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand">{card.kicker}</p>
              <h2 className="mt-2 text-2xl font-semibold">{card.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">{card.body}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ClientEndingScreen({ view }: { view: "staff" | "client" }) {
  return (
    <section data-tour-anchor="client-ending">
      <Kicker>Client ending</Kicker>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{DEMO_TAGLINE}</h1>
      <p className="mt-2 text-sm font-semibold">{DEMO_SUPPORTING_LINE}</p>
      <p className="mt-3 max-w-3xl text-base leading-7">Here is the setup, the weekly view, and where a price would go. Nothing on this page is a quote.</p>
      <p className="mt-3 text-xs font-semibold text-muted">{SAMPLE_BADGE}</p>
      <h2 className="mt-8 text-xl font-semibold">Setup</h2>
      <ol className="mt-3 space-y-3">
        {CLIENT_SETUP.map((step, index) => (
          <li key={step} className="flex gap-3 rounded-xl border border-line bg-card p-4">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-on-brand">{index + 1}</span>
            <p className="text-sm leading-6">{step}</p>
          </li>
        ))}
      </ol>
      <h2 className="mt-8 text-xl font-semibold">What you will see each week</h2>
      <ul className="mt-3 space-y-2">
        {CLIENT_WEEKLY.map((item) => (
          <li key={item} className="rounded-xl border border-line bg-card px-4 py-3 text-sm leading-6">{item}</li>
        ))}
      </ul>
      <h2 className="mt-8 text-xl font-semibold">Pricing</h2>
      <p className="mt-2 text-sm text-muted">Placeholders until a signed figure exists. Not a quote.</p>
      <ul className="mt-3 grid gap-3 md:grid-cols-3">
        {CLIENT_PRICING.map((item) => (
          <li key={item.title} className="rounded-2xl border border-line bg-card p-4">
            <p className="font-semibold">{item.title}</p>
            <p className="mt-2 font-mono text-sm text-brand">{item.figure}</p>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/contact" className="btn-brand inline-flex min-h-11 items-center rounded-full px-5 text-sm">Book a call</Link>
        <Link href={`/demo/close?view=${view}`} className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-semibold">Switch ending</Link>
      </div>
    </section>
  );
}

export function InvestorScreen({ view }: { view: "staff" | "client" }) {
  const proof = [
    { href: `/demo/problem?view=${view}`, label: "The problem, with sources" },
    { href: `/demo/audiences?view=${view}`, label: "A fresh list, with lineage" },
    { href: `/demo/serving?view=${view}`, label: "One audience, four channels" },
    { href: `/demo/verified?view=${view}`, label: "Verified conversions" },
    { href: `/demo/decisions?view=${view}`, label: "A person approves" },
    { href: `/demo/vendors?view=${view}`, label: "Vendor honesty checks" },
  ];
  return (
    <section data-tour-anchor="investor">
      <div className="rounded-2xl bg-ink px-5 py-6 text-on-ink">
        <Kicker>Investor ending</Kicker>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{DEMO_TAGLINE}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6">{DEMO_SUPPORTING_LINE}. Public market size is below. Every Specificity number is {SPECIFICITY_FIGURE}.</p>
      </div>
      <h2 className="mt-8 text-xl font-semibold">The market</h2>
      <p className="mt-2 text-xs font-semibold text-muted">Public market size. Not this account. Not a Specificity result.</p>
      <ul className="mt-3 grid gap-3 md:grid-cols-2">
        {MARKET_STATS.map((stat) => (
          <li key={stat.figure} className="rounded-2xl border border-line bg-card p-5">
            <p className="text-4xl font-semibold text-brand">{stat.figure}</p>
            <h3 className="mt-2 text-lg font-semibold">{stat.title}</h3>
            <p className="mt-2 text-sm">{stat.detail}</p>
            <p className="mt-3 text-xs leading-5 text-muted">{stat.source}. {stat.date}.</p>
          </li>
        ))}
      </ul>
      <h2 className="mt-8 text-xl font-semibold">Proof you just saw</h2>
      <ul className="mt-3 grid gap-2 md:grid-cols-2">
        {proof.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="block rounded-xl border border-line bg-card px-4 py-3 text-sm font-semibold">{item.label}</Link>
          </li>
        ))}
      </ul>
      <h2 className="mt-8 text-xl font-semibold">Revenue levers</h2>
      <p className="mt-2 text-sm text-muted">Each line is a way the business can earn. The figure is a placeholder. No return is promised.</p>
      <ul className="mt-3 space-y-2">
        {REVENUE_LEVERS.map((lever) => (
          <li key={lever.title} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line bg-card p-4">
            <div>
              <p className="font-semibold">{lever.title}</p>
              <p className="mt-1 text-sm leading-6 text-muted">{lever.body}</p>
            </div>
            <p className="font-mono text-sm text-brand">{lever.figure}</p>
          </li>
        ))}
      </ul>
      <h2 className="mt-8 text-xl font-semibold">Why now</h2>
      <ul className="mt-3 space-y-2">
        {WHY_NOW.map((item) => (
          <li key={item} className="rounded-xl border border-line bg-card px-4 py-3 text-sm leading-6">{item}</li>
        ))}
      </ul>
      <aside className="mt-8 rounded-2xl border border-brand bg-card p-5">
        <h2 className="font-semibold">Forward-looking statements</h2>
        <p className="mt-2 text-sm leading-6">{INVESTOR_DISCLAIMER}</p>
        <p className="mt-3 text-xs font-semibold text-muted">{BASED_ON_LABEL} published market reports named above, and sample screens in this demo. Subject to counsel review.</p>
      </aside>
      <div className="mt-6">
        <Link href={`/demo/close?view=${view}`} className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-semibold">Switch ending</Link>
      </div>
    </section>
  );
}

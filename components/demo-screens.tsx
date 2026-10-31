import Link from "next/link";
import { DemoEntry } from "@/components/demo-entry";
import { BASED_ON_LABEL, HUMANS_CONTROL_BUDGETS, ILLUSTRATIVE_BADGE } from "@/lib/demo/tour";
import type { presentDemo } from "@/lib/demo/present";

type Presentation = ReturnType<typeof presentDemo>;
export type DemoScreenId = "problem" | "audiences" | "serving" | "segments" | "compare" | "explanations" | "decisions" | "report";

const NAV: Array<{ href: string; label: string; id: DemoScreenId }> = [
  { href: "/demo", label: "Overview", id: "problem" },
  { href: "/demo/audiences", label: "Audiences", id: "audiences" },
  { href: "/demo/serving", label: "Serving", id: "serving" },
  { href: "/demo/segments", label: "Audience Data", id: "segments" },
  { href: "/demo/compare", label: "Compare", id: "compare" },
  { href: "/demo/explanations", label: "Explanations", id: "explanations" },
  { href: "/demo/decisions", label: "Decisions", id: "decisions" },
  { href: "/demo/report", label: "Report", id: "report" },
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
}: {
  screen: DemoScreenId;
  data: Presentation;
  tourEnabled: boolean;
}) {
  const view = data.view;
  const q = `view=${view}`;
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 pb-40">
      <nav className="mb-4 flex gap-2 overflow-x-auto" aria-label="Demo">
        {NAV.map((item) => (
          <Link key={item.href} href={`${item.href}?${q}`} className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-3 text-sm ${item.id === screen ? "bg-hover font-semibold" : ""}`}>
            {item.label}
          </Link>
        ))}
      </nav>
      {screen === "problem" ? <DemoEntry view={view} tourEnabled={tourEnabled} /> : null}
      {screen === "problem" ? <Problem data={data} /> : null}
      {screen === "audiences" ? <Audiences data={data} /> : null}
      {screen === "serving" ? <Serving data={data} /> : null}
      {screen === "segments" ? <Segments data={data} /> : null}
      {screen === "compare" ? <Compare data={data} /> : null}
      {screen === "explanations" ? <Explanations data={data} /> : null}
      {screen === "decisions" ? <Decisions data={data} /> : null}
      {screen === "report" ? <Report data={data} /> : null}
    </div>
  );
}

function Problem({ data }: { data: Presentation }) {
  return (
    <section data-tour-anchor="problem">
      <h1 className="text-3xl font-semibold tracking-tight">Four fictional clients</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">These businesses exist only in the demo tenant. Platform targeting in the sample accounts is the weak baseline the rest of the tour answers.</p>
      <ul className="mt-4 grid gap-3 md:grid-cols-2">
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
  return (
    <section data-tour-anchor="audience">
      <h1 className="text-3xl font-semibold tracking-tight">Data market audience</h1>
      <p className="mt-2 text-sm text-muted">Fake MAID upload for Harbor Point Marine (Demo). {data.audiences.matched} of {data.audiences.uploaded} seeded ids are marked matched.</p>
      <ul className="mt-4 space-y-2">
        {data.audiences.sample.map((row) => (
          <li key={row.maid} className="rounded-xl border border-line bg-card p-4 text-sm">
            <div className="font-semibold">{row.maid}</div>
            <div className="text-muted">{row.matched ? "Matched in the demo file" : "Unmatched in the demo file"}</div>
            <div className="mt-1">{BASED_ON_LABEL} {row.lineage}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Serving({ data }: { data: Presentation }) {
  return (
    <section data-tour-anchor="serving">
      <h1 className="text-3xl font-semibold tracking-tight">Where the demo serves</h1>
      <p className="mt-2 text-sm text-muted">Meta, Google, TikTok, StackAdapt, and AIS2L voice. Read only.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="text-muted">
              <th className="py-2">Client</th>
              <th>Platform</th>
              <th>Campaign</th>
              <th>Leads</th>
              {data.view === "staff" ? <th>Spend</th> : null}
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
    <section data-tour-anchor="bots">
      <h1 className="text-3xl font-semibold tracking-tight">What Jarvis would say</h1>
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
  return (
    <section data-tour-anchor="feed">
      <h1 className="text-3xl font-semibold tracking-tight">Feed and decisions</h1>
      <p className="mt-3 rounded-xl border border-line bg-warning-soft px-4 py-3 text-sm font-semibold">{HUMANS_CONTROL_BUDGETS}</p>
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
      <h1 className="text-3xl font-semibold tracking-tight">{report.title}</h1>
      <p className="mt-2 text-sm text-muted">{data.view === "client" ? "Client view. Cost stays off this page." : "Staff view. Cost is visible here."}</p>
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

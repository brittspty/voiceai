import { brandTokens } from "@/lib/brand/tokens";
import { BRAND_TAGLINE, BRAND_WORDMARK } from "@/lib/brand";
import { PLAN_START_LABEL, type DashboardNumbers } from "@/lib/plans/plan";

export type PlanDocumentModel = {
  clientName: string;
  logoSrc: string | null;
  goals: string;
  channels: string[];
  audiences: string[];
  segments: string[];
  timeline: string;
  weekly: string;
  ctaLabel: string;
  ctaHref: string;
  dashboard: DashboardNumbers;
  showCost: boolean;
  preview?: boolean;
};

export function PlanDocument({ plan }: { plan: PlanDocumentModel }) {
  const tone = brandTokens.light;
  return (
    <article style={{ background: tone.canvas, color: tone.ink, fontFamily: brandTokens.font.stack }} className="min-h-screen">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm" style={{ color: tone.muted }}>{BRAND_WORDMARK} · {BRAND_TAGLINE}</p>
        {plan.preview ? <p className="mt-4 rounded-xl border px-4 py-3 text-sm font-semibold" style={{ borderColor: tone.line, background: tone.card }}>Staff preview. This link is not shareable yet.</p> : null}
        <header className="mt-6 flex items-center gap-4">
          {plan.logoSrc ? <span aria-hidden="true" className="inline-block h-14 w-14 rounded-xl bg-contain bg-center bg-no-repeat" style={{ backgroundColor: tone.card, backgroundImage: `url("${plan.logoSrc}")` }} /> : null}
          <h1 className="text-4xl font-semibold tracking-tight">{plan.clientName}</h1>
        </header>
        {plan.goals ? <p className="mt-6 text-lg leading-8">{plan.goals}</p> : null}
        <Section title="Channels we will run" items={plan.channels} />
        <Section title="Audiences to test" items={plan.audiences} />
        <Section title="Segments to test" items={plan.segments} />
        <section className="mt-8 rounded-2xl border p-5" style={{ borderColor: tone.line, background: tone.card }}>
          <h2 className="text-lg font-semibold">Sample dashboard</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
            <Stat label="Impressions" value={plan.dashboard.impressions.toLocaleString("en-US")} />
            <Stat label="Clicks" value={plan.dashboard.clicks.toLocaleString("en-US")} />
            <Stat label="Leads" value={plan.dashboard.leads.toLocaleString("en-US")} />
            {plan.showCost && plan.dashboard.spendCents !== undefined ? <Stat label="Spend" value={(plan.dashboard.spendCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} /> : null}
            {plan.showCost && plan.dashboard.roas !== undefined ? <Stat label="ROAS" value={String(plan.dashboard.roas)} /> : null}
          </dl>
        </section>
        {plan.timeline ? <Block title="Timeline" body={plan.timeline} /> : null}
        {plan.weekly ? <Block title="What you will see each week" body={plan.weekly} /> : null}
        <a href={plan.ctaHref} className="btn-brand mt-8 inline-flex min-h-11 items-center rounded-full px-5 text-sm">{plan.ctaLabel || PLAN_START_LABEL}</a>
      </div>
    </article>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </section>
  );
}

function Block({ title, body }: { title: string; body: string }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{body}</p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt style={{ color: brandTokens.light.muted }}>{label}</dt>
      <dd className="text-xl font-semibold">{value}</dd>
    </div>
  );
}

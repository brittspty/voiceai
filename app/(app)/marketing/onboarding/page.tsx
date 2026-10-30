import Link from "next/link";
import { redirect } from "next/navigation";
import { LeadValueForm } from "@/components/lead-value-form";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { roleLabel } from "@/lib/marketing/access";
import { clientLinksEnabled, dashboardsV2Enabled } from "@/lib/marketing/config";
import { canEditLeadValue, formatCents } from "@/lib/marketing/lead-value";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

const STEPS = ["Client details", "Connect Meta ad account", "Assign Specificity team", "Lead value", "Invite client viewers", "Review and finish"];

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  if (!dashboardsV2Enabled()) redirect("/marketing");
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (access.kind === "client_viewer") redirect("/marketing/client");
  if (!canEditLeadValue(access) || !access.workspaceId) redirect("/marketing");
  const requested = Number((await searchParams).step || "4");
  const step = requested >= 1 && requested <= 6 ? requested : 4;
  const [org, settings] = await Promise.all([
    prisma.org.findUnique({ where: { id: "org" }, select: { name: true } }),
    prisma.clientSettings.findUnique({ where: { workspaceId: access.workspaceId }, include: { leadValueSetBy: { select: { name: true, role: true } } } }),
  ]);
  const client = org?.name || "This client";

  return (
    <div className="mx-auto grid max-w-[980px] gap-6 md:grid-cols-[250px_1fr]">
      <nav aria-label="Onboarding steps">
        <ol className="flex gap-3 overflow-x-auto md:block">
          {STEPS.map((label, index) => {
            const number = index + 1;
            const done = number < step;
            const current = number === step;
            return (
              <li key={label} className={`flex min-h-11 items-center gap-2.5 py-2 ${current ? "font-semibold text-ink" : "text-muted"} ${done ? "text-ink" : ""}`}>
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-xs font-semibold ${done ? "border-success bg-success text-white" : current ? "border-brand text-brand-ink" : "border-line"}`}>
                  {done ? "✓" : number}
                </span>
                <span className="max-md:max-w-10 max-md:overflow-hidden max-md:whitespace-nowrap">{label}</span>
              </li>
            );
          })}
        </ol>
      </nav>
      <main className="rounded-2xl border border-line bg-card p-6">
        <p className="text-[13px] text-muted">Step {step} of 6 · {client}</p>
        {step === 4 ? (
          <>
            <h1 className="text-xl font-semibold">What is a lead worth to this client?</h1>
            <p className="mb-4 text-[13px] text-muted">We use this only to estimate ROAS in this client&apos;s dashboard. The client never sees it. You can change it later in the client&apos;s dashboard.</p>
            <div className="mb-4 rounded-lg border-l-4 border-brand bg-warning-soft px-3 py-2.5 text-[13px]">
              Ask the client: &quot;On average, what is one new lead worth to you?&quot; If phone calls are worth more, add a call value too.
            </div>
            <LeadValueForm
              initialLead={settings?.leadValueCents != null ? (settings.leadValueCents / 100).toFixed(2) : ""}
              initialCall={settings?.callValueCents != null ? (settings.callValueCents / 100).toFixed(2) : ""}
              submitLabel="Save and continue"
              backHref="/marketing/onboarding?step=3"
              skipHref="/marketing/onboarding?step=5"
              next="/marketing/onboarding?step=5"
              byline={`Will be saved as set by ${user.name} (${roleLabel(user.role)}) with the date and time.`}
            />
          </>
        ) : step < 4 ? (
          <>
            <h1 className="text-xl font-semibold">{STEPS[step - 1]}</h1>
            <p className="mb-4 text-[13px] text-muted">
              {step === 2
                ? "The Meta account for this deployment is connected in server settings. This screen does not connect to Meta and does not change an ad account or a budget."
                : "This step is recorded with the workspace. This screen does not write to an ad account or a budget."}
            </p>
            <div className="flex flex-wrap justify-between gap-2">
              <Link className="inline-flex min-h-11 items-center rounded-[10px] border border-line px-4 font-semibold" href={step === 1 ? "/marketing" : `/marketing/onboarding?step=${step - 1}`}>← Back</Link>
              <Link className="inline-flex min-h-11 items-center rounded-[10px] bg-ink px-4 font-semibold text-on-ink" href={`/marketing/onboarding?step=${step + 1}`}>Continue</Link>
            </div>
          </>
        ) : step === 5 ? (
          <>
            <h1 className="text-xl font-semibold">Invite client viewers</h1>
            <p className="mb-4 text-[13px] text-muted">Client viewers and share links never see spend, budgets, estimated ROAS, or an ad account id.</p>
            {clientLinksEnabled() ? (
              <p className="mb-4 text-sm"><Link className="font-semibold text-info underline" href="/marketing/links">Open shared links</Link></p>
            ) : (
              <p className="mb-4 text-sm text-muted">Client logins stay off until an owner turns them on. You can finish without inviting anyone.</p>
            )}
            <div className="flex flex-wrap justify-between gap-2">
              <Link className="inline-flex min-h-11 items-center rounded-[10px] border border-line px-4 font-semibold" href="/marketing/onboarding?step=4">← Back</Link>
              <Link className="inline-flex min-h-11 items-center rounded-[10px] bg-ink px-4 font-semibold text-on-ink" href="/marketing/onboarding?step=6">Continue</Link>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">Review and finish</h1>
            <p className="mb-4 text-[13px] text-muted">Estimated ROAS uses the lead value below. Leave it unset and ROAS stays hidden.</p>
            {settings?.leadValueCents != null ? (
              <p className="mb-4 text-sm">
                Per lead <b>{formatCents(settings.leadValueCents)}</b>
                {" · "}
                Per call <b>{settings.callValueCents == null ? "Same as lead" : formatCents(settings.callValueCents)}</b>
                {settings.leadValueSetBy ? ` · Set by ${settings.leadValueSetBy.name} (${roleLabel(settings.leadValueSetBy.role)})` : ""}
              </p>
            ) : (
              <p className="mb-4 rounded-lg border border-dashed border-brand bg-warning-soft p-2.5 text-sm">No lead value set yet. Estimated ROAS is hidden until you add one.</p>
            )}
            <div className="flex flex-wrap justify-between gap-2">
              <Link className="inline-flex min-h-11 items-center rounded-[10px] border border-line px-4 font-semibold" href="/marketing/onboarding?step=5">← Back</Link>
              <Link className="inline-flex min-h-11 items-center rounded-[10px] bg-ink px-4 font-semibold text-on-ink" href="/marketing">Finish</Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { LeadBoard } from "@/components/lead-board";
import { PageTitle } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { leadScoringEnabled } from "@/lib/marketing/config";
import { markAudience } from "@/lib/marketing/lead-score/permissions";
import { leadScopeFor } from "@/lib/marketing/lead-score/scope";
import { listLeadRows, scoreMissingLeads } from "@/lib/marketing/lead-score/store";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { one, type SP } from "@/lib/params";

export const dynamic = "force-dynamic";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (access.kind === "client_viewer") redirect("/marketing/client");
  if (access.kind === "none") redirect("/");
  if (!leadScoringEnabled()) {
    return <PageTitle title="Leads" subtitle="Lead quality scoring is off." />;
  }
  let rows: Awaited<ReturnType<typeof listLeadRows>> = [];
  try {
    const scope = leadScopeFor(access);
    await scoreMissingLeads(scope);
    rows = await listLeadRows(scope);
  } catch {
    return (
      <div>
        <PageTitle title="Leads" subtitle="Form leads and call transcripts." />
        <div className="rounded-xl border border-line bg-card p-6 text-sm">
          <p>Couldn&apos;t load leads.</p>
          <Link className="mt-3 inline-flex min-h-11 items-center underline" href="/marketing/leads">
            Try again
          </Link>
          <p className="mt-2 text-muted">Contact your account manager if this keeps happening.</p>
        </div>
      </div>
    );
  }
  const filter = one(await searchParams, "quality");
  return (
    <div>
      <PageTitle title="Leads" subtitle="Quality of form leads and call transcripts." />
      <LeadBoard key={rows.map((row) => `${row.id}:${row.manualAt ?? ""}:${row.effectiveLabel}`).join("|")} rows={rows} audience={markAudience(access)} filter={filter} exampleData={false} />
    </div>
  );
}

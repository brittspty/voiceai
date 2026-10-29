import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LeadBoard } from "@/components/lead-board";
import { PageTitle } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { leadScoringEnabled } from "@/lib/marketing/config";
import { markAudience } from "@/lib/marketing/lead-score/permissions";
import { getLeadRow } from "@/lib/marketing/lead-score/store";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (access.kind === "client_viewer") redirect("/marketing/client");
  if (access.kind === "none") redirect("/");
  if (!leadScoringEnabled()) {
    return <PageTitle title="Lead" subtitle="Lead quality scoring is off." />;
  }
  const { id } = await params;
  const row = await getLeadRow(id);
  if (!row) notFound();
  return (
    <div>
      <PageTitle title={row.name} subtitle="Automatic score and your mark are kept separate." action={<Link href="/marketing/leads" className="inline-flex min-h-11 items-center text-sm underline">All leads</Link>} />
      <LeadBoard rows={[row]} audience={markAudience(access)} filter="" exampleData={false} mode="detail" />
    </div>
  );
}

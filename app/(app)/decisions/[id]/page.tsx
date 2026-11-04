import { notFound, redirect } from "next/navigation";
import { DecisionsInbox } from "@/components/jarvis/inbox";
import { DecisionDetail } from "@/components/jarvis/decisions-v1";
import { RealEmpty } from "@/components/jarvis/real-home";
import { requireUser } from "@/lib/auth";
import { denyAccess } from "@/lib/deny";
import type { SP } from "@/lib/params";
import { jarvisUiV2Enabled } from "@/lib/marketing/config";
import { decisionsRequestStatus, decisionsView } from "@/lib/marketing/decisions/access";
import { loadDecisionDetail } from "@/lib/marketing/decisions/query";
import { realViewSearch } from "@/lib/marketing/real-view";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export default async function DecisionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  if (!jarvisUiV2Enabled()) redirect("/");
  const view = decisionsView();
  if (view !== "v1") {
    if (view === "empty") return <RealEmpty title="Decisions" detail="No data yet." />;
    const { id } = await params;
    const user = await requireUser();
    const access = await loadMarketingAccess(user);
    return (
      <DecisionsInbox
        selectedId={id}
        viewer={{ userId: user.id, kind: access.kind, seesCost: access.seesCost, creativeApprovalsEnabled: false }}
      />
    );
  }
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  const status = decisionsRequestStatus({ surface: "page", enabled: true, signedIn: true, kind: access.kind });
  if (status === 403) denyAccess();
  const { id } = await params;
  const loaded = await loadDecisionDetail(id, access);
  if (!loaded || loaded.hidden) notFound();
  const query = await searchParams;
  const days = String(query.d || query.days || "7");
  const parsedDays = days === "14" || days === "30" || days === "90" ? Number(days) : 7;
  const statusFilter = query.st === "paused" || query.st === "active" ? query.st : query.st === "all" ? "" : "active";
  const client = typeof query.client === "string" ? query.client : "";
  const back = realViewSearch({
    days: parsedDays as 7 | 14 | 30 | 90,
    status: statusFilter,
    staff: true,
    clientId: client || null,
    path: "/decisions",
  });
  return <DecisionDetail card={loaded.card} canAct={loaded.canAct} audits={loaded.audits} back={back} />;
}

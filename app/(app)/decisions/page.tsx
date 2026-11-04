import { redirect } from "next/navigation";
import { DecisionsInbox } from "@/components/jarvis/inbox";
import { DecisionsV1 } from "@/components/jarvis/decisions-v1";
import { RealEmpty } from "@/components/jarvis/real-home";
import { requireUser } from "@/lib/auth";
import { denyAccess } from "@/lib/deny";
import type { SP } from "@/lib/params";
import { jarvisUiV2Enabled } from "@/lib/marketing/config";
import { decisionsRequestStatus, decisionsView } from "@/lib/marketing/decisions/access";
import { loadDecisionList } from "@/lib/marketing/decisions/query";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export default async function DecisionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!jarvisUiV2Enabled()) redirect("/");
  const view = decisionsView();
  if (view !== "v1") {
    if (view === "empty") return <RealEmpty title="Decisions" detail="No data yet." />;
    const user = await requireUser();
    const access = await loadMarketingAccess(user);
    return (
      <DecisionsInbox
        viewer={{ userId: user.id, kind: access.kind, seesCost: access.seesCost, creativeApprovalsEnabled: false }}
      />
    );
  }
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  const status = decisionsRequestStatus({ surface: "page", enabled: true, signedIn: true, kind: access.kind });
  if (status === 403) denyAccess();
  const model = await loadDecisionList(access, await searchParams);
  return <DecisionsV1 model={model} />;
}

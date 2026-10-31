import { redirect } from "next/navigation";
import { DecisionsInbox } from "@/components/jarvis/inbox";
import { requireUser } from "@/lib/auth";
import { jarvisUiV2Enabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export default async function DecisionPage({ params }: { params: Promise<{ id: string }> }) {
  if (!jarvisUiV2Enabled()) redirect("/");
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

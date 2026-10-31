import { redirect } from "next/navigation";
import { DecisionsInbox } from "@/components/jarvis/inbox";
import { requireUser } from "@/lib/auth";
import { jarvisUiV2Enabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export default async function DecisionsPage() {
  if (!jarvisUiV2Enabled()) redirect("/");
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  return (
    <DecisionsInbox
      viewer={{ userId: user.id, kind: access.kind, seesCost: access.seesCost, creativeApprovalsEnabled: false }}
    />
  );
}

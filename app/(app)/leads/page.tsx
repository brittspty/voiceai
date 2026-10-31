import { redirect } from "next/navigation";
import { LeadsPage } from "@/components/jarvis/pages";
import { requireUser } from "@/lib/auth";
import { canMarkLead } from "@/lib/marketing/channels/speed";
import { jarvisUiV2Enabled } from "@/lib/marketing/config";

export const dynamic = "force-dynamic";

export default async function LeadsRoute() {
  if (!jarvisUiV2Enabled()) redirect("/marketing/leads");
  const user = await requireUser();
  return <LeadsPage canMark={canMarkLead(user.role)} />;
}

import { redirect } from "next/navigation";
import { SettingsConnections } from "@/components/jarvis/pages";
import { requireUser } from "@/lib/auth";
import { jarvisUiV2Enabled } from "@/lib/marketing/config";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  if (!jarvisUiV2Enabled()) redirect("/settings/integrations");
  await requireUser();
  return <SettingsConnections />;
}

import { redirect } from "next/navigation";
import { ReportsPage } from "@/components/jarvis/pages";
import { requireUser } from "@/lib/auth";
import { jarvisUiV2Enabled } from "@/lib/marketing/config";
import { SHARE_LINK_DEFAULT_MS } from "@/lib/marketing/share-link";

export const dynamic = "force-dynamic";

export default async function ReportsRoute() {
  if (!jarvisUiV2Enabled()) redirect("/marketing/links");
  await requireUser();
  return <ReportsPage expiryDays={SHARE_LINK_DEFAULT_MS / 86_400_000} />;
}

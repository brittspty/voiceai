import { redirect } from "next/navigation";
import { NoAccess } from "@/components/no-access";
import { requireUser } from "@/lib/auth";
import { jarvisUiV2Enabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  if (!jarvisUiV2Enabled()) redirect("/");
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (!access.seesCost) return <NoAccess title="Insights" />;
  return (
    <main className="jarvis" style={{ padding: 32 }}>
      <h1>Insights</h1>
      <p>Cross-client learning is staff only.</p>
    </main>
  );
}

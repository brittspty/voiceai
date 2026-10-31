import { forbidden, redirect } from "next/navigation";
import { InsightsScreen } from "@/components/insights-screen";
import { NoAccess } from "@/components/no-access";
import { requireUser } from "@/lib/auth";
import { buildInsights, EXAMPLE_INSIGHT_OBSERVATIONS, insightsEnabled, insightsHttpStatus } from "@/lib/insights/learn";
import { jarvisUiV2Enabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  if (insightsEnabled()) {
    const user = await requireUser();
    const access = await loadMarketingAccess(user);
    const status = insightsHttpStatus({ enabled: true, signedIn: true, kind: access.kind, share: false });
    if (status !== 200) forbidden();
    return <InsightsScreen cards={buildInsights(EXAMPLE_INSIGHT_OBSERVATIONS)} />;
  }
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

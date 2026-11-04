import { CtvAttributionLive } from "@/components/ctv-attribution-live";
import { CtvAttributionView } from "@/components/ctv-attribution-view";
import { NoAccess } from "@/components/no-access";
import { PageTitle } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { ctvAttributionEnabled, stackAdaptCtvLiveEnabled } from "@/lib/marketing/config";
import { loadCtvAttributionPage } from "@/lib/marketing/ctv/attribution-query";
import { releaseCtvAttribution, VIEW_THROUGH_LABEL } from "@/lib/marketing/ctv/attribution";
import { ctvPayloadForViewer } from "@/lib/marketing/ctv/report";
import { loadCtvAttributionView } from "@/lib/marketing/ctv/sync";
import { canViewCtvAttribution } from "@/lib/marketing/feature-access";
import { canSwitchMarketingClient } from "@/lib/marketing/access";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { parseRealViewQuery } from "@/lib/marketing/real-view";
import { one, type SP } from "@/lib/params";

export const dynamic = "force-dynamic";

export default async function CtvAttributionPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  const staff = canViewCtvAttribution(access);
  if (!ctvAttributionEnabled()) {
    return (
      <div>
        <PageTitle title={staff ? "CTV (StackAdapt)" : "CTV"} subtitle="CTV attribution is turned off." />
      </div>
    );
  }
  if (!staff) return <NoAccess title="CTV" />;
  if (stackAdaptCtvLiveEnabled()) {
    const query = await searchParams;
    const picker = canSwitchMarketingClient(access);
    const view = parseRealViewQuery(query, picker);
    const loaded = await loadCtvAttributionPage({
      access,
      requestedClientId: one(query, "client") || null,
      days: view.days,
      status: view.status,
      path: "/marketing/ctv",
    });
    const surface = access.seesCost ? "staff" : "staff_nocost";
    const model = loaded ? releaseCtvAttribution(loaded, surface) : null;
    return (
      <div>
        <PageTitle title="CTV (StackAdapt)" subtitle={VIEW_THROUGH_LABEL} />
        {model ? <CtvAttributionLive model={model} /> : <p className="text-sm text-muted">No CTV attribution stored yet.</p>}
      </div>
    );
  }
  const audience = access.seesCost ? "staff" : "staff_nocost";
  const view = ctvPayloadForViewer(await loadCtvAttributionView(), audience);
  return (
    <div>
      <PageTitle title="CTV (StackAdapt)" subtitle="Read only. Jason's 7-day click and 1-day view sit beside the platform window." />
      <CtvAttributionView view={view} showMoney={audience === "staff"} />
    </div>
  );
}

import { CtvAttributionView } from "@/components/ctv-attribution-view";
import { NoAccess } from "@/components/no-access";
import { PageTitle } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { ctvAttributionEnabled } from "@/lib/marketing/config";
import { loadCtvAttributionView } from "@/lib/marketing/ctv/sync";
import { ctvPayloadForViewer } from "@/lib/marketing/ctv/report";
import { canViewCtvAttribution } from "@/lib/marketing/feature-access";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export default async function CtvAttributionPage() {
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
  const audience = access.seesCost ? "staff" : "staff_nocost";
  const view = ctvPayloadForViewer(await loadCtvAttributionView(), audience);
  return (
    <div>
      <PageTitle title="CTV (StackAdapt)" subtitle="Read only. Jason's 7-day click and 1-day view sit beside the platform window." />
      <CtvAttributionView view={view} showMoney={audience === "staff"} />
    </div>
  );
}

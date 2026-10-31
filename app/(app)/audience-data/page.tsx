import { AudienceDataList } from "@/components/audience-data/screens";
import { NoAccess } from "@/components/no-access";
import { requireUser } from "@/lib/auth";
import { canOpenAudienceData, listAudienceSources, listClientSources } from "@/lib/marketing/audience-data/present";
import { resolutionSummaries } from "@/lib/marketing/audience-data/resolution";
import { audienceDataClientEnabled, audienceDataEnabled, resolutionDataEnabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

function turnedOff() {
  return (
    <main>
      <h1>Audience Data</h1>
      <p>Audience Data is turned off.</p>
    </main>
  );
}

export default async function AudienceDataPage() {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  const client = access.kind === "client_owner" || access.kind === "client_viewer";
  if (client) {
    if (!audienceDataClientEnabled()) return turnedOff();
    const list = listClientSources({ accountId: access.workspaceId, reader: "client" });
    const resolutionRates = resolutionDataEnabled() ? resolutionSummaries({ reader: "client", accountId: access.workspaceId }) : undefined;
    return <AudienceDataList mode="client" rows={list.rows} campaigns={list.campaigns} accountName={list.accountName} resolutionRates={resolutionRates} />;
  }
  if (!audienceDataEnabled()) return turnedOff();
  if (!canOpenAudienceData(access.kind)) return <NoAccess title="Audience Data" />;
  const list = listAudienceSources({ reader: "staff" });
  const resolutionRates = resolutionDataEnabled() ? resolutionSummaries({ reader: "staff" }) : undefined;
  return <AudienceDataList mode="staff" rows={list.rows} campaigns={list.campaigns} resolutionRates={resolutionRates} />;
}

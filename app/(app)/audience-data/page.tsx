import { AudienceDataList } from "@/components/audience-data/screens";
import { NoAccess } from "@/components/no-access";
import { requireUser } from "@/lib/auth";
import { canOpenAudienceData, listAudienceSources, listClientSources } from "@/lib/marketing/audience-data/present";
import { audienceDataClientEnabled, audienceDataEnabled } from "@/lib/marketing/config";
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
    return <AudienceDataList mode="client" rows={list.rows} campaigns={list.campaigns} accountName={list.accountName} />;
  }
  if (!audienceDataEnabled()) return turnedOff();
  if (!canOpenAudienceData(access.kind)) return <NoAccess title="Audience Data" />;
  const list = listAudienceSources({ reader: "staff" });
  return <AudienceDataList mode="staff" rows={list.rows} campaigns={list.campaigns} />;
}

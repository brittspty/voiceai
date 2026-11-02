import { AudienceDataSource } from "@/components/audience-data/screens";
import { NoAccess } from "@/components/no-access";
import { requireUser } from "@/lib/auth";
import { audienceSourceDetail, canOpenAudienceData, readClientAudienceData } from "@/lib/marketing/audience-data/present";
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

export default async function AudienceDataSourcePage({ params }: { params: Promise<{ sourceId: string }> }) {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  const { sourceId } = await params;
  const client = access.kind === "client_owner" || access.kind === "client_viewer";
  if (client) {
    if (!audienceDataClientEnabled()) return turnedOff();
    const result = readClientAudienceData({ ownAccountId: access.workspaceId, sourceId, reader: "client" });
    if (!result.ok || !("groups" in result.body)) {
      return (
        <main>
          <h1>Audience Data</h1>
          <p>That data source is not in your account.</p>
        </main>
      );
    }
    return <AudienceDataSource detail={result.body} mode="client" accountName={result.body.accountName || "Your"} showResolution={resolutionDataEnabled()} />;
  }
  if (!audienceDataEnabled()) return turnedOff();
  if (!canOpenAudienceData(access.kind)) return <NoAccess title="Audience Data" />;
  const detail = audienceSourceDetail(sourceId, "staff");
  if (!detail) {
    return (
      <main>
        <h1>Audience Data</h1>
        <p>That data source is not in the example.</p>
      </main>
    );
  }
  return <AudienceDataSource detail={detail} mode="staff" showResolution={resolutionDataEnabled()} />;
}

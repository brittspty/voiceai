import { AudienceDataSource } from "@/components/audience-data/screens";
import { NoAccess } from "@/components/no-access";
import { requireUser } from "@/lib/auth";
import { audienceSourceDetail, canOpenAudienceData } from "@/lib/marketing/audience-data/present";
import { audienceDataEnabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export default async function AudienceDataSourcePage({ params }: { params: Promise<{ sourceId: string }> }) {
  if (!audienceDataEnabled()) {
    return (
      <main>
        <h1>Audience Data</h1>
        <p>Audience Data is turned off.</p>
      </main>
    );
  }
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (!canOpenAudienceData(access.kind)) return <NoAccess title="Audience Data" />;
  const { sourceId } = await params;
  const detail = audienceSourceDetail(sourceId, "staff");
  if (!detail) {
    return (
      <main>
        <h1>Audience Data</h1>
        <p>That data source is not in the example.</p>
      </main>
    );
  }
  return <AudienceDataSource detail={detail} />;
}

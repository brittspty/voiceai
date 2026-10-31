import { AudienceDataList } from "@/components/audience-data/screens";
import { NoAccess } from "@/components/no-access";
import { requireUser } from "@/lib/auth";
import { canOpenAudienceData } from "@/lib/marketing/audience-data/present";
import { audienceDataEnabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export default async function AudienceDataPage() {
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
  return <AudienceDataList />;
}

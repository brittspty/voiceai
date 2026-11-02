import { ResolutionScreen } from "@/components/audience-data/resolution-panel";
import { NoAccess } from "@/components/no-access";
import { requireUser } from "@/lib/auth";
import { canOpenAudienceData } from "@/lib/marketing/audience-data/present";
import { readResolution } from "@/lib/marketing/audience-data/resolution";
import { audienceDataClientEnabled, audienceDataEnabled, resolutionDataEnabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

function turnedOff() {
  return (
    <main>
      <h1>Resolution Data</h1>
      <p>Resolution Data is turned off.</p>
    </main>
  );
}

export default async function ResolutionSummaryPage({ searchParams }: { searchParams: Promise<{ account?: string; campaign?: string }> }) {
  if (!resolutionDataEnabled()) return turnedOff();
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  const query = await searchParams;
  const client = access.kind === "client_owner" || access.kind === "client_viewer";
  if (client) {
    if (!audienceDataClientEnabled()) return turnedOff();
    const result = readResolution({
      reader: "client",
      ownAccountId: access.workspaceId,
      requestedAccountId: query.account,
      campaignId: query.campaign,
    });
    if (!result.ok) return <NoAccess title="Resolution Data" />;
    return (
      <ResolutionScreen
        report={result.body}
        mode="client"
        accountName={result.body.accountName}
        crumb={[{ href: "/audience-data", label: "Audience Data" }, { label: "Resolution Data" }]}
      />
    );
  }
  if (!audienceDataEnabled()) return turnedOff();
  if (!canOpenAudienceData(access.kind)) return <NoAccess title="Resolution Data" />;
  const result = readResolution({ reader: "staff" });
  if (!result.ok) return turnedOff();
  return (
    <ResolutionScreen
      report={result.body}
      mode="staff"
      crumb={[{ href: "/audience-data", label: "Audience Data" }, { label: "Resolution Data" }]}
    />
  );
}

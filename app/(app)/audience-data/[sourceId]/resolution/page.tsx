import { ResolutionScreen } from "@/components/audience-data/resolution-panel";
import { NoAccess } from "@/components/no-access";
import { requireUser } from "@/lib/auth";
import { canOpenAudienceData } from "@/lib/marketing/audience-data/present";
import { readResolution } from "@/lib/marketing/audience-data/resolution";
import { RealEmpty } from "@/components/jarvis/real-home";
import { audienceDataClientEnabled, audienceDataEnabled, marketingClientSwitcherEnabled, resolutionDataEnabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { forSpendViewer } from "@/lib/marketing/spend-access";

export const dynamic = "force-dynamic";

function turnedOff() {
  return (
    <main>
      <h1>Resolution Data</h1>
      <p>Resolution Data is turned off.</p>
    </main>
  );
}

export default async function SourceResolutionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sourceId: string }>;
  searchParams: Promise<{ account?: string; campaign?: string; src?: string }>;
}) {
  if (!resolutionDataEnabled()) return turnedOff();
  if (marketingClientSwitcherEnabled()) return <RealEmpty title="Resolution Data" detail="No data yet." />;
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  const { sourceId } = await params;
  const query = await searchParams;
  const client = access.kind === "client_owner" || access.kind === "client_viewer";
  if (client) {
    if (!audienceDataClientEnabled()) return turnedOff();
    const result = readResolution({
      reader: "client",
      sourceId: query.src || sourceId,
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
        crumb={[
          { href: "/audience-data", label: "Audience Data" },
          { href: `/audience-data/${result.body.id}`, label: result.body.title.split(" · ")[0] || "Source" },
          { label: "Resolution Data" },
        ]}
        tabs={{ id: result.body.id, current: "resolution" }}
      />
    );
  }
  if (!audienceDataEnabled()) return turnedOff();
  if (!canOpenAudienceData(access.kind)) return <NoAccess title="Resolution Data" />;
  const result = readResolution({ reader: "staff", sourceId });
  if (result.ok) result.body = forSpendViewer(result.body, access);
  if (!result.ok) return <NoAccess title="Resolution Data" />;
  return (
    <ResolutionScreen
      report={result.body}
      mode="staff"
      crumb={[
        { href: "/audience-data", label: "Audience Data" },
        { href: `/audience-data/${sourceId}`, label: result.body.vendor || result.body.title.split(" · ")[0] || "Source" },
        { label: "Resolution Data" },
      ]}
      tabs={{ id: sourceId, current: "resolution" }}
    />
  );
}

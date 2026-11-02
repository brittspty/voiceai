import { headers } from "next/headers";
import { ClientPerformance } from "@/components/client-performance";
import { GbpPanel } from "@/components/gbp/gbp-panel";
import { DashboardTabs } from "@/components/gbp/gbp-tabs";
import { MarketingDashboard } from "@/components/marketing-dashboard";
import { NoAccess } from "@/components/no-access";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dashboardsV2Enabled, googleBusinessProfileEnabled } from "@/lib/marketing/config";
import { presentGbpClient } from "@/lib/marketing/gbp-view";
import { parseDashQuery } from "@/lib/marketing/dashboard-model";
import { loadDashboardForAccess } from "@/lib/marketing/dashboard-query";
import { loadFeatureCards } from "@/lib/marketing/home-query";
import { loadClientPerformance, loadMarketingAccess, recordClientView } from "@/lib/marketing/queries";
import { requestClientMeta } from "@/lib/marketing/request-meta";

export const dynamic = "force-dynamic";

export default async function ClientMarketingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (user.role !== "client_viewer") return <NoAccess title="Results" />;
  if (access.kind !== "client_viewer" || !access.workspaceId) return <NoAccess title="Results" />;
  const org = await prisma.org.findUnique({ where: { id: "org" }, select: { name: true } });
  const query = await searchParams;
  const gbpOn = googleBusinessProfileEnabled();
  const gbpTab = gbpOn && query.tab === "gbp";
  const meta = requestClientMeta(await headers());
  await recordClientView({ workspaceId: access.workspaceId, viewerUserId: user.id, page: "/marketing/client", ...meta });
  const gbp = gbpOn ? <GbpPanel view={presentGbpClient({ clientId: "harbor", audience: "client" })} /> : null;
  const tabs = gbpOn ? <DashboardTabs current={gbpTab ? "gbp" : "campaigns"} base="/marketing/client" /> : null;
  if (gbpTab) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6">
        {tabs}
        {gbp}
      </div>
    );
  }
  if (!dashboardsV2Enabled()) {
    const payload = await loadClientPerformance(org?.name || "Performance", { workspaceId: access.workspaceId, adAccountIds: access.accounts });
    return (
      <div>
        {tabs}
        <ClientPerformance data={payload} />
      </div>
    );
  }
  const [data, features] = await Promise.all([
    loadDashboardForAccess(access, "client", org?.name || "Campaigns"),
    loadFeatureCards({ workspaceIds: [access.workspaceId], showMoney: false }),
  ]);
  return (
    <div>
      {tabs}
      <MarketingDashboard model={data} query={parseDashQuery(query)} basePath="/marketing/client" features={features} />
    </div>
  );
}

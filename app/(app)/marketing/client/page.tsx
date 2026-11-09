import { headers } from "next/headers";
import { AnalyticsTraffic } from "@/components/analytics-traffic";
import { ClarityFrustration } from "@/components/clarity-frustration";
import { ClientPerformance } from "@/components/client-performance";
import { MarketingDashboard } from "@/components/marketing-dashboard";
import { NoAccess } from "@/components/no-access";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dashboardsV2Enabled } from "@/lib/marketing/config";
import { parseDashQuery } from "@/lib/marketing/dashboard-model";
import { loadDashboardForAccess } from "@/lib/marketing/dashboard-query";
import { loadAnalyticsTraffic } from "@/lib/marketing/google-analytics/query";
import { loadClarityFrustration } from "@/lib/marketing/clarity/query";
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
  const meta = requestClientMeta(await headers());
  await recordClientView({ workspaceId: access.workspaceId, viewerUserId: user.id, page: "/marketing/client", ...meta });
  if (!dashboardsV2Enabled()) {
    const [payload, analytics, clarity] = await Promise.all([
      loadClientPerformance(org?.name || "Performance", { workspaceId: access.workspaceId, adAccountIds: access.accounts }),
      loadAnalyticsTraffic({ workspaceId: access.workspaceId, days: 30 }).catch(() => null),
      loadClarityFrustration({ workspaceId: access.workspaceId, days: 30 }).catch(() => null),
    ]);
    return (
      <>
        <ClientPerformance data={payload} />
        {analytics ? <div className="mx-auto max-w-3xl px-4"><AnalyticsTraffic view={analytics} /></div> : null}
        {clarity ? <div className="mx-auto max-w-3xl px-4"><ClarityFrustration view={clarity} /></div> : null}
      </>
    );
  }
  const parsed = parseDashQuery(await searchParams);
  const [data, features] = await Promise.all([
    loadDashboardForAccess(access, "client", org?.name || "Campaigns", undefined, undefined, parsed.days),
    loadFeatureCards({ workspaceIds: [access.workspaceId], showMoney: false }),
  ]);
  return <MarketingDashboard model={data} query={{ ...parsed, clientId: null }} basePath="/marketing/client" features={features} />;
}

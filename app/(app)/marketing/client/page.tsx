import { headers } from "next/headers";
import { ClientPerformance } from "@/components/client-performance";
import { MarketingDashboard } from "@/components/marketing-dashboard";
import { NoAccess } from "@/components/no-access";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dashboardsV2Enabled } from "@/lib/marketing/config";
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
  const meta = requestClientMeta(await headers());
  await recordClientView({ workspaceId: access.workspaceId, viewerUserId: user.id, page: "/marketing/client", ...meta });
  if (!dashboardsV2Enabled()) {
    const payload = await loadClientPerformance(org?.name || "Performance", { workspaceId: access.workspaceId, adAccountIds: access.accounts });
    return <ClientPerformance data={payload} />;
  }
  const [data, features] = await Promise.all([
    loadDashboardForAccess(access, "client", org?.name || "Campaigns"),
    loadFeatureCards({ workspaceIds: [access.workspaceId], showMoney: false }),
  ]);
  return <MarketingDashboard model={data} query={parseDashQuery(await searchParams)} basePath="/marketing/client" features={features} />;
}

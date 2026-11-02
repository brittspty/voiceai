import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClientMetricSettings } from "@/components/client-metric-settings";
import { PageTitle } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { PRODUCT_NAME } from "@/lib/brand/names";
import { denyAccess } from "@/lib/deny";
import { prisma } from "@/lib/db";
import { clientMetricVisibilityEnabled, dashboardsV2Enabled } from "@/lib/marketing/config";
import { loadDashboard } from "@/lib/marketing/dashboard-query";
import { listHomeWorkspaces } from "@/lib/marketing/home-query";
import { allowedMetricClientIds, metricSettingsPermission } from "@/lib/marketing/metric-visibility-api";
import { loadResolvedVisibility } from "@/lib/marketing/metric-visibility-store";
import { catalogView } from "@/lib/marketing/metric-visibility";
import { loadClientPerformance, loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Client metrics" };

export default async function ClientMetricsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!clientMetricVisibilityEnabled()) notFound();
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (!metricSettingsPermission(access.kind).view) denyAccess();
  const [known, assignments] = await Promise.all([
    listHomeWorkspaces(access),
    prisma.marketingAssignment.findMany({ where: { userId: user.id }, select: { workspaceId: true } }),
  ]);
  const allowed = new Set(allowedMetricClientIds({
    kind: access.kind,
    knownIds: known.map((row) => row.id),
    assignedIds: assignments.map((row) => row.workspaceId),
  }));
  const clients = known.filter((row) => allowed.has(row.id)).map((row) => ({ id: row.id, name: row.name }));
  const requestedRaw = (await searchParams).client;
  const requested = Array.isArray(requestedRaw) ? requestedRaw[0] || "" : requestedRaw || "";
  const selected = clients.find((client) => client.id === requested) || clients[0];
  return (
    <div>
      <PageTitle
        title="Client metrics"
        subtitle={`Choose the cards, charts, columns, and channels each client sees in ${PRODUCT_NAME}.`}
      />
      {!selected ? (
        <p className="text-sm text-muted">No clients are on this workspace yet.</p>
      ) : (
        <ClientMetricSettings
          key={selected.id}
          clients={clients}
          clientId={selected.id}
          clientName={selected.name}
          rows={catalogView(await loadResolvedVisibility(selected.id))}
          canEdit={metricSettingsPermission(access.kind).edit && allowed.has(selected.id)}
          model={await loadDashboard({
            workspaceId: selected.id,
            workspaceName: selected.name,
            mode: "client",
            applyVisibility: false,
          })}
          share={await loadClientPerformance(selected.name, { workspaceId: selected.id, applyVisibility: false })}
          dashboardsV2={dashboardsV2Enabled()}
        />
      )}
    </div>
  );
}

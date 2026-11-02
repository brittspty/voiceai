import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { compareClients, compareCsv } from "@/lib/marketing/compare";
import { assembleCompareSources, compareTable } from "@/lib/marketing/compare-table";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { uxLaunchGapsEnabled } from "@/lib/ux-flags";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  if (access.kind !== "super_admin") return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (uxLaunchGapsEnabled()) {
    const [workspaces, metrics, alerts, decisions, assignments] = await Promise.all([
      prisma.workspace.findMany({ select: { id: true, name: true } }),
      prisma.dailyMetric.groupBy({ by: ["workspaceId"], _sum: { spend: true, platformLeads: true, platformConversions: true } }),
      prisma.adAlert.findMany({
        where: { code: { in: ["ctr_without_results", "click_to_landing", "odd_hours"] } },
        select: { workspaceId: true },
        distinct: ["workspaceId"],
      }),
      prisma.recommendation.groupBy({ by: ["workspaceId"], where: { status: { in: ["draft", "verified"] } }, _count: { _all: true } }),
      prisma.marketingAssignment.findMany({
        where: { scopeKind: "client", user: { role: "account_manager", disabledAt: null } },
        select: { workspaceId: true, user: { select: { name: true } } },
      }),
    ]);
    const table = compareTable(assembleCompareSources({
      workspaces,
      managers: assignments.map((row) => ({ workspaceId: row.workspaceId, name: row.user.name })),
      metrics: metrics.map((row) => ({
        workspaceId: row.workspaceId,
        spend: row._sum.spend == null ? null : Number(row._sum.spend),
        leads: Number(row._sum.platformLeads || 0),
        booked: Number(row._sum.platformConversions || 0),
      })),
      alertWorkspaceIds: alerts.map((row) => row.workspaceId),
      decisionCounts: decisions.map((row) => ({ workspaceId: row.workspaceId, count: row._count._all })),
    }));
    const lines = ["Client,Account manager,Spend,Leads,Booked,CPL,Junk-lead alert,Open decisions"];
    for (const row of table.rows) {
      lines.push([row.name, row.manager, row.spendLabel, row.leads, row.booked, row.cplLabel, row.junkLabel, row.openDecisions].join(","));
    }
    return new NextResponse(lines.join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8" } });
  }
  const [org, metrics] = await Promise.all([
    prisma.org.findUnique({ where: { id: "org" }, select: { name: true } }),
    prisma.dailyMetric.findMany({ select: { spend: true, platformConversions: true } }),
  ]);
  const spend = metrics.reduce((sum, row) => sum + Number(row.spend), 0);
  const booked = metrics.reduce((sum, row) => sum + Number(row.platformConversions), 0);
  const compared = compareClients({ clients: [{ name: org?.name || "This client", manager: "Unassigned", spend, booked }] });
  return new NextResponse(compareCsv(compared.rows), { headers: { "Content-Type": "text/csv; charset=utf-8" } });
}

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readScopedClient } from "@/lib/marketing/client-contract";
import { reportsV2Enabled } from "@/lib/marketing/config";
import { prisma } from "@/lib/db";
import { buildReport } from "@/lib/marketing/reports/guard";
import { buildReportPdf } from "@/lib/marketing/reports/pdf";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import type { ClientReport, StaffReport } from "@/lib/marketing/reports/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!reportsV2Enabled()) return NextResponse.json({ error: "Reports are turned off" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const url = new URL(request.url);
  const query = Object.fromEntries(url.searchParams.entries());
  const built = await buildReport(user, query);
  if (!built) return NextResponse.json({ error: "Reports are turned off" }, { status: 404 });
  const access = await loadMarketingAccess(user);
  const requested = String(query.client || query.clientId || "");
  let report: StaffReport | ClientReport = built.report;
  if (access.kind === "account_manager" && requested && requested !== "all") {
    const rows = await prisma.marketingAssignment.findMany({ where: { userId: user.id } });
    const assigned = [...new Set(rows.flatMap((row) => [row.workspaceId, row.adAccountId, row.campaignId].filter((id): id is string => Boolean(id))))];
    const scoped = readScopedClient({
      kind: "account_manager",
      ownClientId: access.workspaceId,
      assignedClientIds: assigned,
      requestedClientId: requested,
      payload: built.report,
    });
    if (!scoped.ok) return NextResponse.json({ error: scoped.error }, { status: scoped.status });
    report = scoped.body;
  } else if (access.kind === "client_owner" || access.kind === "client_viewer") {
    const own = access.workspaceId;
    const scoped = readScopedClient({
      kind: access.kind,
      ownClientId: own,
      assignedClientIds: [own],
      requestedClientId: own,
      payload: built.report,
    });
    if (!scoped.ok) return NextResponse.json({ error: scoped.error }, { status: scoped.status });
    report = scoped.body;
  }
  const pdf = buildReportPdf(report);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${built.report.clientName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-report.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

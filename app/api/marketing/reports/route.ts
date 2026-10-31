import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readScopedClient } from "@/lib/marketing/client-contract";
import { reportsV2Enabled } from "@/lib/marketing/config";
import { prisma } from "@/lib/db";
import { buildReport } from "@/lib/marketing/reports/guard";
import { loadMarketingAccess } from "@/lib/marketing/queries";

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
    return NextResponse.json(scoped.body);
  }
  if (access.kind === "client_owner" || access.kind === "client_viewer") {
    const own = access.workspaceId;
    const scoped = readScopedClient({
      kind: access.kind,
      ownClientId: own,
      assignedClientIds: [own],
      requestedClientId: own,
      payload: built.report,
    });
    if (!scoped.ok) return NextResponse.json({ error: scoped.error }, { status: scoped.status });
    return NextResponse.json(scoped.body);
  }
  return NextResponse.json(built.report);
}

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { compareClients, compareCsv } from "@/lib/marketing/compare";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  if (access.kind !== "super_admin") return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const [org, metrics] = await Promise.all([
    prisma.org.findUnique({ where: { id: "org" }, select: { name: true } }),
    prisma.dailyMetric.findMany({ select: { spend: true, platformConversions: true } }),
  ]);
  const spend = metrics.reduce((sum, row) => sum + Number(row.spend), 0);
  const booked = metrics.reduce((sum, row) => sum + Number(row.platformConversions), 0);
  const compared = compareClients({ clients: [{ name: org?.name || "This client", manager: "Unassigned", spend, booked }] });
  return new NextResponse(compareCsv(compared.rows), { headers: { "Content-Type": "text/csv; charset=utf-8" } });
}

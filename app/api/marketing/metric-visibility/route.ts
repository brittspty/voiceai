import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listHomeWorkspaces } from "@/lib/marketing/home-query";
import { getMetricSettings, putMetricSettings } from "@/lib/marketing/metric-visibility-api";
import { prismaMetricStore } from "@/lib/marketing/metric-visibility-store";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

async function actorFor(user: { id: string; name: string; email: string; role: string }) {
  const access = await loadMarketingAccess(user);
  const [known, assignments] = await Promise.all([
    listHomeWorkspaces(access).catch(() => []),
    prisma.marketingAssignment.findMany({ where: { userId: user.id }, select: { workspaceId: true } }),
  ]);
  return {
    id: user.id,
    name: user.name,
    kind: access.kind,
    knownIds: known.map((row) => row.id),
    assignedIds: assignments.map((row) => row.workspaceId),
  };
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const clientId = new URL(request.url).searchParams.get("client") || "";
  const result = await getMetricSettings(await actorFor(user), clientId, prismaMetricStore);
  return NextResponse.json(result.body, { status: result.status });
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { clientId?: unknown; metrics?: unknown; preset?: unknown; reset?: unknown };
  const result = await putMetricSettings(await actorFor(user), body, prismaMetricStore);
  return NextResponse.json(result.body, { status: result.status });
}

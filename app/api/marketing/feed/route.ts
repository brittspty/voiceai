import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { amRealtimeEnabled } from "@/lib/marketing/config";
import { feedSseChunk } from "@/lib/marketing/feed";
import { loadFeedForAccess } from "@/lib/marketing/feed-job";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

function allowed(kind: string) {
  return kind === "super_admin" || kind === "account_manager";
}

export async function GET(request: Request) {
  if (!amRealtimeEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  if (!allowed(access.kind)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const url = new URL(request.url);
  const sinceRaw = url.searchParams.get("since");
  const since = sinceRaw ? new Date(sinceRaw) : null;
  const events = await loadFeedForAccess({
    kind: access.kind,
    assignments: access.kind === "account_manager"
      ? await assignmentsFor(user.id)
      : [],
    since: since && !Number.isNaN(since.getTime()) ? since : null,
  });
  const payload = events.map((event) => ({
    id: event.id,
    kind: event.kind,
    title: event.title,
    body: event.body,
    reason: event.reason,
    decision: event.decision,
    createdAt: event.createdAt.toISOString(),
  }));
  if (url.searchParams.get("stream") === "1") {
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const newest = payload[0];
        controller.enqueue(encoder.encode("retry: 20000\n\n"));
        controller.enqueue(encoder.encode(newest ? feedSseChunk(newest) : ": ping\n\n"));
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }
  return NextResponse.json({ events: payload });
}

async function assignmentsFor(userId: string) {
  const rows = await prisma.marketingAssignment.findMany({ where: { userId } });
  return rows.map((row) => ({
    workspaceId: row.workspaceId,
    scopeKind: row.scopeKind,
    adAccountId: row.adAccountId,
    campaignId: row.campaignId,
  }));
}

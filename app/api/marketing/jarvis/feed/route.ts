import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { EXAMPLE_ASSIGNMENTS, EXAMPLE_FEED } from "@/lib/marketing/channels/catalog";
import { readScopedClient } from "@/lib/marketing/client-contract";
import { deliverUrgentEmail, scopeLiveFeed, urgentEmailOptIn } from "@/lib/marketing/channels/feed";
import { feedSseChunk } from "@/lib/marketing/feed";
import { amRealtimeEnabled, jarvisUiV2Enabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";

/** Assignment scope is applied here. Delivery stays with the live-feed service. */
export async function GET(request: Request) {
  if (!jarvisUiV2Enabled()) return NextResponse.json({ error: "Off" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  if (access.kind !== "super_admin" && access.kind !== "account_manager") {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  const url = new URL(request.url);
  const requested = url.searchParams.get("client") || "";
  const assigned = access.kind === "super_admin" ? EXAMPLE_FEED.map((item) => item.clientId) : EXAMPLE_ASSIGNMENTS.dana;
  if (access.kind === "account_manager" && requested) {
    const scoped = readScopedClient({
      kind: "account_manager",
      ownClientId: access.workspaceId,
      assignedClientIds: assigned,
      requestedClientId: requested,
      payload: { clientId: requested },
    });
    if (!scoped.ok) return NextResponse.json({ error: scoped.error }, { status: scoped.status });
  }
  const items = scopeLiveFeed(EXAMPLE_FEED, {
    role: access.kind,
    assignedClientIds: access.kind === "super_admin" ? [] : assigned,
  }).map((item) => {
    const email = deliverUrgentEmail({ optIn: urgentEmailOptIn(user.id) && item.severity === "urgent", title: item.title });
    return { ...item, urgentEmail: email.logged };
  });
  if (url.searchParams.get("stream") === "1") {
    if (!amRealtimeEnabled()) return NextResponse.json({ error: "Off" }, { status: 404 });
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode("retry: 15000\n\n"));
        const newest = items[0];
        controller.enqueue(encoder.encode(newest ? feedSseChunk({ id: newest.id, title: newest.title, kind: newest.severity }) : ": ping\n\n"));
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
  return NextResponse.json({ items });
}

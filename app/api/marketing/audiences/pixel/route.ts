import { NextResponse } from "next/server";
import { audienceLibraryEnabled } from "@/lib/marketing/config";
import { recordPixelEvent } from "@/lib/marketing/audiences/store";

export async function POST(request: Request) {
  if (!audienceLibraryEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { workspaceId?: string; audienceId?: string; visitorId?: string; event?: string; pageUrl?: string } | null;
  if (!body?.workspaceId || !body.audienceId || !body.visitorId) {
    return NextResponse.json({ error: "A pixel event needs a workspace, audience, and visitor." }, { status: 400 });
  }
  const saved = await recordPixelEvent({
    workspaceId: body.workspaceId,
    audienceId: body.audienceId,
    visitorId: body.visitorId,
    eventName: body.event || "page_view",
    pageUrl: body.pageUrl || "",
  });
  if (!saved.ok) return NextResponse.json({ error: saved.message }, { status: 404 });
  return NextResponse.json({ ok: true });
}

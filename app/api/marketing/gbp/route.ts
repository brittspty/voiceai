import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readScopedClient } from "@/lib/marketing/client-contract";
import { googleBusinessProfileEnabled } from "@/lib/marketing/config";
import { canViewGbp, presentGbpClient } from "@/lib/marketing/gbp-view";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { forSpendViewer } from "@/lib/marketing/spend-access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!googleBusinessProfileEnabled()) return NextResponse.json({ error: "Google Business Profile is turned off" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  if (!canViewGbp(access.kind)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const requested = new URL(request.url).searchParams.get("client") || "harbor";
  const clientId = access.kind === "client_viewer" || access.kind === "client_owner" ? "harbor" : requested;
  if ((access.kind === "client_viewer" || access.kind === "client_owner") && requested !== "harbor" && requested !== access.workspaceId) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  const audience = access.seesCost ? "staff" : "client";
  const view = presentGbpClient({ clientId, audience });
  const scoped = readScopedClient({
    kind: access.kind === "client_owner" || access.kind === "client_viewer" ? access.kind : "staff",
    ownClientId: clientId,
    assignedClientIds: [clientId],
    requestedClientId: clientId,
    payload: view,
  });
  if (!scoped.ok) return NextResponse.json({ error: scoped.error }, { status: scoped.status });
  return NextResponse.json(forSpendViewer(scoped.body, access));
}

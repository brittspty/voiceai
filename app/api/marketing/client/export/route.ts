import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readScopedClient } from "@/lib/marketing/client-contract";
import { clientShareCsv, type ClientShareView } from "@/lib/marketing/client-view";
import { loadClientPerformance, loadMarketingAccess, recordClientView } from "@/lib/marketing/queries";
import { requestClientMeta } from "@/lib/marketing/request-meta";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  if (access.kind !== "client_viewer" || !access.workspaceId) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  const loaded = await loadClientPerformance(access.email, { workspaceId: access.workspaceId, adAccountIds: access.accounts });
  const scoped = readScopedClient({
    kind: "client_viewer",
    ownClientId: access.workspaceId,
    assignedClientIds: [access.workspaceId],
    requestedClientId: access.workspaceId,
    payload: loaded,
  });
  if (!scoped.ok) return NextResponse.json({ error: scoped.error }, { status: scoped.status });
  const payload = scoped.body as ClientShareView;
  const meta = requestClientMeta(request.headers);
  await recordClientView({ workspaceId: access.workspaceId, viewerUserId: user.id, page: "/api/marketing/client/export", ...meta });
  return new NextResponse(clientShareCsv(payload), {
    headers: { "Content-Type": "text/csv; charset=utf-8" },
  });
}

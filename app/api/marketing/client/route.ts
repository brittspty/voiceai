import { NextResponse } from "next/server";
import { stripForAudience } from "@/lib/marketing/channels/cost-strip";
import { getCurrentUser } from "@/lib/auth";
import { loadClientPerformance, loadMarketingAccess, recordClientView } from "@/lib/marketing/queries";
import { requestClientMeta } from "@/lib/marketing/request-meta";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  if (access.kind !== "client_viewer" || !access.workspaceId) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  const payload = stripForAudience(await loadClientPerformance(access.email, { workspaceId: access.workspaceId, adAccountIds: access.accounts }), "client");
  const meta = requestClientMeta(request.headers);
  await recordClientView({ workspaceId: access.workspaceId, viewerUserId: user.id, page: "/api/marketing/client", ...meta });
  return NextResponse.json(payload);
}

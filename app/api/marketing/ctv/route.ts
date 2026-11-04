import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { ctvAttributionEnabled } from "@/lib/marketing/config";
import { answerCtvRequest } from "@/lib/marketing/ctv/http";
import { loadCtvChannelPage } from "@/lib/marketing/ctv/channel-query";
import { loadCtvAttributionView } from "@/lib/marketing/ctv/sync";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  const channel = await loadCtvChannelPage({
    access,
    requestedClientId: null,
    days: 7,
    status: access.seesCost || access.kind === "super_admin" || access.kind === "account_manager" || access.kind === "staff" || access.kind === "all_clients_viewer" ? "active" : "",
    path: "/marketing/ctv",
  });
  const result = answerCtvRequest({
    enabled: ctvAttributionEnabled(),
    kind: access.kind,
    seesCost: access.seesCost,
    role: access.role,
    view: await loadCtvAttributionView(),
    channel,
  });
  return NextResponse.json(result.body, { status: result.status });
}

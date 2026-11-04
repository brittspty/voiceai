import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { canSwitchMarketingClient } from "@/lib/marketing/access";
import { ctvAttributionEnabled, stackAdaptCtvLiveEnabled } from "@/lib/marketing/config";
import { loadCtvAttributionPage } from "@/lib/marketing/ctv/attribution-query";
import { answerCtvRequest } from "@/lib/marketing/ctv/http";
import { loadCtvChannelPage } from "@/lib/marketing/ctv/channel-query";
import { ctvViewWithoutExample, loadCtvAttributionView } from "@/lib/marketing/ctv/sync";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { parseRealViewQuery } from "@/lib/marketing/real-view";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  const url = new URL(request.url);
  const picker = canSwitchMarketingClient(access);
  const viewQuery = parseRealViewQuery(url.searchParams, picker);
  const requestedClientId = url.searchParams.get("client");
  const live = stackAdaptCtvLiveEnabled();
  const channel = await loadCtvChannelPage({
    access,
    requestedClientId,
    days: viewQuery.days,
    status: viewQuery.status,
    path: "/marketing/ctv",
  });
  const attribution = live
    ? await loadCtvAttributionPage({
        access,
        requestedClientId,
        days: viewQuery.days,
        status: viewQuery.status,
        path: "/marketing/ctv",
      })
    : null;
  const result = answerCtvRequest({
    enabled: ctvAttributionEnabled(),
    kind: access.kind,
    seesCost: access.seesCost,
    role: access.role,
    view: live ? ctvViewWithoutExample() : await loadCtvAttributionView(),
    channel,
    attribution,
  });
  return NextResponse.json(result.body, { status: result.status });
}

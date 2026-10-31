import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { ctvAttributionEnabled } from "@/lib/marketing/config";
import { ctvHttpDecision, ctvPayloadForViewer } from "@/lib/marketing/ctv/report";
import { loadCtvAttributionView } from "@/lib/marketing/ctv/sync";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  const decision = ctvHttpDecision({ enabled: ctvAttributionEnabled(), kind: access.kind, seesCost: access.seesCost });
  if (decision.status === 404) return NextResponse.json({ error: "CTV attribution is turned off." }, { status: 404 });
  if (decision.status === 403 || !decision.audience) return NextResponse.json({ error: "CTV attribution is staff only." }, { status: 403 });
  const view = ctvPayloadForViewer(await loadCtvAttributionView(), decision.audience);
  return NextResponse.json(view);
}

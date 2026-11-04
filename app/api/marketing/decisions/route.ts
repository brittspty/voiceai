import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { decisionsV1Enabled } from "@/lib/marketing/config";
import { decisionsRequestStatus } from "@/lib/marketing/decisions/access";
import { loadDecisionList } from "@/lib/marketing/decisions/query";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const enabled = decisionsV1Enabled();
  const user = await getCurrentUser();
  const access = user ? await loadMarketingAccess(user) : null;
  const status = decisionsRequestStatus({
    surface: "api",
    enabled,
    signedIn: Boolean(user),
    kind: access?.kind ?? null,
  });
  if (status === 404) return NextResponse.json({ error: "Off" }, { status });
  if (status === 401) return NextResponse.json({ error: "Sign in required" }, { status });
  if (status !== 200 || !access) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const url = new URL(request.url);
  const model = await loadDecisionList(access, Object.fromEntries(url.searchParams.entries()));
  return NextResponse.json({
    clientName: model.clientName,
    days: model.days,
    status: model.status,
    groups: model.groups,
  });
}

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { audienceSourceDetail, canOpenAudienceData } from "@/lib/marketing/audience-data/present";
import { audienceDataEnabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ sourceId: string }> }) {
  if (!audienceDataEnabled()) return NextResponse.json({ error: "Off" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  if (!canOpenAudienceData(access.kind)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { sourceId } = await context.params;
  const detail = audienceSourceDetail(sourceId, "staff");
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(detail);
}

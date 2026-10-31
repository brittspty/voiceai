import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canOpenAudienceData, listAudienceSources } from "@/lib/marketing/audience-data/present";
import { audienceDataEnabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!audienceDataEnabled()) return NextResponse.json({ error: "Off" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  if (!canOpenAudienceData(access.kind)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const url = new URL(request.url);
  const body = listAudienceSources({
    reader: "staff",
    campaignId: url.searchParams.get("campaign") || "all",
    search: url.searchParams.get("q") || "",
    sort: "leads",
  });
  return NextResponse.json(body);
}

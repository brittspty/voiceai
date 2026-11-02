import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canOpenAudienceData, listAudienceSources, readClientAudienceData } from "@/lib/marketing/audience-data/present";
import { audienceDataClientEnabled, audienceDataEnabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  const url = new URL(request.url);
  const client = access.kind === "client_owner" || access.kind === "client_viewer";
  if (client) {
    if (!audienceDataClientEnabled()) return NextResponse.json({ error: "Off" }, { status: 404 });
    const result = readClientAudienceData({
      ownAccountId: access.workspaceId,
      requestedAccountId: url.searchParams.get("account"),
      reader: "client",
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.body);
  }
  if (!audienceDataEnabled()) return NextResponse.json({ error: "Off" }, { status: 404 });
  if (!canOpenAudienceData(access.kind)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const body = listAudienceSources({
    reader: "staff",
    campaignId: url.searchParams.get("campaign") || "all",
    search: url.searchParams.get("q") || "",
    sort: "leads",
  });
  return NextResponse.json(body);
}

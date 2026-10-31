import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canOpenAudienceData } from "@/lib/marketing/audience-data/present";
import { readResolution } from "@/lib/marketing/audience-data/resolution";
import { audienceDataClientEnabled, audienceDataEnabled, resolutionDataEnabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ sourceId: string }> }) {
  if (!resolutionDataEnabled()) return NextResponse.json({ error: "Off" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  const { sourceId } = await context.params;
  const url = new URL(request.url);
  const client = access.kind === "client_owner" || access.kind === "client_viewer";
  if (client) {
    if (!audienceDataClientEnabled()) return NextResponse.json({ error: "Off" }, { status: 404 });
    const result = readResolution({
      reader: "client",
      sourceId: url.searchParams.get("src") || sourceId,
      ownAccountId: access.workspaceId,
      requestedAccountId: url.searchParams.get("account"),
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.body);
  }
  if (!audienceDataEnabled()) return NextResponse.json({ error: "Off" }, { status: 404 });
  if (!canOpenAudienceData(access.kind)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const result = readResolution({ reader: "staff", sourceId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.body);
}

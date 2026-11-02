import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { audienceResolutionBody } from "@/lib/marketing/audience-data/for-viewer";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ sourceId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  const { sourceId } = await context.params;
  const url = new URL(request.url);
  const result = audienceResolutionBody({
    access,
    sourceId: url.searchParams.get("src") || sourceId,
    account: url.searchParams.get("account"),
    campaign: url.searchParams.get("campaign"),
  });
  return NextResponse.json(result.body, { status: result.status });
}

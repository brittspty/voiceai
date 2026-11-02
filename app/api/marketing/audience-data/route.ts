import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { audienceListBody } from "@/lib/marketing/audience-data/for-viewer";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  const url = new URL(request.url);
  const result = audienceListBody({
    access,
    account: url.searchParams.get("account"),
    campaign: url.searchParams.get("campaign"),
    search: url.searchParams.get("q"),
  });
  return NextResponse.json(result.body, { status: result.status });
}

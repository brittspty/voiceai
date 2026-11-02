import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isDrillDimension, presentDrill } from "@/lib/marketing/audience-p1/drill";
import { audienceDataP1Enabled } from "@/lib/marketing/config";
import { readerFor } from "@/lib/marketing/p1-reader";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!audienceDataP1Enabled()) return NextResponse.json({ error: "Audience Data is turned off" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  const raw = new URL(request.url).searchParams.get("dimension") || "geo";
  const dimension = isDrillDimension(raw) ? raw : "geo";
  return NextResponse.json(presentDrill(readerFor(access), dimension));
}

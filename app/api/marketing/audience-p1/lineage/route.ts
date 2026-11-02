import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { LINEAGE_LEVELS, presentLineage, type LineageLevel } from "@/lib/marketing/audience-p1/lineage";
import { audienceDataP1Enabled } from "@/lib/marketing/config";
import { readerFor } from "@/lib/marketing/p1-reader";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!audienceDataP1Enabled()) return NextResponse.json({ error: "Audience Data is turned off" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  const url = new URL(request.url);
  const selection: Partial<Record<LineageLevel, string>> = {};
  for (const level of LINEAGE_LEVELS) {
    const value = url.searchParams.get(level);
    if (value) selection[level] = value;
  }
  return NextResponse.json(presentLineage(readerFor(access), selection));
}

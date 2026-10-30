import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { searchWasteEnabled } from "@/lib/marketing/config";
import { canReviewSearchWaste, featureHttpStatus } from "@/lib/marketing/feature-access";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { listNegativeProposals } from "@/lib/marketing/search-waste-store";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  const status = featureHttpStatus({ enabled: searchWasteEnabled(), allowed: canReviewSearchWaste(access) && access.workspaceId.length > 0 });
  if (status !== 200) return NextResponse.json({ error: status === 404 ? "Not found" : "Not allowed" }, { status });
  const proposals = await listNegativeProposals(access);
  return NextResponse.json({ proposals, seesCost: access.seesCost });
}

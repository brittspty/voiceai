import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { googleAdsConnectionDenial, loadGoogleAdsConnectionView } from "@/lib/marketing/google-connection";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  const denied = googleAdsConnectionDenial(access);
  if (denied) return NextResponse.json(denied.body, { status: denied.status });
  const view = await loadGoogleAdsConnectionView();
  return NextResponse.json(view);
}

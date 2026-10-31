import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { loginAnalyticsEnabled } from "@/lib/login-analytics";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { loadPortfolioModel } from "@/lib/portfolio-query";
import { forbiddenClientKeys, omitForbiddenClientFields } from "@/lib/marketing/client-view";
import { portfolioAllowed } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!loginAnalyticsEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  if (!portfolioAllowed(access.kind)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const model = await loadPortfolioModel(access);
  if (!model) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const body = access.seesCost ? model : omitForbiddenClientFields(model);
  if (!access.seesCost && forbiddenClientKeys(body).length) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}

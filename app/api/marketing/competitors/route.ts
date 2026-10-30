import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { competitorWatchEnabled } from "@/lib/marketing/config";
import { canWatchCompetitors, featureHttpStatus } from "@/lib/marketing/feature-access";
import { cardsForCompetitors, listCompetitors } from "@/lib/marketing/competitor-store";
import { competitorWeeklySummary, publicGallery } from "@/lib/marketing/competitor-watch";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  const status = featureHttpStatus({ enabled: competitorWatchEnabled(), allowed: canWatchCompetitors(access) && access.workspaceId.length > 0 });
  if (status !== 200) return NextResponse.json({ error: status === 404 ? "Not found" : "Not allowed" }, { status });
  const competitors = await listCompetitors(access.workspaceId);
  const since = new Date(Date.now() - 7 * 86_400_000);
  const cards = publicGallery(cardsForCompetitors(competitors));
  return NextResponse.json({
    competitors: competitors.map((competitor) => ({
      name: competitor.name,
      pageId: competitor.pageId,
      website: competitor.website,
      lastError: competitor.lastError,
    })),
    ads: cards,
    summary: competitorWeeklySummary(competitors.map((competitor) => ({
      name: competitor.name,
      ads: competitor.ads.map((ad) => ({ firstSeen: ad.firstSeen.toISOString().slice(0, 10), headline: ad.headline })),
    })), since),
  });
}

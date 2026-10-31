import { addDaysISO, zonedISODate } from "../time";
import { decideGoogleBusinessProfile, lookbackDays, type Env } from "./config";
import {
  pullBusinessProfileWithGoogleOAuth,
  recommendBusinessProfile,
  type BusinessProfileRecommendation,
  type BusinessProfileReport,
  type FetchLike,
} from "./connectors/gbp-client";
import { WORKSPACE_ID } from "./types";

/**
 * Read Business Profile performance, reviews, and missing profile fields.
 * Uses the Google OAuth client id, secret, and refresh token.
 * Off, or missing locations, writes nothing. There is no reply or update call.
 */
export async function runGoogleBusinessProfile(options: { env?: Env; now?: Date; timezone?: string; fetchImpl?: FetchLike } = {}) {
  const env = options.env ?? process.env;
  const decision = decideGoogleBusinessProfile(env);
  if (decision.action === "skip") return { status: "skipped" as const, reason: decision.reason, recommendations: [] as BusinessProfileRecommendation[] };
  const now = options.now ?? new Date();
  const until = zonedISODate(now, options.timezone ?? "America/New_York");
  const since = addDaysISO(until, -(lookbackDays(env) - 1));
  if (decision.action === "mock") {
    return { status: "succeeded" as const, mode: "mock" as const, locations: decision.locationIds.length, recommendations: [] as BusinessProfileRecommendation[] };
  }
  const reports = await pullBusinessProfileWithGoogleOAuth({
    clientId: decision.clientId,
    clientSecret: decision.clientSecret,
    refreshToken: decision.refreshToken,
    accountId: decision.accountId,
    locationIds: decision.locationIds,
    start: since,
    end: until,
    fetchImpl: options.fetchImpl,
  });
  const recommendations = reports.flatMap((report) => recommendBusinessProfile(report));
  if (!options.fetchImpl) await persistBusinessProfile(reports, recommendations, now);
  return { status: "succeeded" as const, mode: "live" as const, locations: reports.length, recommendations };
}

async function persistBusinessProfile(reports: BusinessProfileReport[], recommendations: BusinessProfileRecommendation[], now: Date) {
  const { prisma } = await import("../db");
  const assignments = await prisma.marketingAssignment.findMany({
    where: { workspaceId: WORKSPACE_ID, scopeKind: "client" },
    select: { userId: true },
  });
  const assigneeUserId = assignments.map((row) => row.userId).sort()[0] ?? null;
  for (const report of reports) {
    const days = report.days.length ? report.days : [{ date: now.toISOString().slice(0, 10), views: 0, searches: 0, calls: 0, directionRequests: 0, websiteClicks: 0 }];
    for (const day of days) {
      const date = new Date(`${day.date}T00:00:00.000Z`);
      const data = {
        accountId: report.accountId,
        title: report.title,
        views: day.views,
        searches: day.searches,
        calls: day.calls,
        directionRequests: day.directionRequests,
        websiteClicks: day.websiteClicks,
        rating: report.rating,
        reviewCount: report.reviewCount,
        unansweredReviews: report.unansweredReviews,
        missingInfo: report.missingInfo,
        recommendationOnly: true,
        fetchedAt: now,
      };
      await prisma.businessProfileSnapshot.upsert({
        where: { workspaceId_locationId_date: { workspaceId: WORKSPACE_ID, locationId: report.locationId, date } },
        create: { workspaceId: WORKSPACE_ID, locationId: report.locationId, date, ...data },
        update: data,
      });
    }
  }
  for (const recommendation of recommendations) {
    const existing = await prisma.recommendation.findFirst({
      where: { workspaceId: WORKSPACE_ID, type: "business_profile", title: recommendation.title, createdAt: { gte: new Date(now.getTime() - 20 * 60 * 60 * 1000) } },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.recommendation.create({
      data: {
        workspaceId: WORKSPACE_ID,
        type: "business_profile",
        status: "verified",
        title: recommendation.title,
        summary: recommendation.summary,
        rationale: recommendation.rationale,
        metric: recommendation.metric,
        baseline: recommendation.baseline,
        observed: recommendation.observed,
        sampleSize: recommendation.sampleSize,
        sourceMetricIds: [],
        evidence: {
          action: recommendation.action,
          locationId: recommendation.locationId,
          confidence: recommendation.confidence,
          assigneeUserId,
          changesSpend: false,
          writesAds: false,
          recommendationOnly: true,
        },
        verifiedAt: now,
        verifierNote: "Read from Google Business Profile. Yes only records the answer. Nothing is posted or edited.",
      },
    });
  }
}

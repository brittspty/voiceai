import type { Prisma } from "@prisma/client";
import { addDaysISO, zonedISODate } from "../time";
import { decideGoogleBusinessProfile, googleBusinessProfileAuditEnabled, lookbackDays, type Env } from "./config";
import {
  pullBusinessProfileWithGoogleOAuth,
  recommendBusinessProfile,
  type BusinessProfileRecommendation,
  type BusinessProfileReport,
  type FetchLike,
} from "./connectors/gbp-client";
import { gbpFixtures } from "./connectors/gbp-fixtures";
import { scoreBusinessProfile, type GbpAuditInput } from "./gbp-audit";
import { readGbpAssignments } from "./gbp-mapping";
import { WORKSPACE_ID } from "./types";

export type GbpSyncLocation = { accountId: string; locationId: string; marketingClientId?: string | null };

/**
 * Read Business Profile performance, reviews, keywords, photos, posts, and profile fields.
 * Off writes nothing. Mock mode uses fictional listings and does not call Google.
 * Live mode reads locations that staff have mapped. There is no reply or update call.
 */
export async function runGoogleBusinessProfile(options: {
  env?: Env;
  now?: Date;
  timezone?: string;
  fetchImpl?: FetchLike;
  locations?: GbpSyncLocation[];
} = {}) {
  const env = options.env ?? process.env;
  const decision = decideGoogleBusinessProfile(env);
  if (decision.action === "skip") return { status: "skipped" as const, reason: decision.reason, recommendations: [] as BusinessProfileRecommendation[] };
  const now = options.now ?? new Date();
  const until = zonedISODate(now, options.timezone ?? "America/New_York");
  const since = addDaysISO(until, -(lookbackDays(env) - 1));
  if (decision.action === "mock") {
    const fixtures = gbpFixtures(now);
    const assignments = readGbpAssignments();
    const recommendations = googleBusinessProfileAuditEnabled(env)
      ? fixtures.filter((row) => assignments[row.locationId]).flatMap((row) => auditRecommendations(row.audit, row.locationId, row.report.title))
      : [];
    return { status: "succeeded" as const, mode: "mock" as const, locations: fixtures.length, recommendations, calls: 0 };
  }
  const locations = options.locations ?? (await loadMappedLocations());
  if (!locations.length) return { status: "skipped" as const, reason: "no GBP location mappings", recommendations: [] as BusinessProfileRecommendation[] };
  const reports: BusinessProfileReport[] = [];
  for (const location of locations) {
    const batch = await pullBusinessProfileWithGoogleOAuth({
      clientId: decision.clientId,
      clientSecret: decision.clientSecret,
      refreshToken: decision.refreshToken,
      accountId: location.accountId,
      locationIds: [location.locationId],
      start: since,
      end: until,
      fetchImpl: options.fetchImpl,
    });
    reports.push(...batch);
  }
  const byLocation = new Map(locations.map((row) => [row.locationId, row]));
  const recommendations = reports.flatMap((report) => recommendBusinessProfile(report));
  if (!options.fetchImpl) await persistBusinessProfile(reports, recommendations, now, byLocation, env);
  return { status: "succeeded" as const, mode: "live" as const, locations: reports.length, recommendations };
}

export function auditRecommendations(input: GbpAuditInput, locationId: string, title: string): BusinessProfileRecommendation[] {
  const audit = scoreBusinessProfile(input);
  const name = title || "This profile";
  return audit.checks
    .filter((item) => item.status === "fail")
    .map((item) => {
      const reason = `${name}: ${item.label} needs a fix. ${item.fix} Nothing is changed on Google.`;
      return {
        type: "business_profile" as const,
        action: "review" as const,
        locationId,
        title: reason,
        summary: item.fix,
        rationale: [reason, item.detail].join("\n"),
        metric: item.id,
        baseline: String(item.weight),
        observed: String(item.earned),
        sampleSize: item.weight,
        confidence: 0.9,
        changesSpend: false as const,
        writesAds: false as const,
        recommendationOnly: true as const,
      };
    });
}

async function loadMappedLocations(): Promise<GbpSyncLocation[]> {
  try {
    const { prisma } = await import("../db");
    const rows = await prisma.gbpLocation.findMany({
      where: { workspaceId: WORKSPACE_ID, NOT: { marketingClientId: null } },
      select: { accountId: true, locationId: true, marketingClientId: true },
    });
    return rows.map((row) => ({ accountId: row.accountId, locationId: row.locationId, marketingClientId: row.marketingClientId }));
  } catch {
    return [];
  }
}

async function persistBusinessProfile(
  reports: BusinessProfileReport[],
  recommendations: BusinessProfileRecommendation[],
  now: Date,
  mapped: Map<string, GbpSyncLocation>,
  env: Env,
) {
  const { prisma } = await import("../db");
  const clients = await prisma.marketingClient.findMany({ where: { workspaceId: WORKSPACE_ID }, select: { id: true } });
  const knownClients = new Set(clients.map((row) => row.id));
  const assignments = await prisma.marketingAssignment.findMany({
    where: { workspaceId: WORKSPACE_ID, scopeKind: "client" },
    select: { userId: true },
  });
  const assigneeUserId = assignments.map((row) => row.userId).sort()[0] ?? null;
  for (const report of reports) {
    const clientId = mapped.get(report.locationId)?.marketingClientId || null;
    const marketingClientId = clientId && knownClients.has(clientId) ? clientId : null;
    const days = report.days.length ? report.days : [{ date: now.toISOString().slice(0, 10), views: 0, searches: 0, calls: 0, directionRequests: 0, websiteClicks: 0, searchDesktop: 0, searchMobile: 0, mapsDesktop: 0, mapsMobile: 0, bookings: 0, conversations: 0, foodOrders: 0 }];
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
        searchDesktop: day.searchDesktop,
        searchMobile: day.searchMobile,
        mapsDesktop: day.mapsDesktop,
        mapsMobile: day.mapsMobile,
        bookings: day.bookings,
        conversations: day.conversations,
        foodOrders: day.foodOrders,
        rating: report.rating,
        reviewCount: report.reviewCount,
        unansweredReviews: report.unansweredReviews,
        missingInfo: report.missingInfo,
        marketingClientId,
        recommendationOnly: true,
        fetchedAt: now,
      };
      await prisma.businessProfileSnapshot.upsert({
        where: { workspaceId_locationId_date: { workspaceId: WORKSPACE_ID, locationId: report.locationId, date } },
        create: { workspaceId: WORKSPACE_ID, locationId: report.locationId, date, ...data },
        update: data,
      });
    }
    const location = await prisma.gbpLocation.upsert({
      where: { workspaceId_locationId: { workspaceId: WORKSPACE_ID, locationId: report.locationId } },
      create: {
        workspaceId: WORKSPACE_ID,
        locationId: report.locationId,
        accountId: report.accountId,
        marketingClientId,
        title: report.profile.title || report.title,
        primaryCategory: report.profile.primaryCategory,
        additionalCategories: report.profile.additionalCategories,
        phone: report.profile.phone,
        websiteUri: report.profile.websiteUri,
        address: report.profile.address,
        hours: { regular: report.profile.regularHours, special: report.profile.specialHours } as Prisma.InputJsonValue,
        attributes: report.attributes,
        services: report.profile.services,
        description: report.profile.description,
        verificationState: report.profile.verificationState,
        fieldsHash: "",
        photoCount: report.photoCount,
        lastPhotoAt: report.lastPhotoAt ? new Date(report.lastPhotoAt) : null,
        hasLogo: report.hasLogo,
        hasCover: report.hasCover,
        postCount: report.postCount,
        lastPostAt: report.lastPostAt ? new Date(report.lastPostAt) : null,
        fetchedAt: now,
      },
      update: {
        accountId: report.accountId,
        marketingClientId,
        title: report.profile.title || report.title,
        primaryCategory: report.profile.primaryCategory,
        additionalCategories: report.profile.additionalCategories,
        phone: report.profile.phone,
        websiteUri: report.profile.websiteUri,
        address: report.profile.address,
        hours: { regular: report.profile.regularHours, special: report.profile.specialHours } as Prisma.InputJsonValue,
        attributes: report.attributes,
        services: report.profile.services,
        description: report.profile.description,
        verificationState: report.profile.verificationState,
        photoCount: report.photoCount,
        lastPhotoAt: report.lastPhotoAt ? new Date(report.lastPhotoAt) : null,
        hasLogo: report.hasLogo,
        hasCover: report.hasCover,
        postCount: report.postCount,
        lastPostAt: report.lastPostAt ? new Date(report.lastPostAt) : null,
        fetchedAt: now,
      },
    });
    for (const keyword of report.keywords) {
      const month = (report.days[report.days.length - 1]?.date || now.toISOString()).slice(0, 7);
      await prisma.gbpKeywordMonthly.upsert({
        where: { locationRef_month_keyword: { locationRef: location.id, month, keyword: keyword.keyword } },
        create: { workspaceId: WORKSPACE_ID, locationRef: location.id, locationId: report.locationId, month, keyword: keyword.keyword, impressions: keyword.impressions, threshold: keyword.threshold, fetchedAt: now },
        update: { impressions: keyword.impressions, threshold: keyword.threshold, fetchedAt: now },
      });
    }
    for (const review of report.reviews) {
      if (!review.reviewId || !review.createTime) continue;
      const data = {
        locationRef: location.id,
        locationId: report.locationId,
        starRating: review.starRating,
        comment: review.comment,
        createTime: new Date(review.createTime),
        updateTime: review.updateTime ? new Date(review.updateTime) : null,
        reviewerNameHash: review.reviewerNameHash,
        hasOwnerReply: review.hasOwnerReply,
        replyTime: review.replyTime ? new Date(review.replyTime) : null,
        replyText: review.replyText,
        fetchedAt: now,
      };
      await prisma.gbpReview.upsert({
        where: { workspaceId_reviewId: { workspaceId: WORKSPACE_ID, reviewId: review.reviewId } },
        create: { workspaceId: WORKSPACE_ID, reviewId: review.reviewId, ...data },
        update: data,
      });
    }
    for (const item of report.media) {
      if (!item.id) continue;
      await prisma.gbpMediaStat.upsert({
        where: { locationRef_mediaId: { locationRef: location.id, mediaId: item.id } },
        create: { locationRef: location.id, mediaId: item.id, type: item.type, category: item.category, createTime: item.createTime ? new Date(item.createTime) : null, fetchedAt: now },
        update: { type: item.type, category: item.category, createTime: item.createTime ? new Date(item.createTime) : null, fetchedAt: now },
      });
    }
    for (const item of report.posts) {
      if (!item.id) continue;
      await prisma.gbpPost.upsert({
        where: { locationRef_postId: { locationRef: location.id, postId: item.id } },
        create: { locationRef: location.id, postId: item.id, type: item.type, state: item.state, createTime: item.createTime ? new Date(item.createTime) : null, fetchedAt: now },
        update: { type: item.type, state: item.state, createTime: item.createTime ? new Date(item.createTime) : null, fetchedAt: now },
      });
    }
    if (googleBusinessProfileAuditEnabled(env)) {
      const auditInput: GbpAuditInput = {
        now,
        title: report.profile.title || report.title,
        primaryCategory: report.profile.primaryCategory,
        additionalCategories: report.profile.additionalCategories,
        regularHours: report.profile.regularHours,
        specialHours: report.profile.specialHours,
        description: report.profile.description,
        services: report.profile.services,
        attributes: report.attributes,
        photoCount: report.photoCount,
        lastPhotoAt: report.lastPhotoAt,
        hasLogo: report.hasLogo,
        hasCover: report.hasCover,
        postCount: report.postCount,
        lastPostAt: report.lastPostAt,
        rating: report.rating,
        reviews: report.reviews.map((review) => ({ createTime: review.createTime, hasOwnerReply: review.hasOwnerReply, replyTime: review.replyTime || null })),
        phone: report.profile.phone,
        address: report.profile.address,
        websiteHtml: null,
      };
      const audit = scoreBusinessProfile(auditInput);
      await prisma.gbpAudit.create({
        data: { workspaceId: WORKSPACE_ID, locationRef: location.id, locationId: report.locationId, score: audit.score, checks: audit.checks, version: audit.version },
      });
      recommendations.push(...auditRecommendations(auditInput, report.locationId, report.title));
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

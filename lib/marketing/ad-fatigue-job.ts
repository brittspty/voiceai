import type { AdPlatform } from "@prisma/client";
import {
  AD_FATIGUE_CONFIDENCE_THRESHOLD,
  adFatiguePlatforms,
  adFatigueThresholdMap,
  clampThreshold,
  pickAssignee,
  planAdFatigue,
  type AdFatigueAction,
  type AdFatigueAd,
  type AdFatigueCheckPoint,
  type AdFatigueInboxItem,
  type AdFatiguePlatform,
  type AdFatigueRecommendationDraft,
} from "./ad-fatigue";
import { adFatigueEnabled, type Env } from "./config";
import { isolatedWhere } from "./workspace";

function dec(value: { toString(): string } | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

function dayStart(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`);
}

function asFatiguePlatform(value: string): AdFatiguePlatform | null {
  if (value === "meta" || value === "google_ads") return value;
  return null;
}

function evidenceAction(value: unknown): AdFatigueAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const action = (value as { action?: unknown }).action;
  return action === "keep" || action === "rotate" || action === "pause" ? action : null;
}

/**
 * Daily recommend-only pass. One check per ad per day.
 * Meta is the default source. Google is included only when MARKETING_AD_FATIGUE_PLATFORMS lists it.
 * Nothing here updates an ad, a status, or a budget.
 */
export async function runAdFatigue(now = new Date(), env: Env = process.env) {
  if (!adFatigueEnabled(env)) return { status: "skipped" as const, reason: "MARKETING_AD_FATIGUE is off" };
  const { prisma } = await import("../db");
  const { addDaysISO, zonedISODate } = await import("../time");
  const platforms = adFatiguePlatforms(env);
  const accounts = await prisma.adAccount.findMany({
    where: { platform: { in: platforms as AdPlatform[] } },
    select: { id: true, workspaceId: true, timezone: true, clientId: true },
  });
  let checks = 0;
  let recommendations = 0;
  for (const account of accounts) {
    const ran = await runAccount(prisma, account, platforms, now, env, addDaysISO, zonedISODate);
    checks += ran.checks;
    recommendations += ran.recommendations;
  }
  return { status: "ran" as const, checks, recommendations };
}

async function runAccount(
  prisma: Awaited<typeof import("../db")>["prisma"],
  account: { id: string; workspaceId: string; timezone: string; clientId: string | null },
  platforms: AdFatiguePlatform[],
  now: Date,
  env: Env,
  addDaysISO: (iso: string, days: number) => string,
  zonedISODate: (date: Date, timeZone: string) => string,
) {
  const today = zonedISODate(now, account.timezone || "America/New_York");
  const already = await prisma.adFatigueCheck.findFirst({
    where: isolatedWhere(account.workspaceId, { adAccountId: account.id, windowEnd: dayStart(today) }),
    select: { id: true },
  });
  if (already) return { checks: 0, recommendations: 0 };

  const since = dayStart(addDaysISO(today, -60));
  const metrics = await prisma.dailyMetric.findMany({
    where: isolatedWhere(account.workspaceId, {
      platform: { in: platforms as AdPlatform[] },
      date: { gte: since },
      campaign: { workspaceId: account.workspaceId, adAccountId: account.id },
    }),
    select: {
      id: true,
      date: true,
      platform: true,
      adId: true,
      attributionWindow: true,
      impressions: true,
      clicks: true,
      reach: true,
      spend: true,
      platformConversions: true,
      conversionValue: true,
      ad: {
        select: {
          name: true,
          creativeVersion: { select: { fingerprint: true, creativeId: true } },
          adGroup: { select: { campaign: { select: { id: true, name: true, adAccountId: true } } } },
        },
      },
    },
  });

  const assignments = await prisma.marketingAssignment.findMany({
    where: { workspaceId: account.workspaceId },
    select: { userId: true, scopeKind: true, adAccountId: true, campaignId: true },
  });
  const clientKey = account.clientId ? `client:${account.clientId}` : `account:${account.id}`;
  const ads = new Map<string, AdFatigueAd>();
  for (const metric of metrics) {
    const platform = asFatiguePlatform(metric.platform);
    const campaign = metric.ad.adGroup.campaign;
    if (!platform || !campaign) continue;
    let ad = ads.get(metric.adId);
    if (!ad) {
      ad = {
        adId: metric.adId,
        adName: metric.ad.name,
        platform,
        campaignId: campaign.id,
        campaignName: campaign.name,
        adAccountId: campaign.adAccountId,
        clientKey,
        assigneeUserId: pickAssignee(assignments, campaign.adAccountId, campaign.id),
        rows: [],
      };
      ads.set(metric.adId, ad);
    }
    ad.rows.push({
      id: metric.id,
      date: metric.date.toISOString().slice(0, 10),
      impressions: Number(metric.impressions),
      clicks: Number(metric.clicks),
      reach: Number(metric.reach),
      spend: dec(metric.spend),
      conversions: dec(metric.platformConversions),
      conversionValue: dec(metric.conversionValue),
      creativeKey: metric.ad.creativeVersion?.fingerprint || metric.ad.creativeVersion?.creativeId || metric.adId,
      attributionWindow: metric.attributionWindow,
    });
  }

  const historyRows = await prisma.adFatigueCheck.findMany({
    where: isolatedWhere(account.workspaceId, { adAccountId: account.id, detectedAt: { gte: new Date(now.getTime() - 45 * 86_400_000) } }),
    select: { adId: true, action: true, emitted: true, windowEnd: true },
  });
  const history: AdFatigueCheckPoint[] = historyRows.map((row) => ({
    adId: row.adId,
    action: row.action,
    emitted: row.emitted,
    at: row.windowEnd.toISOString().slice(0, 10),
  }));
  const recentRecs = await prisma.recommendation.findMany({
    where: {
      type: "ad_fatigue",
      adAccountId: account.id,
      createdAt: { gte: new Date(now.getTime() - 8 * 86_400_000) },
      campaign: { workspaceId: account.workspaceId },
    },
    select: { adId: true, evidence: true, createdAt: true },
  });
  const recentInbox: AdFatigueInboxItem[] = recentRecs.flatMap((row) => {
    const action = evidenceAction(row.evidence);
    if (!row.adId || !action) return [];
    return [{ adId: row.adId, action, at: row.createdAt.toISOString().slice(0, 10) }];
  });
  const storedPriors = await prisma.adFatiguePrior.findMany({
    where: isolatedWhere(account.workspaceId, { clientKey }),
    select: { clientKey: true, confidenceThreshold: true },
  });
  const thresholdByClient = adFatigueThresholdMap(env);
  const configured = Number(env.MARKETING_AD_FATIGUE_CONFIDENCE ?? AD_FATIGUE_CONFIDENCE_THRESHOLD);
  const plan = planAdFatigue({
    ads: [...ads.values()],
    today,
    history,
    recentInbox,
    priors: storedPriors.map((row) => ({ clientKey: row.clientKey, threshold: dec(row.confidenceThreshold) })),
    defaultThreshold: clampThreshold(configured),
    thresholdByClient,
  });

  for (const state of plan.states) {
    await prisma.adFatiguePrior.upsert({
      where: { workspaceId_clientKey: { workspaceId: account.workspaceId, clientKey: state.clientKey } },
      create: {
        workspaceId: account.workspaceId,
        clientKey: state.clientKey,
        confidenceThreshold: state.threshold.toFixed(4),
        clickDays: state.learned.clickDays.toFixed(4),
        viewDays: state.learned.viewDays.toFixed(4),
        goodChecksBeforeResume: state.learned.goodChecksBeforeResume.toFixed(4),
        observations: state.learned.observations,
        resumeEpisodes: state.learned.resumeEpisodes,
      },
      update: {
        confidenceThreshold: state.threshold.toFixed(4),
        clickDays: state.learned.clickDays.toFixed(4),
        viewDays: state.learned.viewDays.toFixed(4),
        goodChecksBeforeResume: state.learned.goodChecksBeforeResume.toFixed(4),
        observations: state.learned.observations,
        resumeEpisodes: state.learned.resumeEpisodes,
      },
    });
  }

  for (const check of plan.checks) {
    await prisma.adFatigueCheck.create({
      data: {
        workspaceId: account.workspaceId,
        clientKey: check.clientKey,
        platform: check.platform as AdPlatform,
        adId: check.adId,
        campaignId: check.campaignId,
        adAccountId: check.adAccountId,
        action: check.action,
        confidence: check.confidence.toFixed(4),
        emitted: check.emit,
        reason: check.reason,
        metric: check.metric,
        clickDays: check.learned.clickDays.toFixed(4),
        viewDays: check.learned.viewDays.toFixed(4),
        goodChecks: check.learned.goodChecksBeforeResume.toFixed(4),
        threshold: check.threshold.toFixed(4),
        sampleSize: check.sampleSize,
        signals: check.signals,
        windowStart: dayStart(check.windowStart),
        windowEnd: dayStart(check.windowEnd),
        recommendationOnly: true,
        changesSpend: false,
        detectedAt: now,
      },
    });
  }

  for (const recommendation of plan.recommendations) {
    await saveRecommendation(prisma, account.workspaceId, recommendation, now);
  }
  return { checks: plan.checks.length, recommendations: plan.recommendations.length };
}

async function saveRecommendation(
  prisma: Awaited<typeof import("../db")>["prisma"],
  workspaceId: string,
  recommendation: AdFatigueRecommendationDraft,
  now: Date,
) {
  await prisma.recommendation.create({
    data: {
      workspaceId,
      type: "ad_fatigue",
      status: "verified",
      adId: recommendation.adId,
      campaignId: recommendation.campaignId,
      adAccountId: recommendation.adAccountId,
      title: recommendation.title,
      summary: recommendation.summary,
      rationale: recommendation.rationale,
      metric: recommendation.metric,
      baseline: recommendation.baseline,
      observed: recommendation.observed,
      windowStart: dayStart(recommendation.windowStart),
      windowEnd: dayStart(recommendation.windowEnd),
      sampleSize: recommendation.sampleSize,
      sourceMetricIds: recommendation.sourceMetricIds,
      evidence: {
        action: recommendation.action,
        confidence: recommendation.confidence,
        assigneeUserId: recommendation.assigneeUserId,
        learned: recommendation.learned,
        changesSpend: false,
        writesAds: false,
        recommendationOnly: true,
      },
      verifiedAt: now,
      verifierNote: "Confirmed from stored ad rows. Yes only records the answer. Nothing on the ad account changes.",
    },
  });
}

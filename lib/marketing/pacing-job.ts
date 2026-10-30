import type { AdPlatform, BudgetType } from "@prisma/client";
import { prisma } from "../db";
import { addDaysISO, zonedISODate } from "../time";
import { coversCampaign, type MarketingAccess } from "./access";
import { pacingRecsEnabled } from "./config";
import { budgetSeenNote, evaluatePacing, pacingBarCopy, pacingChip, type HourRow, type PacingCampaign, type PacingRecommendationDraft, type SpendRow } from "./pacing";
import { readSeverity } from "./refire";
import { AD_PLATFORMS, WORKSPACE_ID } from "./types";

function dec(value: { toString(): string } | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

function asPlatform(value: string): AdPlatform | null {
  return (AD_PLATFORMS as readonly string[]).includes(value) ? (value as AdPlatform) : null;
}

function dayStart(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`);
}

function iso(value: Date | null | undefined) {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

export async function runPacingRecs(now = new Date()) {
  if (!pacingRecsEnabled()) return { status: "skipped" as const };
  const org = await prisma.org.findUnique({ where: { id: WORKSPACE_ID }, select: { timezone: true } });
  const today = zonedISODate(now, org?.timezone || "America/New_York");
  const since = dayStart(addDaysISO(today, -62));
  const [campaigns, metrics, hourly, ads, priorRecs] = await Promise.all([
    prisma.campaign.findMany({
      select: {
        id: true,
        name: true,
        adAccountId: true,
        platform: true,
        budgetAmount: true,
        budgetType: true,
        budgetCurrency: true,
        startDate: true,
        endDate: true,
      },
    }),
    prisma.dailyMetric.findMany({
      where: { date: { gte: since } },
      select: { campaignId: true, adId: true, date: true, spend: true, platformConversions: true, platformLeads: true, impressions: true },
    }),
    prisma.adHourlyMetric.findMany({
      where: { date: { gte: since } },
      select: { adId: true, date: true, hour: true, impressions: true, conversions: true },
    }),
    prisma.ad.findMany({ select: { id: true, adGroup: { select: { campaignId: true } } } }),
    prisma.recommendation.findMany({
      where: { type: "pacing", createdAt: { gte: new Date(now.getTime() - 14 * 86_400_000) } },
      orderBy: { createdAt: "desc" },
      select: { campaignId: true, evidence: true, createdAt: true },
    }),
  ]);
  const campaignByAd = new Map(ads.map((ad) => [ad.id, ad.adGroup.campaignId]));
  const topAd = new Map<string, { adId: string; spend: number }>();
  const spend = new Map<string, SpendRow>();
  for (const metric of metrics) {
    if (!metric.campaignId) continue;
    const key = `${metric.campaignId}:${metric.date.toISOString().slice(0, 10)}`;
    const row = spend.get(key) ?? {
      campaignId: metric.campaignId,
      date: metric.date.toISOString().slice(0, 10),
      spend: 0,
      conversions: 0,
      leads: 0,
      impressions: 0,
    };
    const amount = dec(metric.spend);
    row.spend += amount;
    row.conversions += dec(metric.platformConversions);
    row.leads += dec(metric.platformLeads);
    row.impressions += Number(metric.impressions);
    spend.set(key, row);
    const current = topAd.get(metric.campaignId);
    if (!current || amount > current.spend) topAd.set(metric.campaignId, { adId: metric.adId, spend: amount });
  }
  const hours: HourRow[] = hourly.flatMap((row) => {
    const campaignId = campaignByAd.get(row.adId);
    if (!campaignId) return [];
    return [{ campaignId, date: row.date.toISOString().slice(0, 10), hour: row.hour, impressions: Number(row.impressions), conversions: dec(row.conversions) }];
  });
  const pacingCampaigns: PacingCampaign[] = campaigns.flatMap((campaign) => {
    if ((campaign.budgetType !== "daily" && campaign.budgetType !== "lifetime") || campaign.budgetAmount === null) return [];
    return [
      {
        campaignId: campaign.id,
        name: campaign.name,
        adAccountId: campaign.adAccountId,
        platform: campaign.platform,
        budgetAmount: dec(campaign.budgetAmount),
        budgetPeriod: campaign.budgetType,
        currency: campaign.budgetCurrency,
        startDate: iso(campaign.startDate),
        endDate: iso(campaign.endDate),
        adId: topAd.get(campaign.id)?.adId ?? null,
      },
    ];
  });
  const evaluated = evaluatePacing({
    today,
    campaigns: pacingCampaigns,
    spend: [...spend.values()],
    hours,
    now: now.toISOString(),
    previous: priorRecs.flatMap((rec) =>
      rec.campaignId ? [{ campaignId: rec.campaignId, severity: readSeverity(rec.evidence), at: rec.createdAt.toISOString() }] : [],
    ),
  });
  let snapshots = 0;
  for (const snapshot of evaluated.snapshots) {
    const platform = asPlatform(snapshot.platform);
    if (!platform) continue;
    const data = {
      platform,
      periodStart: dayStart(snapshot.periodStart),
      periodEnd: dayStart(snapshot.periodEnd),
      dayOfPeriod: snapshot.dayOfPeriod,
      daysInPeriod: snapshot.daysInPeriod,
      budgetAmount: snapshot.budgetAmount,
      budgetPeriod: snapshot.budgetPeriod as BudgetType,
      currency: snapshot.currency,
      spendToDate: snapshot.spendToDate,
      expectedSpend: snapshot.expectedSpend,
      projectedSpend: snapshot.projectedSpend,
      paceRatio: snapshot.paceRatio,
      marginalCpa: snapshot.marginalCpa,
      costPerQualifiedLead: snapshot.costPerQualifiedLead,
      qualifiedLeadBasis: snapshot.qualifiedLeadBasis,
      status: snapshot.status,
      severity: snapshot.severity,
      recommendationOnly: true,
      dedupeKey: snapshot.dedupeKey,
      detectedAt: now,
    };
    const existing = await prisma.pacingSnapshot.findFirst({
      where: { campaignId: snapshot.campaignId, detectedAt: { gte: dayStart(today) } },
      select: { id: true },
    });
    if (existing) await prisma.pacingSnapshot.update({ where: { id: existing.id }, data });
    else {
      await prisma.pacingSnapshot.create({
        data: { workspaceId: WORKSPACE_ID, campaignId: snapshot.campaignId, adAccountId: snapshot.adAccountId, ...data },
      });
    }
    snapshots += 1;
    if (snapshot.status === "on_track" || !snapshot.adId) continue;
    const code = snapshot.status === "under" ? "pacing_under" : snapshot.status === "critical" ? "pacing_critical" : "pacing_over";
    const already = evaluated.recommendations.some((rec) => rec.campaignId === snapshot.campaignId);
    if (!already && snapshot.severity === "info") continue;
    const previousAlert = await prisma.adAlert.findFirst({
      where: { campaignId: snapshot.campaignId, code: { in: ["pacing_over", "pacing_under", "pacing_critical"] } },
      orderBy: { detectedAt: "desc" },
    });
    const blocked = previousAlert && now.getTime() - previousAlert.detectedAt.getTime() < 3 * 86_400_000 && previousAlert.severity === snapshot.severity;
    if (blocked) continue;
    await prisma.adAlert.create({
      data: {
        adId: snapshot.adId,
        adAccountId: snapshot.adAccountId,
        campaignId: snapshot.campaignId,
        severity: snapshot.severity === "info" ? "warning" : snapshot.severity,
        code,
        title: snapshot.bar,
        summary: "Recommendation only. The platform will not change this budget.",
        metric: "pacing",
        observed: snapshot.projectedSpend.toFixed(4),
        baseline: snapshot.budgetForPeriod.toFixed(4),
        windowStart: dayStart(snapshot.periodStart),
        windowEnd: dayStart(snapshot.periodEnd),
        sampleSize: snapshot.dayOfPeriod,
        evidence: { recommendationOnly: true, status: snapshot.status },
        sourceMetricIds: [],
        dataLandedAt: now,
        detectedAt: now,
      },
    });
  }
  let recommendations = 0;
  for (const draft of evaluated.recommendations) {
    await savePacingRecommendation(draft, now);
    recommendations += 1;
  }
  return { status: "ran" as const, snapshots, recommendations };
}

async function savePacingRecommendation(draft: PacingRecommendationDraft, now: Date) {
  await prisma.recommendation.create({
    data: {
      type: "pacing",
      status: "verified",
      adId: draft.adId,
      campaignId: draft.campaignId,
      adAccountId: draft.adAccountId,
      title: draft.title,
      summary: draft.summary,
      rationale: draft.rationale,
      metric: "pacing",
      baseline: draft.baseline,
      observed: draft.observed,
      windowStart: dayStart(draft.windowStart),
      windowEnd: dayStart(draft.windowEnd),
      sampleSize: draft.sampleSize,
      sourceMetricIds: [],
      evidence: {
        severity: draft.severity,
        recommendationOnly: true,
        writesBudget: false,
        shifts: draft.shifts,
        accountTotalBefore: draft.accountTotalBefore,
        accountTotalAfter: draft.accountTotalAfter,
      },
      currentBudgetAmount: draft.currentBudgetAmount,
      currentBudgetPeriod: draft.currentBudgetPeriod,
      proposedBudgetAmount: draft.proposedBudgetAmount,
      proposedBudgetPeriod: draft.proposedBudgetPeriod,
      proposedCurrency: draft.proposedCurrency,
      verifiedAt: now,
      verifierNote: "Recommendation only. Confirmed from stored spend. No budget was written.",
    },
  });
}

export async function loadPacingBoard(access: MarketingAccess) {
  if (!pacingRecsEnabled()) return { enabled: false as const, recommendationOnly: true as const, writesBudget: false as const, bars: [] as PacingBar[] };
  const [snapshots, done] = await Promise.all([
    prisma.pacingSnapshot.findMany({
      orderBy: { detectedAt: "desc" },
      take: 200,
      include: { campaign: { select: { name: true, reportedBudgetAmount: true } } },
    }),
    prisma.recommendation.findMany({
      where: { type: "pacing", status: "accepted", decisionNote: "done" },
      orderBy: { decidedAt: "desc" },
      select: { campaignId: true, proposedBudgetAmount: true, proposedCurrency: true },
    }),
  ]);
  const seen = new Set<string>();
  const bars: PacingBar[] = [];
  for (const snapshot of snapshots) {
    if (seen.has(snapshot.campaignId)) continue;
    seen.add(snapshot.campaignId);
    if (!coversCampaign(access, { adAccountId: snapshot.adAccountId, campaignId: snapshot.campaignId })) continue;
    const budgetForPeriod = snapshot.budgetPeriod === "daily" ? dec(snapshot.budgetAmount) * snapshot.daysInPeriod : dec(snapshot.budgetAmount);
    const match = done.find((rec) => rec.campaignId === snapshot.campaignId);
    const reported = snapshot.campaign.reportedBudgetAmount === null ? null : dec(snapshot.campaign.reportedBudgetAmount);
    const proposed = match?.proposedBudgetAmount ? dec(match.proposedBudgetAmount) : null;
    const periodLabel = snapshot.budgetPeriod === "lifetime" ? "lifetime budget" : "monthly budget";
    bars.push({
      campaignId: snapshot.campaignId,
      name: snapshot.campaign.name,
      status: snapshot.status,
      chip: pacingChip(snapshot.status),
      text: pacingBarCopy({
        spendToDate: dec(snapshot.spendToDate),
        budgetForPeriod,
        dayOfPeriod: snapshot.dayOfPeriod,
        daysInPeriod: snapshot.daysInPeriod,
        projectedSpend: dec(snapshot.projectedSpend),
        currency: snapshot.currency,
        periodLabel,
      }),
      verification: budgetSeenNote(reported, proposed, match?.proposedCurrency || snapshot.currency),
      recommendationOnly: true,
    });
  }
  return { enabled: true as const, recommendationOnly: true as const, writesBudget: false as const, bars };
}

export type PacingBar = {
  campaignId: string;
  name: string;
  status: string;
  chip: string;
  text: string;
  verification: string;
  recommendationOnly: true;
};

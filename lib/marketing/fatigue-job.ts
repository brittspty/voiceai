import type { AdPlatform } from "@prisma/client";
import { prisma } from "../db";
import { addDaysISO, zonedISODate } from "../time";
import type { MarketingAccess } from "./access";
import { creativeFatigueEnabled } from "./config";
import { detectFatigue, presentFatigueSignal, type FatigueHit, type FatiguePoint } from "./fatigue";
import { readSeverity } from "./refire";
import { accessScopeWhere } from "./scope";
import { AD_PLATFORMS } from "./types";
import { isolatedWhere } from "./workspace";

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

async function saveSignal(workspaceId: string, hit: FatigueHit, fatigued: boolean, today: string, now: Date) {
  const platform = asPlatform(hit.platform);
  if (!platform) return;
  const data = {
    platform,
    adId: hit.adId,
    creativeVersionId: hit.creativeVersionId,
    campaignId: hit.campaignId,
    adAccountId: hit.adAccountId,
    frequency: hit.frequency,
    ctrRecent: hit.ctrRecent,
    ctrPrior: hit.ctrPrior,
    ctrSlope: hit.ctrSlope,
    cpaRecent: hit.cpaRecent,
    cpaPrior: hit.cpaPrior,
    fatigued,
    reasons: hit.reasons,
    windowStart: dayStart(hit.windowStart),
    windowEnd: dayStart(hit.windowEnd),
    sampleSize: hit.sampleSize,
    dedupeKey: hit.dedupeKey,
    detectedAt: now,
  };
  const existing = await prisma.fatigueSignal.findFirst({
    where: isolatedWhere(workspaceId, { adId: hit.adId, adAccountId: hit.adAccountId, detectedAt: { gte: dayStart(today) } }),
    select: { id: true },
  });
  if (existing) {
    await prisma.fatigueSignal.update({ where: { id: existing.id }, data });
    return;
  }
  await prisma.fatigueSignal.create({ data: { ...isolatedWhere(workspaceId), ...data } });
}

async function draftVersion(workspaceId: string, hit: FatigueHit) {
  if (!hit.variation || !hit.creativeId) return null;
  const existing = await prisma.creativeVersion.findUnique({
    where: { workspaceId_fingerprint: { workspaceId: isolatedWhere(workspaceId).workspaceId, fingerprint: hit.variation.fingerprint } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.creativeVersion.create({
    data: {
      workspaceId: isolatedWhere(workspaceId).workspaceId,
      creativeId: hit.creativeId,
      versionLabel: "Draft variation",
      fingerprint: hit.variation.fingerprint,
      status: "draft",
      headline: hit.variation.headline,
      body: hit.variation.body,
    },
    select: { id: true },
  });
  return created.id;
}

async function runCreativeFatigueAccount(workspaceId: string, adAccountId: string, timezone: string, now: Date) {
  const today = zonedISODate(now, timezone || "America/New_York");
  const since = dayStart(addDaysISO(today, -20));
  const metrics = await prisma.dailyMetric.findMany({
    where: isolatedWhere(workspaceId, { date: { gte: since }, campaign: { workspaceId, adAccountId } }),
    include: {
      ad: {
        select: {
          name: true,
          creativeVersion: { select: { id: true, creativeId: true, headline: true } },
          adGroup: { select: { campaign: { select: { id: true, name: true, adAccountId: true } } } },
        },
      },
    },
  });
  const rows: FatiguePoint[] = metrics.flatMap((metric) => {
    const campaign = metric.ad.adGroup.campaign;
    return [
      {
        id: metric.id,
        platform: metric.platform,
        adId: metric.adId,
        adName: metric.ad.name,
        creativeVersionId: metric.ad.creativeVersion?.id ?? null,
        creativeId: metric.ad.creativeVersion?.creativeId ?? null,
        headline: metric.ad.creativeVersion?.headline ?? "",
        campaignId: campaign.id,
        campaignName: campaign.name,
        adAccountId: campaign.adAccountId,
        date: metric.date.toISOString().slice(0, 10),
        impressions: Number(metric.impressions),
        clicks: Number(metric.clicks),
        reach: Number(metric.reach),
        spend: dec(metric.spend),
        conversions: dec(metric.platformConversions),
        leads: dec(metric.platformLeads),
      },
    ];
  });
  const priorRecs = await prisma.recommendation.findMany({
    where: {
      type: "creative_fatigue",
      adAccountId,
      createdAt: { gte: new Date(now.getTime() - 14 * 86_400_000) },
      campaign: { workspaceId: isolatedWhere(workspaceId).workspaceId },
    },
    orderBy: { createdAt: "desc" },
    select: { adId: true, evidence: true, createdAt: true },
  });
  const detected = detectFatigue({
    rows,
    today,
    now: now.toISOString(),
    previous: priorRecs.flatMap((rec) =>
      rec.adId ? [{ adId: rec.adId, severity: readSeverity(rec.evidence), at: rec.createdAt.toISOString() }] : [],
    ),
  });
  let signals = 0;
  let recommendations = 0;
  for (const hit of detected.flagged) {
    await saveSignal(workspaceId, hit, true, today, now);
    signals += 1;
    if (!hit.emit) continue;
    const draftId = await draftVersion(workspaceId, hit);
    await prisma.adAlert.create({
      data: {
        adId: hit.adId,
        adAccountId: hit.adAccountId,
        campaignId: hit.campaignId,
        severity: hit.severity,
        code: "creative_fatigue",
        title: hit.publicHeadline,
        summary: "This ad looks tired. A person can approve a new version. Nothing publishes on its own.",
        metric: hit.metric === "cpa" ? "cpa" : hit.metric,
        observed: hit.observed,
        baseline: hit.baseline,
        windowStart: dayStart(hit.windowStart),
        windowEnd: dayStart(hit.windowEnd),
        sampleSize: hit.sampleSize,
        evidence: { reasons: hit.reasons.filter((reason) => reason !== "cpa_rise"), sampleSize: hit.sampleSize },
        sourceMetricIds: hit.sourceMetricIds,
        dataLandedAt: now,
        detectedAt: now,
      },
    });
    await prisma.recommendation.create({
      data: {
        type: "creative_fatigue",
        status: "verified",
        adId: hit.adId,
        campaignId: hit.campaignId,
        adAccountId: hit.adAccountId,
        title: hit.headline,
        summary: hit.summary,
        rationale: hit.rationale,
        metric: hit.metric,
        baseline: hit.baseline,
        observed: hit.observed,
        windowStart: dayStart(hit.windowStart),
        windowEnd: dayStart(hit.windowEnd),
        sampleSize: hit.sampleSize,
        sourceMetricIds: hit.sourceMetricIds,
        evidence: {
          severity: hit.severity,
          reasons: hit.reasons,
          frequency: hit.frequency,
          ctrRecent: hit.ctrRecent,
          ctrPrior: hit.ctrPrior,
          ctrSlope: hit.ctrSlope,
          cpaRecent: hit.cpaRecent,
          cpaPrior: hit.cpaPrior,
          draftCreativeVersionId: draftId,
          preview: hit.variation ? `${hit.variation.current} vs ${hit.variation.proposed}` : "Preview not available",
          changesSpend: false,
        },
        verifiedAt: now,
        verifierNote: "Confirmed from stored ad rows. Approving queues a draft and does not publish it.",
      },
    });
    recommendations += 1;
  }
  const stillTired = new Set(detected.flagged.map((hit) => hit.adId));
  const previousRows = detected.healthyAdIds.length
    ? await prisma.fatigueSignal.findMany({
        where: isolatedWhere(workspaceId, {
          adAccountId,
          fatigued: true,
          detectedAt: { gte: new Date(now.getTime() - 14 * 86_400_000) },
          adId: { in: detected.healthyAdIds },
        }),
        orderBy: { detectedAt: "desc" },
      })
    : [];
  const seenHealthy = new Set<string>();
  const previous = previousRows.filter((row) => {
    if (seenHealthy.has(row.adId)) return false;
    seenHealthy.add(row.adId);
    return true;
  });
  for (const prior of previous) {
    if (stillTired.has(prior.adId)) continue;
    const existing = await prisma.fatigueSignal.findFirst({
      where: isolatedWhere(workspaceId, { adId: prior.adId, adAccountId, detectedAt: { gte: dayStart(today) } }),
      select: { id: true },
    });
    const data = {
      fatigued: false,
      reasons: [],
      detectedAt: now,
      frequency: prior.frequency,
      ctrRecent: prior.ctrRecent,
      ctrPrior: prior.ctrPrior,
      ctrSlope: prior.ctrSlope,
      cpaRecent: null,
      cpaPrior: null,
    };
    if (existing) await prisma.fatigueSignal.update({ where: { id: existing.id }, data });
    else {
      await prisma.fatigueSignal.create({
        data: {
          workspaceId: isolatedWhere(workspaceId).workspaceId,
          platform: prior.platform,
          adId: prior.adId,
          creativeVersionId: prior.creativeVersionId,
          campaignId: prior.campaignId,
          adAccountId: prior.adAccountId,
          windowStart: prior.windowStart,
          windowEnd: prior.windowEnd,
          sampleSize: prior.sampleSize,
          dedupeKey: prior.dedupeKey,
          ...data,
        },
      });
    }
  }
  return { signals, recommendations };
}

export async function runCreativeFatigue(now = new Date()) {
  if (!creativeFatigueEnabled()) return { status: "skipped" as const };
  const accounts = await prisma.adAccount.findMany({ select: { id: true, workspaceId: true, timezone: true } });
  let signals = 0;
  let recommendations = 0;
  for (const account of accounts) {
    const ran = await runCreativeFatigueAccount(account.workspaceId, account.id, account.timezone, now);
    signals += ran.signals;
    recommendations += ran.recommendations;
  }
  return { status: "ran" as const, signals, recommendations };
}

export async function loadFatigueBoard(access: MarketingAccess) {
  if (!creativeFatigueEnabled()) return { enabled: false as const, ads: [] as NonNullable<ReturnType<typeof presentFatigueSignal>>[] };
  if (!access.workspaceId.trim()) return { enabled: true as const, ads: [] as NonNullable<ReturnType<typeof presentFatigueSignal>>[] };
  const scope = accessScopeWhere(access);
  const signals = await prisma.fatigueSignal.findMany({
    where: { ...scope, detectedAt: { gte: new Date(Date.now() - 14 * 86_400_000) } },
    orderBy: { detectedAt: "desc" },
    take: 300,
    select: {
      adId: true,
      campaignId: true,
      adAccountId: true,
      platform: true,
      frequency: true,
      ctrRecent: true,
      ctrPrior: true,
      cpaRecent: true,
      cpaPrior: true,
      reasons: true,
      fatigued: true,
      ad: { select: { name: true } },
    },
  });
  const seen = new Set<string>();
  const ads = [];
  for (const signal of signals) {
    if (seen.has(signal.adId)) continue;
    seen.add(signal.adId);
    const cpaRecent = access.seesCost ? dec(signal.cpaRecent) : null;
    const cpaPrior = access.seesCost ? dec(signal.cpaPrior) : null;
    const cpaRisePct = cpaRecent && cpaPrior && cpaPrior > 0 ? ((cpaRecent - cpaPrior) / cpaPrior) * 100 : null;
    const card = presentFatigueSignal(
      {
        adId: signal.adId,
        adName: signal.ad.name,
        campaignId: signal.campaignId,
        platform: signal.platform,
        frequency: signal.frequency === null ? null : dec(signal.frequency),
        ctrRecent: signal.ctrRecent === null ? null : dec(signal.ctrRecent),
        ctrPrior: signal.ctrPrior === null ? null : dec(signal.ctrPrior),
        reasons: signal.reasons,
        fatigued: signal.fatigued,
        cpaRisePct,
      },
      access.seesCost,
    );
    if (card) ads.push(card);
  }
  return { enabled: true as const, ads };
}

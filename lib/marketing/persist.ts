import { prisma } from "../db";
import { accessFromUser } from "./access";
import {
  alertMinImpressions,
  baselineDays,
  digestEnabled,
  leadScoringEnabled,
  monitorEnabled,
  speedToLeadEnabled,
  recommendationMinClicks,
  recommendationMinImpressions,
  verticalBenchmarks,
} from "./config";
import { listWaitingFatigueDecisions } from "./channels/query";
import { buildManagerDigest, fatigueChoice, type DigestDecision } from "./digest";
import { dispatchDigestDelivery } from "./digest-send";
import { WORKSPACE_ID } from "./types";
import { leadQualityDigestNote } from "./lead-score/summary";
import { waitingForMarkCount } from "./lead-score/store";
import { evaluateAds, type HourPoint, type HumanBudget, type MetricPoint } from "./monitor";
import { verifyRecommendation } from "./recommendations";
import { speedDigestItems } from "./speed-to-lead-store";
import { addDaysISO, zonedISODate } from "../time";

function dec(value: { toString(): string } | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function loadMonitorRows(): Promise<{ rows: MetricPoint[]; hours: HourPoint[]; budgets: HumanBudget[] }> {
  const [metrics, hourly, campaigns] = await Promise.all([
    prisma.dailyMetric.findMany({
      include: {
        ad: { select: { id: true, name: true, adGroup: { select: { id: true, campaignId: true, campaign: { select: { adAccountId: true, objective: true } } } } } },
      },
    }),
    prisma.adHourlyMetric.findMany(),
    prisma.campaign.findMany({ select: { id: true, budgetAmount: true, budgetType: true, budgetCurrency: true } }),
  ]);
  const rows: MetricPoint[] = metrics.map((metric) => ({
    id: metric.id,
    adId: metric.adId,
    adName: metric.ad.name,
    adGroupId: metric.ad.adGroup.id,
    campaignId: metric.ad.adGroup.campaignId,
    adAccountId: metric.ad.adGroup.campaign.adAccountId,
    objective: metric.ad.adGroup.campaign.objective,
    date: metric.date.toISOString().slice(0, 10),
    ingestedAt: metric.ingestedAt.toISOString(),
    spend: dec(metric.spend),
    impressions: Number(metric.impressions),
    clicks: Number(metric.clicks),
    linkClicks: Number(metric.linkClicks),
    reach: Number(metric.reach),
    leads: dec(metric.platformLeads),
    conversions: dec(metric.platformConversions),
    conversionValue: dec(metric.conversionValue),
  }));
  const hours = hourly.map((row) => ({
    adId: row.adId,
    hour: row.hour,
    clicks: Number(row.clicks),
    impressions: Number(row.impressions),
    conversions: dec(row.conversions),
  }));
  const budgets = campaigns.flatMap((campaign) => {
    if ((campaign.budgetType !== "daily" && campaign.budgetType !== "lifetime") || campaign.budgetAmount === null) return [];
    return [{ campaignId: campaign.id, amount: dec(campaign.budgetAmount), period: campaign.budgetType, currency: campaign.budgetCurrency }];
  });
  return { rows, hours, budgets };
}

export async function runStoredMonitor(now = new Date()) {
  if (!monitorEnabled()) return { status: "skipped" as const };
  const org = await prisma.org.findUnique({ where: { id: "org" }, select: { timezone: true } });
  const timeZone = org?.timezone || "America/New_York";
  const today = zonedISODate(now, timeZone);
  const yesterday = addDaysISO(today, -1);
  const { rows, hours, budgets } = await loadMonitorRows();
  const evaluated = evaluateAds({
    rows,
    hours,
    budgets,
    now,
    today,
    yesterday,
    baselineDays: baselineDays(),
    alertMinImpressions: alertMinImpressions(),
    benchmarks: verticalBenchmarks(),
  });
  for (const alert of evaluated.alerts) {
    await prisma.adAlert.create({
      data: {
        adId: alert.adId,
        adAccountId: alert.adAccountId,
        campaignId: alert.campaignId,
        severity: alert.severity,
        code: alert.code,
        title: alert.title,
        summary: alert.summary,
        metric: alert.metric,
        observed: alert.observed,
        baseline: alert.baseline,
        windowStart: new Date(`${alert.windowStart}T00:00:00.000Z`),
        windowEnd: new Date(`${alert.windowEnd}T00:00:00.000Z`),
        sampleSize: alert.sampleSize,
        evidence: { metric: alert.metric, baseline: alert.baseline, observed: alert.observed, sampleSize: alert.sampleSize, sourceMetricIds: alert.sourceMetricIds },
        sourceMetricIds: alert.sourceMetricIds,
        dataLandedAt: new Date(alert.dataLandedAt),
        detectedAt: now,
      },
    });
  }
  const thresholds = { minImpressions: recommendationMinImpressions(), minClicks: recommendationMinClicks(), today, yesterday };
  for (const draft of evaluated.drafts) {
    const check = verifyRecommendation(draft, rows, thresholds);
    await prisma.recommendation.create({
      data: {
        type: draft.type,
        status: check.status,
        adId: draft.adId,
        campaignId: draft.campaignId,
        adAccountId: draft.adAccountId,
        title: draft.title,
        summary: draft.summary,
        rationale: draft.rationale,
        metric: draft.metric,
        baseline: draft.baseline,
        observed: draft.observed,
        windowStart: new Date(`${draft.windowStart}T00:00:00.000Z`),
        windowEnd: new Date(`${draft.windowEnd}T00:00:00.000Z`),
        sampleSize: check.sampleSize,
        sourceMetricIds: draft.sourceMetricIds,
        evidence: {
          metric: draft.metric,
          baseline: draft.baseline,
          observed: draft.observed,
          windowStart: draft.windowStart,
          windowEnd: draft.windowEnd,
          sampleSize: check.sampleSize,
          sourceMetricIds: draft.sourceMetricIds,
        },
        currentBudgetAmount: draft.currentBudgetAmount,
        currentBudgetPeriod: draft.currentBudgetPeriod,
        proposedBudgetAmount: draft.proposedBudgetAmount,
        proposedBudgetPeriod: draft.proposedBudgetPeriod,
        proposedCurrency: draft.proposedCurrency,
        verifiedAt: check.status === "verified" ? now : null,
        verifierNote: check.note,
      },
    });
  }
  return { status: "ran" as const, alerts: evaluated.alerts.length, drafts: evaluated.drafts.length };
}

function evidenceReasons(evidence: unknown) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return [] as string[];
  const reasons = (evidence as { reasons?: unknown }).reasons;
  return Array.isArray(reasons) ? reasons.filter((reason): reason is string => typeof reason === "string") : [];
}

function evidenceSeverity(evidence: unknown) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return "";
  const severity = (evidence as { severity?: unknown }).severity;
  return typeof severity === "string" ? severity : "";
}

export async function runStoredDigests(now = new Date()) {
  if (!digestEnabled()) return { status: "skipped" as const };
  const periodStart = new Date(now.getTime() - 60 * 60 * 1000);
  const speed = speedToLeadEnabled() ? await speedDigestItems(periodStart) : { alerts: [], recommendations: [] };
  const inboxFatigue = await listWaitingFatigueDecisions(WORKSPACE_ID, periodStart)
    .then((rows) =>
      rows.flatMap((row): DigestDecision[] => {
        if ((row.kind !== "fatigue_pause" && row.kind !== "fatigue_rotation") || !row.assigneeId) return [];
        return [{
          id: row.id,
          title: row.title,
          summary: row.reasoning,
          accountId: row.adAccountId || "",
          prompt: row.kind === "fatigue_pause" ? "pause" : "rotate",
          reason: row.reasoning,
          assigneeId: row.assigneeId,
        }];
      }),
    )
    .catch(() => [] as DigestDecision[]);
  const [managers, alerts, recommendations, pendingFatigue, org] = await Promise.all([
    prisma.user.findMany({ where: { role: "account_manager" }, include: { marketingScopes: true } }),
    prisma.adAlert.findMany({ where: { createdAt: { gte: periodStart } } }),
    prisma.recommendation.findMany({
      where: {
        status: "verified",
        verifiedAt: { gte: periodStart },
        ...(speedToLeadEnabled() ? { type: { not: "speed_to_lead" as const } } : {}),
      },
    }),
    prisma.recommendation.findMany({
      where: { type: "creative_fatigue", status: "verified", decidedAt: null },
    }),
    prisma.org.findUnique({ where: { id: "org" }, select: { testMode: true } }),
  ]);
  const testMode = org?.testMode !== false;
  const decisions: DigestDecision[] = [
    ...pendingFatigue.map((rec) => {
      const choice = fatigueChoice({ reasons: evidenceReasons(rec.evidence), severity: evidenceSeverity(rec.evidence), metric: rec.metric });
      return {
        id: rec.id,
        title: rec.title,
        summary: rec.summary,
        accountId: rec.adAccountId || "",
        campaignId: rec.campaignId || "",
        workspaceId: rec.workspaceId,
        prompt: choice.prompt,
        reason: choice.reason,
      };
    }),
    ...inboxFatigue,
  ];
  let written = 0;
  for (const manager of managers) {
    const assignments = manager.marketingScopes.map((row) => ({
      workspaceId: row.workspaceId,
      scopeKind: row.scopeKind,
      adAccountId: row.adAccountId,
      campaignId: row.campaignId,
    }));
    const access = accessFromUser(manager, assignments);
    const draft = buildManagerDigest({
      userId: manager.id,
      accountIds: access.accounts,
      assignments,
      periodStart,
      periodEnd: now,
      alerts: [...alerts.map((alert) => ({ id: alert.id, title: alert.title, summary: alert.summary, accountId: alert.adAccountId, campaignId: alert.campaignId, workspaceId: alert.workspaceId })), ...speed.alerts],
      recommendations: [...recommendations.filter((rec) => rec.type !== "creative_fatigue").map((rec) => ({ id: rec.id, title: rec.title, summary: rec.summary, accountId: rec.adAccountId || "", campaignId: rec.campaignId || "", workspaceId: rec.workspaceId })), ...speed.recommendations],
      decisions,
      notes: leadScoringEnabled() && access.workspaceId ? [leadQualityDigestNote(await waitingForMarkCount(access.workspaceId))].filter((note): note is string => Boolean(note)) : [],
    });
    if (!draft) continue;
    const saved = await prisma.managerDigest.create({
      data: {
        userId: draft.userId,
        periodStart: draft.periodStart,
        periodEnd: draft.periodEnd,
        payload: draft.payload,
        delivery: draft.delivery,
      },
    });
    if (draft.delivery === "queued") {
      await dispatchDigestDelivery({
        digestId: saved.id,
        userId: manager.id,
        email: manager.email,
        name: manager.name,
        payload: draft.payload,
        testMode,
      });
    }
    written += 1;
  }
  if (speed.alerts.length || speed.recommendations.length || inboxFatigue.length) {
    const admins = await prisma.user.findMany({ where: { role: "super_admin" } });
    for (const admin of admins) {
      if (managers.some((manager) => manager.id === admin.id)) continue;
      const draft = buildManagerDigest({
        userId: admin.id,
        accountIds: [],
        alerts: speed.alerts,
        recommendations: speed.recommendations,
        decisions: inboxFatigue,
        seesAllDecisions: true,
        periodStart,
        periodEnd: now,
      });
      if (!draft) continue;
      const saved = await prisma.managerDigest.create({
        data: {
          userId: draft.userId,
          periodStart: draft.periodStart,
          periodEnd: draft.periodEnd,
          payload: draft.payload,
          delivery: draft.delivery,
        },
      });
      if (draft.delivery === "queued") {
        await dispatchDigestDelivery({
          digestId: saved.id,
          userId: admin.id,
          email: admin.email,
          name: admin.name,
          payload: draft.payload,
          testMode,
        });
      }
      written += 1;
    }
  }
  return { status: "ran" as const, written };
}

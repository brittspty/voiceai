import type { AlertSeverity, BudgetType, Prisma, RecommendationType } from "@prisma/client";
import { prisma } from "../../db";
import { WORKSPACE_ID } from "../types";
import { alertDedupeKey } from "./key";
import type { DecisionDraft } from "./rules";

function day(value: string) {
  if (!value) return null;
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function clientOrNull(clientId: string) {
  const trimmed = clientId.trim();
  return trimmed || null;
}

export async function upsertOpenRecommendation(
  draft: DecisionDraft,
  now: Date,
  extra?: {
    status?: "draft" | "verified";
    verifierNote?: string;
    adAccountId?: string | null;
    currentBudgetAmount?: string | null;
    currentBudgetPeriod?: BudgetType | null;
    proposedBudgetAmount?: string | null;
    proposedBudgetPeriod?: BudgetType | null;
    proposedCurrency?: string | null;
  },
) {
  const workspaceId = WORKSPACE_ID;
  const existing = await prisma.recommendation.findFirst({
    where: {
      workspaceId,
      dedupeKey: draft.dedupeKey,
      archivedAt: null,
      decidedById: null,
      status: { in: ["draft", "verified"] },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  const data = {
    type: draft.type as RecommendationType,
    status: extra?.status ?? "verified",
    adId: draft.adId,
    campaignId: draft.campaignId,
    adAccountId: extra?.adAccountId ?? null,
    clientId: clientOrNull(draft.clientId),
    dedupeKey: draft.dedupeKey,
    rule: draft.rule,
    severity: draft.severity,
    title: draft.title,
    summary: draft.summary,
    rationale: draft.rationale,
    metric: draft.metric,
    baseline: draft.baseline,
    observed: draft.observed,
    windowStart: day(draft.windowStart),
    windowEnd: day(draft.windowEnd),
    sampleSize: Math.round(draft.sampleSize),
    sourceMetricIds: draft.sourceMetricIds,
    evidence: draft.evidence as Prisma.InputJsonValue,
    currentBudgetAmount: extra?.currentBudgetAmount ?? null,
    currentBudgetPeriod: extra?.currentBudgetPeriod ?? null,
    proposedBudgetAmount: extra?.proposedBudgetAmount ?? null,
    proposedBudgetPeriod: extra?.proposedBudgetPeriod ?? null,
    proposedCurrency: extra?.proposedCurrency ?? null,
    lastSeenAt: now,
    verifiedAt: (extra?.status ?? "verified") === "verified" ? now : null,
    verifierNote: extra?.verifierNote ?? "Confirmed against the stored rows.",
  };
  if (!draft.dedupeKey) {
    return prisma.recommendation.create({ data: { ...data, workspaceId } });
  }
  if (existing) {
    return prisma.recommendation.update({ where: { id: existing.id }, data });
  }
  return prisma.recommendation.create({ data: { ...data, workspaceId } });
}

export type AlertWrite = {
  adId: string;
  adAccountId: string;
  campaignId: string;
  clientId: string;
  severity: AlertSeverity;
  code: string;
  title: string;
  summary: string;
  metric: string;
  observed: string;
  baseline: string;
  windowStart: string;
  windowEnd: string;
  sampleSize: number;
  evidence: Prisma.InputJsonValue;
  sourceMetricIds: string[];
  dataLandedAt: Date;
};

/** Refresh the open alert for this ad and code. A second sync does not insert another open row. */
export async function upsertOpenAlert(alert: AlertWrite, now: Date) {
  const dedupeKey = alertDedupeKey(alert.adId, alert.code);
  const existing = dedupeKey
    ? await prisma.adAlert.findFirst({
        where: { adId: alert.adId, code: alert.code, archivedAt: null },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true },
      })
    : null;
  const data = {
    adAccountId: alert.adAccountId,
    campaignId: alert.campaignId,
    clientId: alert.clientId,
    code: alert.code,
    dedupeKey,
    severity: alert.severity,
    title: alert.title,
    summary: alert.summary,
    metric: alert.metric,
    observed: alert.observed,
    baseline: alert.baseline,
    windowStart: day(alert.windowStart),
    windowEnd: day(alert.windowEnd),
    sampleSize: alert.sampleSize,
    evidence: alert.evidence,
    sourceMetricIds: alert.sourceMetricIds,
    dataLandedAt: alert.dataLandedAt,
    detectedAt: now,
    lastSeenAt: now,
  };
  if (existing) return prisma.adAlert.update({ where: { id: existing.id }, data });
  return prisma.adAlert.create({
    data: { ...data, adId: alert.adId, workspaceId: WORKSPACE_ID },
  });
}

export function budgetPeriod(value: string | null | undefined): BudgetType | null {
  if (value === "daily" || value === "lifetime" || value === "none") return value;
  return null;
}

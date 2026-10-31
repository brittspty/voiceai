import type { ChannelDailyKind, Prisma } from "@prisma/client";
import { prisma } from "../../db";
import { isolatedWhere } from "../workspace";
import { assertChannelDailyKind, type ChannelDailySource } from "./adapters";

/** Meta and Google rows are read from DailyMetric. This table never stores them. */
export async function listChannelDaily(workspaceId: string, clientKey?: string) {
  return prisma.channelDailyMetric.findMany({
    where: isolatedWhere(workspaceId, clientKey ? { clientKey } : {}),
    orderBy: { date: "asc" },
  });
}

export async function listDailyMetrics(workspaceId: string) {
  return prisma.dailyMetric.findMany({
    where: isolatedWhere(workspaceId, { platform: { in: ["meta", "google_ads"] } }) as Prisma.DailyMetricWhereInput,
    orderBy: { date: "asc" },
  });
}

export async function listSearchTerms(workspaceId: string) {
  return prisma.searchTermMetric.findMany({
    where: isolatedWhere(workspaceId),
    orderBy: { date: "desc" },
    take: 100,
  });
}

export function prepareChannelDailyWrite(workspaceId: string, row: ChannelDailySource & { clientKey?: string }): Prisma.ChannelDailyMetricCreateInput {
  const channel: ChannelDailyKind = assertChannelDailyKind(row.channel);
  return {
    ...isolatedWhere(workspaceId),
    clientKey: row.clientKey ?? "",
    date: new Date(`${String(row.date).slice(0, 10)}T00:00:00.000Z`),
    channel,
    entityKey: row.entityKey ?? "",
    entityName: row.entityName ?? "",
    currency: row.currency ?? "USD",
    impressions: row.impressions == null ? null : BigInt(Math.round(Number(row.impressions))),
    clicks: row.clicks == null ? null : BigInt(Math.round(Number(row.clicks))),
    reach: row.reach == null ? null : BigInt(Math.round(Number(row.reach))),
    spend: row.spend == null ? null : Number(row.spend),
    leads: row.leads == null ? null : row.leads,
    qualifiedLeads: row.qualifiedLeads == null ? null : row.qualifiedLeads,
    booked: row.booked == null ? null : row.booked,
    conversions: row.conversions == null ? null : row.conversions,
    conversionValue: row.conversionValue == null ? null : row.conversionValue,
    profileViews: row.profileViews ?? null,
    searches: row.searches ?? null,
    calls: row.calls ?? null,
    directionRequests: row.directionRequests ?? null,
    websiteClicks: row.websiteClicks ?? null,
    reviewCount: row.reviewCount ?? null,
    rating: row.rating == null ? null : Number(row.rating),
    failedChecks: row.failedChecks ?? null,
    uptimeRate: row.uptimeRate == null ? null : row.uptimeRate,
    medianSpeedSec: row.medianSpeedSec ?? null,
    voiceCalls: row.voiceCalls ?? null,
  };
}

export async function listWaitingFatigueDecisions(workspaceId: string, since: Date) {
  return prisma.inboxDecision.findMany({
    where: isolatedWhere(workspaceId, {
      kind: { in: ["fatigue_pause", "fatigue_rotation"] },
      status: "waiting",
      createdAt: { gte: since },
    }) as Prisma.InboxDecisionWhereInput,
    orderBy: { createdAt: "desc" },
  });
}

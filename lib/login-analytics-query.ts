import { prisma } from "./db";
import { pickAttributionWindow } from "./marketing/dashboard-model";
import { workspaceReads } from "./marketing/isolation";
import { isolatedWhere } from "./marketing/workspace";
import { addDaysISO, zonedISODate, zonedTimeToUtc } from "./time";
import {
  ANALYTICS_ZONE,
  monthStartISO,
  PUBLIC_SPARKLINE_DAYS,
  publicAsOf,
  type DayCount,
  type LoginContribution,
} from "./login-analytics";

function dec(value: { toString(): string } | number | null | undefined) {
  if (value == null) return 0;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function pushDay(map: Map<string, number>, date: string, count: number) {
  if (count <= 0) return;
  map.set(date, (map.get(date) ?? 0) + count);
}

function days(map: Map<string, number>): DayCount[] {
  return [...map.entries()].map(([date, count]) => ({ date, count }));
}

async function mapWorkspaces<T>(ids: string[], read: (workspaceId: string) => Promise<T>) {
  return Promise.all(workspaceReads(ids).map((where) => read(where.workspaceId)));
}

/**
 * Platform totals for the public sign-in panel.
 * Each read is one workspace. Identifiers stay in this function and are dropped before the response.
 */
export async function loadLoginContributions(now = new Date()): Promise<LoginContribution[]> {
  const asOf = publicAsOf(now);
  const end = zonedISODate(asOf, ANALYTICS_ZONE);
  const monthStart = monthStartISO(end);
  const seriesStart = addDaysISO(end, -(PUBLIC_SPARKLINE_DAYS - 1));
  const from = monthStart < seriesStart ? monthStart : seriesStart;
  const rangeStart = zonedTimeToUtc(`${from}T00:00:00`, ANALYTICS_ZONE);
  const workspaces = await prisma.workspace.findMany({ select: { id: true } });
  const ids = workspaces.map((row) => row.id.trim()).filter(Boolean);
  if (!ids.length) return [];

  const metricRows = (
    await mapWorkspaces(ids, (workspaceId) =>
      prisma.dailyMetric.findMany({
        where: {
          ...isolatedWhere(workspaceId),
          date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${end}T00:00:00.000Z`) },
          ingestedAt: { lte: asOf },
        },
        select: { workspaceId: true, date: true, platformLeads: true, attributionWindow: true },
      }),
    )
  ).flat();

  const leads = new Map<string, Map<string, number>>();
  const byWorkspace = new Map<string, typeof metricRows>();
  for (const row of metricRows) {
    const list = byWorkspace.get(row.workspaceId) ?? [];
    list.push(row);
    byWorkspace.set(row.workspaceId, list);
  }
  for (const [workspaceId, rows] of byWorkspace) {
    const window = pickAttributionWindow(rows);
    const kept = window ? rows.filter((row) => row.attributionWindow === window) : rows;
    const map = new Map<string, number>();
    for (const row of kept) pushDay(map, dayKey(row.date), dec(row.platformLeads));
    leads.set(workspaceId, map);
  }

  const perClient = await mapWorkspaces(ids, async (workspaceId) => {
    const [campaigns, conversionClients, responses] = await Promise.all([
      prisma.campaign.count({
        where: { ...isolatedWhere(workspaceId), status: "active", createdAt: { lte: asOf } },
      }),
      prisma.conversionClient.findMany({ where: isolatedWhere(workspaceId), select: { id: true } }),
      prisma.leadResponse.findMany({
        where: { ...isolatedWhere(workspaceId), callId: { not: null }, slaStartAt: { lte: asOf, gte: rangeStart } },
        select: { callId: true },
      }),
    ]);
    const clientIds = conversionClients.map((row) => row.id);
    const callIds = responses.map((row) => row.callId).filter((id): id is string => Boolean(id));
    const [events, calls] = await Promise.all([
      clientIds.length
        ? prisma.conversionEvent.findMany({
            where: { clientId: { in: clientIds }, kind: "qualified", occurredAt: { lte: asOf, gte: rangeStart } },
            select: { occurredAt: true },
          })
        : Promise.resolve([]),
      callIds.length
        ? prisma.call.findMany({
            where: { id: { in: callIds }, connected: true },
            select: { startedAt: true, triggeredAt: true },
          })
        : Promise.resolve([]),
    ]);
    const verified = new Map<string, number>();
    for (const event of events) pushDay(verified, zonedISODate(event.occurredAt, ANALYTICS_ZONE), 1);
    const answered = new Map<string, number>();
    for (const call of calls) {
      const when = call.startedAt ?? call.triggeredAt;
      if (!when || when.getTime() > asOf.getTime()) continue;
      pushDay(answered, zonedISODate(when, ANALYTICS_ZONE), 1);
    }
    return { workspaceId, campaigns, verified, answered };
  });

  return ids.map((workspaceId) => {
    const extra = perClient.find((row) => row.workspaceId === workspaceId);
    return {
      workspaceId,
      leads: days(leads.get(workspaceId) ?? new Map()),
      verifiedHuman: days(extra?.verified ?? new Map()),
      callsAnswered: days(extra?.answered ?? new Map()),
      activeCampaigns: extra?.campaigns ?? 0,
    };
  });
}

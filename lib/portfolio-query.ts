import { prisma } from "./db";
import type { MarketingAccess } from "./marketing/access";
import { pickAttributionWindow } from "./marketing/dashboard-model";
import { workspaceReads } from "./marketing/isolation";
import { isolatedWhere } from "./marketing/workspace";
import { zonedISODate, zonedTimeToUtc } from "./time";
import { ANALYTICS_ZONE, monthStartISO } from "./login-analytics";
import {
  actionMix,
  assemblePortfolio,
  emptyOutcomes,
  pixelsMissing,
  portfolioAllowed,
  portfolioWorkspaceIds,
  tallyOutcome,
  type PortfolioFacts,
  type PortfolioModel,
} from "./portfolio";

function dec(value: { toString(): string } | number | null | undefined) {
  if (value == null) return 0;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

async function mapWorkspaces<T>(ids: string[], read: (workspaceId: string) => Promise<T>) {
  return Promise.all(workspaceReads(ids).map((where) => read(where.workspaceId)));
}

function monthBounds(now: Date) {
  const end = zonedISODate(now, ANALYTICS_ZONE);
  const start = monthStartISO(end);
  return {
    end,
    start,
    from: zonedTimeToUtc(`${start}T00:00:00`, ANALYTICS_ZONE),
    weekFrom: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
  };
}

export async function loadPortfolioModel(access: MarketingAccess, now = new Date()): Promise<PortfolioModel | null> {
  if (!portfolioAllowed(access.kind)) return null;
  const assigned = await prisma.marketingAssignment.findMany({
    where: { userId: access.userId },
    select: { workspaceId: true },
  });
  const assignedIds = [...new Set(assigned.map((row) => row.workspaceId.trim()).filter(Boolean))];
  const restrict = access.kind === "account_manager" && assignedIds.length > 0;
  const known = restrict
    ? (
        await mapWorkspaces(assignedIds, (workspaceId) =>
          prisma.workspace.findMany({ where: { id: workspaceId }, select: { id: true, name: true } }),
        )
      ).flat()
    : await prisma.workspace.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  const ids = portfolioWorkspaceIds({
    kind: access.kind,
    knownIds: known.map((row) => row.id),
    assignedIds,
  });
  if (!ids.length) {
    return assemblePortfolio({ facts: [], allowedIds: [], showMoney: access.seesCost, now });
  }
  const names = new Map(known.map((row) => [row.id, row.name]));
  const facts = await loadPortfolioFacts(ids, names, access.seesCost, now);
  return assemblePortfolio({ facts, allowedIds: ids, showMoney: access.seesCost, now });
}

async function loadPortfolioFacts(
  ids: string[],
  names: Map<string, string>,
  showMoney: boolean,
  now: Date,
): Promise<PortfolioFacts[]> {
  const bounds = monthBounds(now);
  const rows = await mapWorkspaces(ids, (workspaceId) => readWorkspace(workspaceId, names.get(workspaceId) || "Client", showMoney, bounds, now));
  return rows;
}

async function readWorkspace(
  workspaceId: string,
  name: string,
  showMoney: boolean,
  bounds: ReturnType<typeof monthBounds>,
  now: Date,
): Promise<PortfolioFacts> {
  const where = isolatedWhere(workspaceId);
  const [metrics, connections, scores, responses, recommendations, verdicts, leadAlerts, pageAlerts, adAlerts, pages, conversionClients] =
    await Promise.all([
      prisma.dailyMetric.findMany({
        where: {
          ...where,
          date: { gte: new Date(`${bounds.start}T00:00:00.000Z`), lte: new Date(`${bounds.end}T00:00:00.000Z`) },
        },
        select: {
          date: true,
          platformLeads: true,
          attributionWindow: true,
          ...(showMoney ? { spend: true } : {}),
        },
      }),
      prisma.platformConnection.findMany({
        where: { ...where, status: "connected" },
        select: { platform: true },
      }),
      prisma.leadScore.findMany({
        where: { ...where, createdAt: { gte: bounds.from, lte: now } },
        select: { score: true },
      }),
      prisma.leadResponse.findMany({
        where: { ...where, slaStartAt: { gte: bounds.from, lte: now } },
        select: { seconds: true, callId: true },
      }),
      prisma.recommendation.findMany({
        where,
        select: { type: true, status: true },
      }),
      prisma.liftResult.findMany({
        where,
        select: { verdict: true },
      }),
      prisma.leadAlert.count({ where: { ...where, state: "open" } }),
      prisma.pageMonitorAlert.count({ where: { ...where, resolvedAt: null } }),
      prisma.adAlert.count({ where: { ...where, detectedAt: { gte: bounds.weekFrom } } }),
      prisma.landingPage.findMany({ where, select: { id: true } }),
      prisma.conversionClient.findMany({ where, select: { id: true } }),
    ]);

  const window = pickAttributionWindow(metrics);
  const kept = window ? metrics.filter((row) => row.attributionWindow === window) : metrics;
  let leads = 0;
  let spend = 0;
  for (const row of kept) {
    leads += dec(row.platformLeads);
    if (showMoney && "spend" in row) spend += dec(row.spend);
  }

  const clientIds = conversionClients.map((row) => row.id);
  const callIds = responses.map((row) => row.callId).filter((id): id is string => Boolean(id));
  const pageIds = pages.map((row) => row.id);
  const [events, calls, check] = await Promise.all([
    clientIds.length
      ? prisma.conversionEvent.findMany({
          where: { clientId: { in: clientIds }, occurredAt: { gte: bounds.from, lte: now } },
          select: { kind: true, occurredAt: true, fbclid: true, fbc: true, fbp: true, gclid: true, gbraid: true, wbraid: true },
        })
      : Promise.resolve([]),
    callIds.length
      ? prisma.call.findMany({
          where: { id: { in: callIds } },
          select: { outcome: true, connected: true },
        })
      : Promise.resolve([]),
    pageIds.length
      ? prisma.pageCheck.findFirst({
          where: { landingPageId: { in: pageIds } },
          orderBy: { checkedAt: "desc" },
          select: { checkedAt: true, pixels: true },
        })
      : Promise.resolve(null),
  ]);

  const outcomes = emptyOutcomes();
  for (const call of calls) tallyOutcome(outcomes, call.outcome, call.connected);
  const weekEvents = events.filter((event) => event.occurredAt.getTime() >= bounds.weekFrom.getTime());
  const matched = weekEvents.filter((event) => event.fbclid || event.fbc || event.fbp || event.gclid || event.gbraid || event.wbraid).length;
  const mix = actionMix(recommendations, verdicts.map((row) => row.verdict));
  const conversions = events.filter((event) => event.kind === "qualified" || event.kind === "booked" || event.kind === "sold").length;

  return {
    id: workspaceId,
    name,
    channels: new Set(connections.map((row) => row.platform)).size,
    leads,
    conversions,
    qualityScores: scores.map((row) => row.score),
    crmOutcome: events.some((event) => event.kind === "booked" || event.kind === "sold"),
    scale: mix.scale,
    learning: mix.learning,
    cut: mix.cut,
    alerts: leadAlerts + pageAlerts + adAlerts,
    pixelCheckedAt: check?.checkedAt.toISOString() ?? null,
    pixelsMissing: pixelsMissing(check?.pixels),
    matchMatched: matched,
    matchTotal: weekEvents.length,
    speedSeconds: responses.map((row) => row.seconds).filter((value): value is number => value != null),
    callOutcomes: outcomes,
    ...(showMoney ? { spend } : {}),
  };
}

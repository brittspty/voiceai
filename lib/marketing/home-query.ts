import { prisma } from "../db";
import { addDaysISO, zonedISODate, zonedTimeToUtc } from "../time";
import type { MarketingAccess } from "./access";
import {
  competitorWatchEnabled,
  creativeFatigueEnabled,
  googleAdsEnabled,
  holdoutsEnabled,
  leadScoringEnabled,
  pageMonitorEnabled,
  pacingRecsEnabled,
  searchWasteEnabled,
  speedToLeadEnabled,
  type Env,
} from "./config";
import { resultCounts } from "./dashboard-model";
import { effectiveLabel } from "./lead-score/summary";
import { assembleHome, homeFeatures, type HomeFeature, type HomeMetric, type HomeModel, type HomeWorkspace } from "./home-dashboard";
import { homeScope, scopeWorkspaceIds, workspaceReads } from "./isolation";
import { median } from "./speed-to-lead";
import { isolatedWhere, requireWorkspaceId } from "./workspace";

function num(value: bigint | number | null | undefined) {
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dec(value: { toString(): string } | number | null | undefined) {
  if (value == null) return 0;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

async function eachWorkspace<T>(ids: string[], read: (workspaceId: string) => Promise<T[]>): Promise<T[]> {
  const batches = await Promise.all(workspaceReads(ids).map((where) => read(where.workspaceId)));
  return batches.flat();
}

async function countEach(ids: string[], read: (workspaceId: string) => Promise<number>) {
  const counts = await Promise.all(workspaceReads(ids).map((where) => read(where.workspaceId)));
  return counts.reduce((sum, value) => sum + value, 0);
}

/**
 * Staff who roll up clients may list every workspace.
 * Every other role is limited to their own id before any other table is read.
 */
export async function listHomeWorkspaces(access: MarketingAccess): Promise<HomeWorkspace[]> {
  if (access.kind === "super_admin" || access.kind === "account_manager") {
    const rows = await prisma.workspace.findMany({ orderBy: { name: "asc" } });
    if (rows.length) return rows;
    const org = await prisma.org.findUnique({ where: { id: "org" }, select: { name: true } });
    return [{ id: "org", name: org?.name || "This client", voiceEnabled: true }];
  }
  const id = requireWorkspaceId(access.workspaceId);
  return prisma.workspace.findMany({ where: { id }, orderBy: { name: "asc" } });
}

export async function loadFeatureCards(input: {
  workspaceIds: string[];
  showMoney: boolean;
  hasGoogleRows?: boolean;
  env?: Env;
}): Promise<HomeFeature[]> {
  const env = input.env ?? process.env;
  const ids = input.workspaceIds.map((id) => id.trim()).filter(Boolean);
  const speedOn = speedToLeadEnabled(env);
  const qualityOn = leadScoringEnabled(env);
  const landingOn = pageMonitorEnabled(env);
  const fatigueOn = creativeFatigueEnabled(env);
  const pacingOn = pacingRecsEnabled(env);
  const searchOn = searchWasteEnabled(env);
  const competitorsOn = competitorWatchEnabled(env);
  const holdoutsOn = holdoutsEnabled(env);

  const [speedRows, scoreRows, pages, openPages, tired, paceRows, proposed, competitors, holdouts] = await Promise.all([
    speedOn && ids.length
      ? eachWorkspace(ids, (workspaceId) => prisma.leadResponse.findMany({ where: isolatedWhere(workspaceId), select: { seconds: true } }))
      : Promise.resolve(null),
    qualityOn && ids.length
      ? eachWorkspace(ids, (workspaceId) => prisma.leadScore.findMany({ where: isolatedWhere(workspaceId), select: { label: true, overrideLabel: true } }))
      : Promise.resolve(null),
    landingOn && ids.length ? countEach(ids, (workspaceId) => prisma.landingPage.count({ where: isolatedWhere(workspaceId) })) : Promise.resolve(null),
    landingOn && ids.length
      ? countEach(ids, (workspaceId) => prisma.pageMonitorAlert.count({ where: { ...isolatedWhere(workspaceId), resolvedAt: null } }))
      : Promise.resolve(null),
    fatigueOn && ids.length
      ? countEach(ids, (workspaceId) => prisma.fatigueSignal.count({ where: { ...isolatedWhere(workspaceId), fatigued: true } }))
      : Promise.resolve(null),
    pacingOn && input.showMoney && ids.length
      ? eachWorkspace(ids, (workspaceId) =>
          prisma.pacingSnapshot.findMany({
            where: isolatedWhere(workspaceId),
            orderBy: { detectedAt: "desc" },
            take: 200,
            select: { campaignId: true, status: true },
          }),
        )
      : Promise.resolve(null),
    searchOn && ids.length
      ? countEach(ids, (workspaceId) => prisma.negativeProposal.count({ where: { ...isolatedWhere(workspaceId), status: "proposed" } }))
      : Promise.resolve(null),
    competitorsOn && ids.length ? countEach(ids, (workspaceId) => prisma.competitor.count({ where: isolatedWhere(workspaceId) })) : Promise.resolve(null),
    holdoutsOn && ids.length ? countEach(ids, (workspaceId) => prisma.liftTest.count({ where: isolatedWhere(workspaceId) })) : Promise.resolve(null),
  ]);

  const speedMedian = speedRows ? median(speedRows.map((row) => row.seconds).filter((value): value is number => value != null)) : null;
  const qualified = scoreRows?.filter((row) => effectiveLabel(row) === "qualified").length ?? 0;
  const seen = new Set<string>();
  let ahead = 0;
  for (const row of paceRows ?? []) {
    if (seen.has(row.campaignId)) continue;
    seen.add(row.campaignId);
    if (row.status === "over" || row.status === "critical") ahead += 1;
  }

  return homeFeatures({
    googleOn: googleAdsEnabled(env),
    hasGoogleRows: Boolean(input.hasGoogleRows),
    speedOn,
    speedDetail: speedRows ? (speedMedian == null ? null : `${speedMedian}s median first response`) : null,
    qualityOn,
    qualityDetail: scoreRows ? `${qualified} of ${scoreRows.length} leads look qualified` : null,
    landingOn,
    landingDetail: pages == null ? null : openPages ? `${openPages} open page alert${openPages === 1 ? "" : "s"} across ${pages} page${pages === 1 ? "" : "s"}.` : `${pages} page${pages === 1 ? "" : "s"} checked. No open alerts.`,
    fatigueOn,
    fatigueDetail: tired == null ? null : tired ? `${tired} ad${tired === 1 ? "" : "s"} look tired.` : null,
    showMoney: input.showMoney,
    pacingOn,
    pacingDetail: paceRows == null ? null : seen.size === 0 ? null : ahead ? `${ahead} campaign${ahead === 1 ? "" : "s"} ${ahead === 1 ? "is" : "are"} ahead of pace.` : "Spend is inside the plan.",
    searchOn,
    searchDetail: proposed == null ? null : proposed ? `${proposed} search term${proposed === 1 ? "" : "s"} waiting for review.` : null,
    competitorsOn,
    competitorsDetail: competitors == null ? null : competitors ? `${competitors} competitor${competitors === 1 ? "" : "s"} watched.` : null,
    holdoutsOn,
    holdoutsDetail: holdouts == null ? null : holdouts ? `${holdouts} holdout test${holdouts === 1 ? "" : "s"}.` : null,
  });
}

export async function loadHome(input: { access: MarketingAccess; requestedId?: string | null; now?: Date; env?: Env }): Promise<HomeModel> {
  const env = input.env ?? process.env;
  const seesCost = input.access.kind === "super_admin" || input.access.kind === "account_manager";
  const canPickClient = seesCost;
  const known = await listHomeWorkspaces(input.access);
  const scope = homeScope({
    roleKind: input.access.kind,
    workspaceId: input.access.workspaceId,
    requestedId: input.requestedId ?? null,
    knownIds: known.map((row) => row.id),
  });
  const ids = scopeWorkspaceIds(scope);
  if (!ids.length) {
    return assembleHome({
      scope,
      showMoney: false,
      canPickClient: false,
      workspaces: [],
      metrics: [],
      features: [],
      voice: null,
    });
  }
  const now = input.now ?? new Date();
  const end = zonedISODate(now, "America/New_York");
  const start = addDaysISO(end, -29);
  const platforms = googleAdsEnabled(env) ? (["meta", "google_ads"] as const) : (["meta"] as const);
  const workspaces = known.filter((row) => ids.includes(row.id));
  const metricRows = await eachWorkspace(ids, (workspaceId) =>
    prisma.dailyMetric.findMany({
      where: {
        ...isolatedWhere(workspaceId),
        date: { gte: new Date(`${start}T00:00:00.000Z`), lte: new Date(`${end}T00:00:00.000Z`) },
        platform: { in: [...platforms] },
      },
      select: {
        workspaceId: true,
        platform: true,
        impressions: true,
        clicks: true,
        platformLeads: true,
        platformConversions: true,
        campaign: { select: { objective: true } },
        ...(seesCost ? { spend: true } : {}),
      },
    }),
  );
  const metrics: HomeMetric[] = metricRows
    .filter((row) => row.platform === "meta" || row.platform === "google_ads")
    .map((row) => {
      const counts = resultCounts(row.campaign?.objective || "leads", dec(row.platformLeads), dec(row.platformConversions));
      const metric: HomeMetric = {
        workspaceId: row.workspaceId,
        platform: row.platform === "google_ads" ? "google_ads" : "meta",
        impressions: num(row.impressions),
        clicks: num(row.clicks),
        leads: counts.leads,
        calls: counts.calls,
      };
      if (seesCost && "spend" in row) metric.spend = dec(row.spend);
      return metric;
    });

  const features = await loadFeatureCards({
    workspaceIds: ids,
    showMoney: seesCost,
    hasGoogleRows: metrics.some((row) => row.platform === "google_ads"),
    env,
  });

  const voiceIds = workspaces.filter((row) => row.voiceEnabled).map((row) => row.id);
  let voice: { dials: number; answered: number; meetings: number } | null = null;
  if (voiceIds.length) {
    const voiceStart = zonedTimeToUtc(`${addDaysISO(end, -6)}T00:00:00`, "America/New_York");
    const calls = await prisma.call.findMany({
      where: { triggeredAt: { gte: voiceStart } },
      select: { dialedAt: true, connected: true, booked: true },
    });
    voice = {
      dials: calls.filter((call) => call.dialedAt).length,
      answered: calls.filter((call) => call.connected).length,
      meetings: calls.filter((call) => call.booked).length,
    };
  }

  return assembleHome({
    scope,
    showMoney: seesCost,
    canPickClient,
    workspaces,
    metrics,
    features,
    voice,
  });
}

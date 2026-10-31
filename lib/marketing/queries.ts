import { prisma } from "../db";
import { accessFromUser, type MarketingAccess } from "./access";
import { buildClientShare, CLIENT_TESTING_NOTE, presentWithoutCost } from "./client-view";
import { creativeFatigueEnabled, leadScoringEnabled } from "./config";
import { alertSelect, alertWhere, campaignSelect, dailyMetricSelect, isCostContent, metricSum, recommendationSelect, recommendationWhere, redactMarketingPage, searchTermSelect } from "./cost-visibility";
import { inboxMeta } from "./decision-ui";
import { leadsSince, spendSince } from "./lead-score/store";
import { buildLeadQualityTiles, effectiveLabel, splitByWindow } from "./lead-score/summary";
import { clientMetricWhere, queuedTestingWhere } from "./scope";
import { clientViewEvent, type ClientViewEvent } from "./share-link";

function num(value: bigint | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dec(value: { toString(): string } | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function loadMarketingAccess(user: { id: string; email: string; role: string }): Promise<MarketingAccess> {
  const [assignments, clientAccess] = await Promise.all([
    prisma.marketingAssignment.findMany({ where: { userId: user.id } }),
    prisma.clientViewerAccess.findUnique({ where: { userId: user.id } }),
  ]);
  const scopes = assignments.map((row) => ({
    workspaceId: row.workspaceId,
    scopeKind: row.scopeKind,
    adAccountId: row.adAccountId,
    campaignId: row.campaignId,
  }));
  if (user.role === "client_viewer") {
    scopes.push({ workspaceId: clientAccess?.workspaceId || "", scopeKind: "client", adAccountId: null, campaignId: null });
  }
  return accessFromUser(user, scopes.filter((row) => row.workspaceId));
}

type LoadedCampaign = {
  id: string;
  name: string;
  objective: string;
  status: string;
  budgetType?: string | null;
  budgetAmount?: { toString(): string } | null;
  budgetCurrency?: string | null;
  budgetSetAt?: Date | null;
  reportedBudgetType?: string | null;
  reportedBudgetAmount?: { toString(): string } | null;
  adAccount: { id: string; name: string; currency?: string } | null;
  _count: { adGroups: number } | null;
};

type LoadedMetric = {
  id: string;
  date: Date;
  impressions: bigint | number | null;
  clicks: bigint | number | null;
  reach: bigint | number | null;
  platformLeads: { toString(): string } | number | null;
  currency?: string | null;
  spend?: { toString(): string } | number | null;
  ad: { name: string } | null;
  campaign: { id: string; name: string; adAccountId: string | null; adAccount: { name: string } | null } | null;
};

type LoadedAlert = {
  id: string;
  adAccountId: string;
  campaignId: string;
  severity: string;
  code: string;
  title: string;
  summary: string;
  metric: string;
  detectedAt: Date;
  ad: { name: string } | null;
  adAccount: { name: string } | null;
};

type LoadedRecommendation = {
  id: string;
  type: string;
  status: string;
  title: string;
  summary: string;
  rationale: string;
  metric: string;
  baseline: string;
  observed: string;
  windowStart: Date | null;
  windowEnd: Date | null;
  sampleSize: number;
  sourceMetricIds: string[];
  createdAt: Date;
  decidedAt: Date | null;
  decisionNote: string | null;
  verifierNote: string | null;
  campaignId: string | null;
  adAccountId: string | null;
  currentBudgetAmount?: { toString(): string } | null;
  proposedBudgetAmount?: { toString(): string } | null;
  proposedCurrency?: string | null;
  proposedBudgetPeriod?: string | null;
  campaign?: { budgetSetBy: { name: string } | null } | null;
};

type LoadedDigest = { id: string; createdAt: Date; delivery: string; payload: unknown };

type LoadedSearchTerm = {
  id: string;
  date: Date;
  term: string;
  matchType: string;
  status: string;
  impressions: bigint | number | null;
  clicks: bigint | number | null;
  conversions: { toString(): string } | number | null;
  platform: string;
  currency?: string | null;
  spend?: { toString(): string } | number | null;
  campaign: { id: string; name: string; adAccountId: string | null; adAccount: { name: string } | null } | null;
};

function inScope(access: MarketingAccess | undefined, input: { adAccountId?: string | null; campaignId?: string | null }) {
  if (!access || access.accounts === "all") return true;
  if (input.campaignId && access.campaigns !== "all" && access.campaigns.includes(input.campaignId)) return true;
  if (input.adAccountId && access.accounts.includes(input.adAccountId)) return true;
  return false;
}

export async function getMarketingPage(access?: MarketingAccess) {
  const seesCost = Boolean(access?.seesCost);
  const [accounts, campaigns, metrics, searchTerms, lastRun, totalsRaw] = await Promise.all([
    prisma.adAccount.findMany({ orderBy: { name: "asc" } }),
    prisma.campaign.findMany({ orderBy: { name: "asc" }, select: campaignSelect(seesCost) }) as Promise<LoadedCampaign[]>,
    prisma.dailyMetric.findMany({
      orderBy: [{ date: "desc" }, { adId: "asc" }],
      take: 100,
      select: dailyMetricSelect(seesCost),
    }) as Promise<LoadedMetric[]>,
    prisma.searchTermMetric.findMany({
      orderBy: [{ date: "desc" }, { term: "asc" }],
      take: 100,
      select: searchTermSelect(seesCost),
    }) as Promise<LoadedSearchTerm[]>,
    prisma.marketingSyncRun.findFirst({ orderBy: { startedAt: "desc" } }),
    seesCost
      ? prisma.dailyMetric.groupBy({ by: ["currency"], _sum: metricSum(seesCost) })
      : prisma.dailyMetric.aggregate({ _sum: metricSum(seesCost) }),
  ]);

  const [alerts, recommendations, digests] = access?.seesAlerts
    ? await Promise.all([
        prisma.adAlert.findMany({
          where: alertWhere(seesCost),
          orderBy: { detectedAt: "desc" },
          take: 50,
          select: alertSelect(),
        }) as Promise<LoadedAlert[]>,
        prisma.recommendation.findMany({
          where: recommendationWhere(seesCost),
          orderBy: { createdAt: "desc" },
          take: 50,
          select: recommendationSelect(seesCost),
        }) as Promise<LoadedRecommendation[]>,
        prisma.managerDigest.findMany({ where: { userId: access.userId }, orderBy: { createdAt: "desc" }, take: 12 }) as Promise<LoadedDigest[]>,
      ])
    : [[], [], []];

  const visibleAccounts = accounts.filter((account) => inScope(access, { adAccountId: account.id }));
  const visibleCampaigns = campaigns.filter((campaign) => campaign.adAccount && inScope(access, { adAccountId: campaign.adAccount.id, campaignId: campaign.id }));
  const visibleMetrics = metrics.filter((metric) => inScope(access, { adAccountId: metric.campaign?.adAccountId, campaignId: metric.campaign?.id }));
  const visibleSearchTerms = searchTerms.filter((row) => inScope(access, { adAccountId: row.campaign?.adAccountId, campaignId: row.campaign?.id }));

  const page = {
    mock: lastRun?.mode === "mock",
    accounts: visibleAccounts.map((account) => ({
      id: account.id,
      name: account.name,
      platform: account.platform,
      externalId: account.externalId,
      currency: account.currency,
      timezone: account.timezone,
      status: account.status,
      syncEnabled: account.syncEnabled,
    })),
    campaigns: visibleCampaigns.map((campaign) => {
      const account = campaign.adAccount;
      const row = {
        id: campaign.id,
        name: campaign.name,
        accountId: account?.id ?? "",
        account: account?.name ?? "—",
        objective: campaign.objective,
        status: campaign.status,
        adGroups: campaign._count?.adGroups ?? 0,
      };
      if (!seesCost || !account || !("budgetAmount" in campaign)) return row;
      return {
        ...row,
        budgetType: campaign.budgetType,
        budgetAmount: campaign.budgetAmount ? dec(campaign.budgetAmount) : null,
        budgetCurrency: campaign.budgetCurrency,
        budgetSetAt: campaign.budgetSetAt?.toISOString() ?? null,
        reportedBudgetType: campaign.reportedBudgetType,
        reportedBudgetAmount: campaign.reportedBudgetAmount ? dec(campaign.reportedBudgetAmount) : null,
        currency: "currency" in account ? account.currency : "",
      };
    }),
    rows: visibleMetrics.map((metric) => {
      const row = {
        id: metric.id,
        date: metric.date.toISOString().slice(0, 10),
        account: metric.campaign?.adAccount?.name ?? "—",
        campaign: metric.campaign?.name ?? "—",
        ad: metric.ad?.name ?? "—",
        impressions: num(metric.impressions),
        clicks: num(metric.clicks),
        reach: num(metric.reach),
        leads: dec(metric.platformLeads),
      };
      if (!seesCost || !("spend" in metric)) return row;
      return { ...row, currency: metric.currency, spend: dec(metric.spend) };
    }),
    searchTerms: visibleSearchTerms.map((row) => {
      const mapped = {
        id: row.id,
        date: row.date.toISOString().slice(0, 10),
        account: row.campaign?.adAccount?.name ?? "—",
        campaign: row.campaign?.name ?? "—",
        term: row.term,
        matchType: row.matchType,
        status: row.status,
        platform: row.platform,
        impressions: num(row.impressions),
        clicks: num(row.clicks),
        conversions: dec(row.conversions),
      };
      if (!seesCost || !("spend" in row)) return mapped;
      return { ...mapped, currency: row.currency, spend: dec(row.spend) };
    }),
    lastRun: lastRun
      ? {
          status: lastRun.status,
          mode: lastRun.mode,
          startedAt: lastRun.startedAt.toISOString(),
          finishedAt: lastRun.finishedAt?.toISOString() ?? null,
          rowsWritten: lastRun.rowsWritten,
          error: lastRun.error,
          note: lastRun.note,
          accounts: lastRun.requestedAccounts,
          since: lastRun.windowStart ? lastRun.windowStart.toISOString().slice(0, 10) : null,
          until: lastRun.windowEnd ? lastRun.windowEnd.toISOString().slice(0, 10) : null,
        }
      : null,
    totals: Array.isArray(totalsRaw)
      ? totalsRaw.map((group) => ({
          currency: group.currency,
          spend: dec(group._sum.spend),
          impressions: num(group._sum.impressions),
          clicks: num(group._sum.clicks),
          leads: dec(group._sum.platformLeads),
        }))
      : [
          {
            impressions: num(totalsRaw._sum.impressions),
            clicks: num(totalsRaw._sum.clicks),
            leads: dec(totalsRaw._sum.platformLeads),
          },
        ],
    alerts: alerts
      .filter((alert) => inScope(access, { adAccountId: alert.adAccountId, campaignId: alert.campaignId }) && (seesCost || !isCostContent(alert)))
      .map((alert) => ({
        id: alert.id,
        severity: alert.severity,
        title: alert.title,
        summary: alert.summary,
        ad: alert.ad?.name ?? "—",
        account: alert.adAccount?.name ?? "—",
        detectedAt: alert.detectedAt.toISOString(),
      })),
    recommendations: recommendations
      .filter((rec) => inScope(access, { adAccountId: rec.adAccountId, campaignId: rec.campaignId }) && (seesCost || !isCostContent(rec)))
      .map((rec) => {
        const meta = inboxMeta("evidence" in rec ? rec.evidence : null);
        const row = {
          id: rec.id,
          type: rec.type,
          status: rec.status,
          title: rec.title,
          summary: rec.summary,
          rationale: rec.rationale,
          metric: rec.metric,
          baseline: rec.baseline,
          observed: rec.observed,
          windowStart: rec.windowStart ? rec.windowStart.toISOString().slice(0, 10) : "",
          windowEnd: rec.windowEnd ? rec.windowEnd.toISOString().slice(0, 10) : "",
          sampleSize: rec.sampleSize,
          sourceCount: rec.sourceMetricIds.length,
          createdAt: rec.createdAt.toISOString(),
          decidedAt: rec.decidedAt?.toISOString() ?? null,
          decisionNote: rec.decisionNote,
          verifierNote: rec.verifierNote,
          campaignId: rec.campaignId,
          adAccountId: rec.adAccountId,
          confidence: meta.confidence,
          assigneeUserId: meta.assigneeUserId,
          action: meta.action,
        };
        if (!seesCost || !("currentBudgetAmount" in rec)) return row;
        return {
          ...row,
          setByName: rec.campaign?.budgetSetBy?.name ?? null,
          currentBudgetAmount: rec.currentBudgetAmount ? dec(rec.currentBudgetAmount) : null,
          proposedBudgetAmount: rec.proposedBudgetAmount ? dec(rec.proposedBudgetAmount) : null,
          proposedCurrency: rec.proposedCurrency,
          proposedBudgetPeriod: rec.proposedBudgetPeriod,
        };
      }),
    digests: digests.map((digest) => ({
      id: digest.id,
      createdAt: digest.createdAt.toISOString(),
      delivery: digest.delivery,
      payload: digest.payload,
    })),
    leadQuality: await leadQualityTilesFor(seesCost, access?.workspaceId || ""),
  };
  return presentWithoutCost(redactMarketingPage(page, seesCost), seesCost);
}

async function leadQualityTilesFor(seesCost: boolean, workspaceId: string) {
  if (!leadScoringEnabled() || !workspaceId) return null;
  const now = new Date();
  const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const previousStart = new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000);
  const rows = await leadsSince(previousStart, workspaceId);
  const split = splitByWindow(rows, start, previousStart);
  if (!seesCost) {
    return buildLeadQualityTiles({ current: split.current, previous: split.previous, seesCost: false });
  }
  const spendByCurrency = await spendSince(start, workspaceId);
  return buildLeadQualityTiles({ current: split.current, previous: split.previous, seesCost: true, spendByCurrency });
}

export function clientRange(range: string | undefined, now = new Date()) {
  const end = new Date(now);
  const start = new Date(now);
  if (range === "30") start.setUTCDate(start.getUTCDate() - 30);
  else if (range === "month") start.setUTCDate(1);
  else if (range === "last-month") {
    start.setUTCMonth(start.getUTCMonth() - 1, 1);
    end.setUTCDate(0);
  } else start.setUTCDate(start.getUTCDate() - 7);
  const label = range === "30" ? "Last 30 days" : range === "month" ? "This month" : range === "last-month" ? "Last month" : "Last 7 days";
  return { start, end, label };
}

export async function loadClientPerformance(
  clientName: string,
  meta: { workspaceId: string; adAccountIds?: "all" | string[]; sharedBy?: string; expires?: string; range?: string },
) {
  const window = clientRange(meta.range);
  const adAccountIds = meta.adAccountIds ?? "all";
  const metrics = await prisma.dailyMetric.findMany({
    where: clientMetricWhere(meta.workspaceId, adAccountIds, window.start, window.end),
    orderBy: [{ date: "desc" }],
    take: 200,
    select: {
      date: true,
      ingestedAt: true,
      impressions: true,
      platformLeads: true,
      platformConversions: true,
      platform: true,
      campaign: { select: { name: true } },
    },
  });
  const byCampaign = new Map<string, { name: string; channel: string; leads: number; booked: number }>();
  let adViews = 0;
  let leads = 0;
  let booked = 0;
  let latest = window.end;
  for (const metric of metrics) {
    const name = metric.campaign?.name || "Campaign";
    const row = byCampaign.get(name) ?? { name, channel: metric.platform === "meta" ? "Meta" : metric.platform, leads: 0, booked: 0 };
    row.leads += dec(metric.platformLeads);
    row.booked += dec(metric.platformConversions);
    byCampaign.set(name, row);
    adViews += Number(metric.impressions);
    leads += dec(metric.platformLeads);
    booked += dec(metric.platformConversions);
    if (metric.ingestedAt > latest) latest = metric.ingestedAt;
  }
  const clock = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" }).format(latest);
  const qualified = await qualifiedForRange(window.start, window.end, window.label, meta.workspaceId);
  const notes: string[] = [];
  if (creativeFatigueEnabled()) {
    const testing = await prisma.creativeVersion.count({ where: queuedTestingWhere(meta.workspaceId, adAccountIds) });
    if (testing > 0) notes.push(CLIENT_TESTING_NOTE);
  }
  return buildClientShare({
    client: clientName,
    adViews,
    leads,
    booked,
    campaigns: [...byCampaign.values()],
    sharedBy: meta?.sharedBy,
    expires: meta?.expires,
    rangeLabel: window.label,
    updated: `Updated ${clock}`,
    qualified,
    notes,
  });
}

async function qualifiedForRange(start: Date, end: Date, label: string, workspaceId: string) {
  if (!leadScoringEnabled() || !workspaceId) return null;
  const length = Math.max(1, end.getTime() - start.getTime());
  const previousStart = new Date(start.getTime() - length);
  const rows = await leadsSince(previousStart, workspaceId);
  const split = splitByWindow(
    rows.filter((row) => row.createdAt < end),
    start,
    previousStart,
  );
  const count = split.current.filter((row) => effectiveLabel(row) === "qualified").length;
  const previous = split.previous.filter((row) => effectiveLabel(row) === "qualified").length;
  return {
    count,
    total: split.current.length,
    delta: count - previous,
    period: label === "Last 7 days" ? ("week" as const) : ("period" as const),
  };
}

export async function recordClientView(input: Parameters<typeof clientViewEvent>[0]) {
  const event: ClientViewEvent = clientViewEvent(input);
  await prisma.clientViewAudit.create({ data: event });
}

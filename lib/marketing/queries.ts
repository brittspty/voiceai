import { prisma } from "../db";
import { accessFromUser, type MarketingAccess } from "./access";
import { buildClientShare } from "./client-view";
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

function inScope(access: MarketingAccess | undefined, input: { adAccountId?: string | null; campaignId?: string | null }) {
  if (!access || access.accounts === "all") return true;
  if (input.campaignId && access.campaigns !== "all" && access.campaigns.includes(input.campaignId)) return true;
  if (input.adAccountId && access.accounts.includes(input.adAccountId)) return true;
  return false;
}

export async function getMarketingPage(access?: MarketingAccess) {
  const [accounts, campaigns, metrics, lastRun, grouped] = await Promise.all([
    prisma.adAccount.findMany({ orderBy: { name: "asc" } }),
    prisma.campaign.findMany({
      orderBy: { name: "asc" },
      include: { adAccount: { select: { id: true, name: true, currency: true } }, _count: { select: { adGroups: true } } },
    }),
    prisma.dailyMetric.findMany({
      orderBy: [{ date: "desc" }, { adId: "asc" }],
      take: 100,
      include: {
        ad: { select: { name: true } },
        campaign: { select: { id: true, name: true, adAccountId: true, adAccount: { select: { name: true } } } },
      },
    }),
    prisma.marketingSyncRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.dailyMetric.groupBy({
      by: ["currency"],
      _sum: { spend: true, impressions: true, clicks: true, platformLeads: true },
    }),
  ]);

  const [alerts, recommendations, digests] = access?.seesAlerts
    ? await Promise.all([
        prisma.adAlert.findMany({ orderBy: { detectedAt: "desc" }, take: 50, include: { ad: { select: { name: true } }, adAccount: { select: { name: true } } } }),
        prisma.recommendation.findMany({
          where: { status: { in: ["verified", "accepted", "declined", "dismissed"] } },
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { ad: { select: { name: true } }, campaign: { select: { budgetSetBy: { select: { name: true } } } } },
        }),
        prisma.managerDigest.findMany({ where: { userId: access.userId }, orderBy: { createdAt: "desc" }, take: 12 }),
      ])
    : [[], [], []];

  const visibleAccounts = accounts.filter((account) => inScope(access, { adAccountId: account.id }));
  const visibleCampaigns = campaigns.filter((campaign) => inScope(access, { adAccountId: campaign.adAccount.id, campaignId: campaign.id }));

  return {
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
    campaigns: visibleCampaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      accountId: campaign.adAccount.id,
      account: campaign.adAccount.name,
      objective: campaign.objective,
      status: campaign.status,
      budgetType: campaign.budgetType,
      budgetAmount: campaign.budgetAmount ? dec(campaign.budgetAmount) : null,
      budgetCurrency: campaign.budgetCurrency,
      budgetSetAt: campaign.budgetSetAt?.toISOString() ?? null,
      reportedBudgetType: campaign.reportedBudgetType,
      reportedBudgetAmount: campaign.reportedBudgetAmount ? dec(campaign.reportedBudgetAmount) : null,
      currency: campaign.adAccount.currency,
      adGroups: campaign._count.adGroups,
    })),
    rows: metrics.filter((metric) => inScope(access, { adAccountId: metric.campaign?.adAccountId, campaignId: metric.campaign?.id })).map((metric) => ({
      id: metric.id,
      date: metric.date.toISOString().slice(0, 10),
      account: metric.campaign?.adAccount.name ?? "—",
      campaign: metric.campaign?.name ?? "—",
      ad: metric.ad.name,
      currency: metric.currency,
      spend: dec(metric.spend),
      impressions: num(metric.impressions),
      clicks: num(metric.clicks),
      reach: num(metric.reach),
      leads: dec(metric.platformLeads),
    })),
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
    totals: grouped.map((group) => ({
      currency: group.currency,
      spend: dec(group._sum.spend),
      impressions: num(group._sum.impressions),
      clicks: num(group._sum.clicks),
      leads: dec(group._sum.platformLeads),
    })),
    alerts: alerts
      .filter((alert) => inScope(access, { adAccountId: alert.adAccountId, campaignId: alert.campaignId }))
      .map((alert) => ({
        id: alert.id,
        severity: alert.severity,
        title: alert.title,
        summary: alert.summary,
        ad: alert.ad.name,
        account: alert.adAccount.name,
        detectedAt: alert.detectedAt.toISOString(),
      })),
    recommendations: recommendations
      .filter((rec) => inScope(access, { adAccountId: rec.adAccountId, campaignId: rec.campaignId }))
      .map((rec) => ({
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
        setByName: rec.campaign?.budgetSetBy?.name ?? null,
        currentBudgetAmount: rec.currentBudgetAmount ? dec(rec.currentBudgetAmount) : null,
        proposedBudgetAmount: rec.proposedBudgetAmount ? dec(rec.proposedBudgetAmount) : null,
        proposedCurrency: rec.proposedCurrency,
        proposedBudgetPeriod: rec.proposedBudgetPeriod,
        campaignId: rec.campaignId,
        adAccountId: rec.adAccountId,
      })),
    digests: digests.map((digest) => ({
      id: digest.id,
      createdAt: digest.createdAt.toISOString(),
      delivery: digest.delivery,
      payload: digest.payload,
    })),
  };
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

export async function loadClientPerformance(clientName: string, meta?: { sharedBy?: string; expires?: string; range?: string }) {
  const window = clientRange(meta?.range);
  const metrics = await prisma.dailyMetric.findMany({
    where: { date: { gte: window.start, lte: window.end } },
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
  });
}

export async function recordClientView(input: Parameters<typeof clientViewEvent>[0]) {
  const event: ClientViewEvent = clientViewEvent(input);
  await prisma.clientViewAudit.create({ data: event });
}

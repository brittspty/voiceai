import { prisma } from "../db";

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

export async function getMarketingPage() {
  const [accounts, campaigns, metrics, lastRun, grouped] = await Promise.all([
    prisma.adAccount.findMany({ orderBy: { name: "asc" } }),
    prisma.campaign.findMany({
      orderBy: { name: "asc" },
      include: { adAccount: { select: { name: true, currency: true } }, _count: { select: { adGroups: true } } },
    }),
    prisma.dailyMetric.findMany({
      orderBy: [{ date: "desc" }, { adId: "asc" }],
      take: 100,
      include: {
        ad: { select: { name: true } },
        campaign: { select: { name: true, adAccount: { select: { name: true } } } },
      },
    }),
    prisma.marketingSyncRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.dailyMetric.groupBy({
      by: ["currency"],
      _sum: { spend: true, impressions: true, clicks: true, platformLeads: true },
    }),
  ]);

  return {
    mock: lastRun?.mode === "mock",
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      platform: account.platform,
      externalId: account.externalId,
      currency: account.currency,
      timezone: account.timezone,
      status: account.status,
      syncEnabled: account.syncEnabled,
    })),
    campaigns: campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      account: campaign.adAccount.name,
      objective: campaign.objective,
      status: campaign.status,
      budgetType: campaign.budgetType,
      budgetAmount: campaign.budgetAmount ? dec(campaign.budgetAmount) : null,
      currency: campaign.adAccount.currency,
      adGroups: campaign._count.adGroups,
    })),
    rows: metrics.map((metric) => ({
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
  };
}

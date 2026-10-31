import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { addDaysISO, zonedISODate } from "../time";
import { roleLabel, type MarketingAccess } from "./access";
import { presentWithoutCost } from "./client-view";
import { isCostContent } from "./cost-visibility";
import {
  assembleCampaigns,
  dashboardCampaignWhere,
  dashboardMetricWhere,
  dashboardPlatforms,
  projectDashboard,
  sourceLine,
  type DashboardModel,
  type DashPlatform,
  type RawCampaign,
  type RawMetric,
} from "./dashboard-model";
import { canEditLeadValue } from "./lead-value";
import { isolatedWhere } from "./workspace";

const WINDOW_DAYS = 60;

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

export function dashboardDateAxis(now = new Date(), timeZone = "America/New_York") {
  const end = zonedISODate(now, timeZone);
  const dates: string[] = [];
  for (let offset = WINDOW_DAYS - 1; offset >= 0; offset -= 1) dates.push(addDaysISO(end, -offset));
  return dates;
}

function updatedLabel(date: Date | null) {
  if (!date) return "not yet";
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(date);
  return `${formatted} ET`;
}

function emptyModel(input: { mode: "staff" | "client"; workspaceName: string; dates: string[] }): DashboardModel {
  return projectDashboard(
    {
      mode: input.mode,
      showMoney: false,
      dates: input.dates,
      campaigns: [],
      notes: [],
      sourceLine: sourceLine({ platforms: ["meta"], updatedLabel: "not yet", accountIds: null }),
      workspaceName: input.workspaceName,
      mock: false,
    },
    { mode: input.mode, showMoney: false, canEditLeadValue: false },
  );
}

function scopeFilter(access: MarketingAccess) {
  if (!access.workspaceId || access.kind === "none") return { blocked: true as const };
  if (access.campaigns !== "all") return { blocked: false as const, campaignIds: access.campaigns, adAccountIds: "all" as const };
  if (access.accounts !== "all") return { blocked: false as const, campaignIds: "all" as const, adAccountIds: access.accounts };
  return { blocked: false as const, campaignIds: "all" as const, adAccountIds: "all" as const };
}

/**
 * Read-only dashboard load. Every query includes workspaceId.
 * Spend, budgets, and lead value are selected only for staff who may see cost.
 * This function does not write budgets or call an ad platform.
 */
export async function loadDashboard(input: {
  workspaceId: string;
  workspaceName: string;
  mode: "staff" | "client";
  access?: MarketingAccess;
  now?: Date;
}): Promise<DashboardModel> {
  const workspaceId = input.workspaceId.trim();
  const dates = dashboardDateAxis(input.now);
  const mode = input.mode;
  if (!workspaceId) return emptyModel({ mode, workspaceName: input.workspaceName, dates });
  const access = input.access;
  const showMoney = mode === "staff" && Boolean(access?.seesCost);
  const editable = mode === "staff" && access ? canEditLeadValue(access) : false;
  const scope = access ? scopeFilter(access) : { blocked: false as const, campaignIds: "all" as const, adAccountIds: "all" as const };
  if (access && access.workspaceId !== workspaceId) return emptyModel({ mode, workspaceName: input.workspaceName, dates });
  if (scope.blocked) return emptyModel({ mode, workspaceName: input.workspaceName, dates });

  const platforms = dashboardPlatforms();
  const where = dashboardCampaignWhere({
    workspaceId,
    platforms,
    campaignIds: scope.campaignIds,
    adAccountIds: scope.adAccountIds,
  });
  if (where.id && where.id.in.length === 0) return emptyModel({ mode, workspaceName: input.workspaceName, dates });

  const campaignSelect = {
    id: true,
    name: true,
    objective: true,
    status: true,
    platform: true,
    adGroups: {
      select: {
        name: true,
        audiences: { where: { role: "include" as const }, select: { audience: { select: { name: true } } } },
        ads: {
          where: { status: { notIn: ["archived" as const, "deleted" as const] } },
          select: {
            id: true,
            name: true,
            status: true,
            creativeVersion: { select: { mediaRef: true, creative: { select: { format: true } } } },
          },
        },
      },
    },
    ...(showMoney
      ? {
          budgetType: true,
          budgetAmount: true,
          budgetSetAt: true,
          budgetSetBy: { select: { name: true } },
        }
      : {}),
  } satisfies Prisma.CampaignSelect;

  const campaigns = await prisma.campaign.findMany({
    where,
    orderBy: { name: "asc" },
    select: campaignSelect,
  });
  const campaignIds = campaigns.map((campaign) => campaign.id);
  const metricWhere = dashboardMetricWhere({
    workspaceId,
    platforms,
    campaignIds,
    start: dates[0],
    end: dates[dates.length - 1],
  });

  const [metricRows, runs, notes, settings, accounts] = await Promise.all([
    campaignIds.length
      ? prisma.dailyMetric.findMany({
          where: metricWhere,
          select: {
            date: true,
            adId: true,
            campaignId: true,
            attributionWindow: true,
            impressions: true,
            clicks: true,
            reach: true,
            platformLeads: true,
            platformConversions: true,
            ...(showMoney ? { spend: true } : {}),
          },
        })
      : Promise.resolve([]),
    prisma.marketingSyncRun.findMany({
      where: isolatedWhere(workspaceId, { platform: { in: platforms } }),
      orderBy: { finishedAt: "desc" },
      take: 8,
      select: { finishedAt: true, mode: true, platform: true, status: true },
    }),
    prisma.recommendation.findMany({
      where: isolatedWhere(workspaceId, {
        status: { in: ["verified", "accepted"] },
        campaignId: { in: campaignIds },
      }) as Prisma.RecommendationWhereInput,
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { title: true, summary: true, type: true, metric: true, campaignId: true, campaign: { select: { name: true } } },
    }),
    showMoney
      ? prisma.clientSettings.findUnique({
          where: isolatedWhere(workspaceId),
          include: { leadValueSetBy: { select: { name: true, role: true } } },
        })
      : Promise.resolve(null),
    mode === "staff"
      ? prisma.adAccount.findMany({
          where: isolatedWhere(workspaceId, { platform: { in: platforms } }),
          select: { externalId: true, platform: true },
        })
      : Promise.resolve([]),
  ]);

  const rawCampaigns: RawCampaign[] = campaigns
    .filter((campaign) => campaign.platform === "meta" || campaign.platform === "google_ads")
    .map((campaign) => {
      const money = showMoney && "budgetAmount" in campaign ? campaign : null;
      const daily = money && money.budgetType === "daily" && money.budgetAmount != null ? dec(money.budgetAmount) : null;
      return {
        id: campaign.id,
        name: campaign.name,
        objective: campaign.objective,
        status: campaign.status,
        platform: campaign.platform as DashPlatform,
        dailyBudget: daily,
        budgetSetBy: money?.budgetSetBy?.name ?? null,
        budgetSetAt: money?.budgetSetAt ? money.budgetSetAt.toISOString().slice(0, 10) : null,
        ads: campaign.adGroups.flatMap((group) => {
          const names = group.audiences.map((link) => link.audience.name).filter(Boolean);
          const audienceNames = names.length ? names : [group.name];
          return group.ads.map((ad) => ({
            id: ad.id,
            name: ad.name,
            status: ad.status,
            format: ad.creativeVersion?.creative.format || "unknown",
            audienceNames,
            thumbnailUrl: ad.creativeVersion?.mediaRef || null,
          }));
        }),
      };
    });

  const metrics: RawMetric[] = metricRows.map((row) => {
    const metric: RawMetric = {
      date: row.date.toISOString().slice(0, 10),
      adId: row.adId,
      campaignId: row.campaignId || "",
      attributionWindow: row.attributionWindow,
      impressions: num(row.impressions),
      clicks: num(row.clicks),
      reach: num(row.reach),
      platformLeads: dec(row.platformLeads),
      platformConversions: dec(row.platformConversions),
    };
    if (showMoney && "spend" in row) metric.spend = dec(row.spend);
    return metric;
  });

  const present = new Set<DashPlatform>(platforms.includes("meta") ? ["meta"] : []);
  if (rawCampaigns.some((campaign) => campaign.platform === "google_ads") || runs.some((run) => run.platform === "google_ads")) {
    present.add("google_ads");
  }
  const latest = runs.find((run) => run.finishedAt);
  const accountIds =
    mode === "staff" ? accounts.filter((account) => account.platform === "meta" && account.externalId.startsWith("act_")).map((account) => account.externalId) : null;

  const leadValue =
    settings?.leadValueCents != null
      ? {
          leadCents: settings.leadValueCents,
          callCents: settings.callValueCents,
          by: settings.leadValueSetBy ? `${settings.leadValueSetBy.name} (${roleLabel(settings.leadValueSetBy.role)})` : "a teammate",
          at: settings.leadValueSetAt ? `${updatedLabel(settings.leadValueSetAt)}` : updatedLabel(settings.updatedAt),
        }
      : null;

  const model: DashboardModel = {
    mode,
    showMoney,
    canEditLeadValue: editable,
    dates,
    campaigns: assembleCampaigns({ dates, campaigns: rawCampaigns, metrics, clientLabels: mode === "client", showMoney }),
    notes: notes
      .filter((note) => (showMoney ? true : !isCostContent(note)))
      .map((note) => ({
        campaignId: note.campaignId || "",
        campaignName: note.campaign?.name || "Campaign",
        text: note.summary || note.title,
      })),
    leadValue,
    sourceLine: sourceLine({
      platforms: [...present],
      updatedLabel: updatedLabel(latest?.finishedAt ?? null),
      accountIds: mode === "staff" ? accountIds : null,
    }),
    workspaceName: input.workspaceName,
    mock: latest?.mode === "mock",
  };
  return presentWithoutCost(projectDashboard(model, { mode, showMoney, canEditLeadValue: editable }), showMoney);
}

export async function loadDashboardForAccess(access: MarketingAccess, mode: "staff" | "client", workspaceName: string, now?: Date) {
  return loadDashboard({ workspaceId: access.workspaceId, workspaceName, mode, access, now });
}

export async function loadClientDashboard(workspaceId: string, workspaceName: string, now?: Date) {
  return loadDashboard({ workspaceId, workspaceName, mode: "client", now });
}

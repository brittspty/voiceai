import { prisma } from "../db";
import { addDaysISO, zonedISODate } from "../time";
import { canSwitchMarketingClient, type MarketingAccess } from "./access";
import { marketingClientSwitcherEnabled, type Env } from "./config";
import { resultCounts } from "./dashboard-model";
import { realHomeFromRows, type RealCampaignInput, type RealMetricInput } from "./real-view";
import { isolatedWhere } from "./workspace";

const PLATFORMS: ("meta" | "google_ads" | "stackadapt")[] = ["meta", "google_ads", "stackadapt"];

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

/** Null while MARKETING_CLIENT_SWITCHER is off. An empty list is a staff viewer with no clients, or a non-staff viewer. */
export async function loadRealClientChoices(access: MarketingAccess, env: Env = process.env) {
  if (!marketingClientSwitcherEnabled(env)) return null;
  if (!canSwitchMarketingClient(access) || !access.workspaceId.trim()) return [];
  return prisma.marketingClient.findMany({
    where: isolatedWhere(access.workspaceId),
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/**
 * Real campaigns and the last 7 days of metrics.
 * The client param is ignored unless the switch is on and the viewer is staff.
 * Spend is selected only when this viewer may see cost.
 */
export async function loadRealHome(input: { access: MarketingAccess; requestedClientId?: string | null; now?: Date; env?: Env }) {
  const env = input.env ?? process.env;
  const enabled = marketingClientSwitcherEnabled(env);
  if (!enabled) return null;
  const access = input.access;
  const staff = canSwitchMarketingClient(access);
  const showMoney = Boolean(access.seesCost);
  const workspaceId = access.workspaceId.trim();
  if (!workspaceId || access.kind === "none") {
    return realHomeFromRows({
      enabled: true,
      staff,
      showMoney: false,
      requestedId: null,
      clients: [],
      campaigns: [],
      metrics: [],
      updatedLabel: "not yet",
    });
  }
  const clients = staff
    ? await prisma.marketingClient.findMany({
        where: isolatedWhere(workspaceId),
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];
  const clientId = staff ? input.requestedClientId ?? null : null;
  const where: {
    platform: { in: ("meta" | "google_ads" | "stackadapt")[] };
    status: { notIn: ("archived" | "deleted")[] };
    id?: { in: string[] };
    adAccountId?: { in: string[] };
    clientId?: string;
  } = {
    platform: { in: [...PLATFORMS] },
    status: { notIn: ["archived", "deleted"] },
  };
  if (access.campaigns !== "all") where.id = { in: access.campaigns };
  else if (access.accounts !== "all") where.adAccountId = { in: access.accounts };
  const known = new Set(clients.map((row) => row.id));
  const picked = clientId && known.has(clientId) ? clientId : null;
  if (picked) where.clientId = picked;
  if (where.id && where.id.in.length === 0) {
    return realHomeFromRows({
      enabled: true,
      staff,
      showMoney,
      requestedId: input.requestedClientId ?? null,
      clients,
      campaigns: [],
      metrics: [],
      updatedLabel: "not yet",
    });
  }
  const campaigns = await prisma.campaign.findMany({
    where: isolatedWhere(workspaceId, where),
    orderBy: { name: "asc" },
    select: { id: true, name: true, platform: true, status: true, objective: true, clientId: true },
  });
  const end = zonedISODate(input.now ?? new Date(), "America/New_York");
  const start = addDaysISO(end, -6);
  const ids = campaigns.map((row) => row.id);
  const metricRows = ids.length
    ? await prisma.dailyMetric.findMany({
        where: isolatedWhere(workspaceId, {
          campaignId: { in: ids },
          platform: { in: PLATFORMS },
          date: { gte: new Date(`${start}T00:00:00.000Z`), lte: new Date(`${end}T00:00:00.000Z`) },
          audienceSegment: { segmentKey: "all" },
        }),
        select: {
          campaignId: true,
          impressions: true,
          clicks: true,
          platformLeads: true,
          platformConversions: true,
          ...(showMoney ? { spend: true } : {}),
        },
      })
    : [];
  const objectives = new Map(campaigns.map((row) => [row.id, row.objective]));
  const rawCampaigns: RealCampaignInput[] = campaigns
    .filter((row) => row.platform === "meta" || row.platform === "google_ads" || row.platform === "stackadapt")
    .map((row) => ({
      id: row.id,
      name: row.name,
      platform: row.platform,
      status: row.status,
      clientId: row.clientId,
    }));
  const metrics: RealMetricInput[] = metricRows.map((row) => {
    const counts = resultCounts(objectives.get(row.campaignId || "") || "leads", dec(row.platformLeads), dec(row.platformConversions));
    const metric: RealMetricInput = {
      campaignId: row.campaignId || "",
      impressions: num(row.impressions),
      clicks: num(row.clicks),
      leads: counts.leads,
      calls: counts.calls,
    };
    if (showMoney && "spend" in row) metric.spend = dec(row.spend);
    return metric;
  });
  return realHomeFromRows({
    enabled: true,
    staff,
    showMoney,
    requestedId: input.requestedClientId ?? null,
    clients,
    campaigns: rawCampaigns,
    metrics,
    updatedLabel: metricRows.length ? end : "not yet",
  });
}

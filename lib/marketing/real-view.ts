import { presentWithoutCost } from "./client-view";
import { dashboardClientFilter } from "./dashboard-model";
import type { NavItem } from "./channels/nav";

export const REAL_CHANNELS = [
  { platform: "meta", slug: "meta", staff: "Meta", client: "Facebook & Instagram ads" },
  { platform: "google_ads", slug: "google-ads", staff: "Google Ads", client: "Google search ads" },
  { platform: "stackadapt", slug: "stackadapt", staff: "StackAdapt", client: "StackAdapt" },
] as const;

export type RealPlatform = (typeof REAL_CHANNELS)[number]["platform"];

export type RealClientChoice = { id: string; name: string };

export type RealCampaignRow = {
  id: string;
  name: string;
  status: string;
  leads: number;
  clicks: number;
  impressions: number;
  spend?: number;
};

export type RealChannelRow = {
  platform: RealPlatform;
  slug: string;
  label: string;
  href: string;
  connected: boolean;
  hasMetrics: boolean;
  status: "Not connected yet" | "No data yet" | "Active";
  impressions: number;
  clicks: number;
  leads: number;
  calls: number;
  campaigns: RealCampaignRow[];
  spend?: number;
};

export type RealHomeModel = {
  example: false;
  showMoney: boolean;
  canPickClient: boolean;
  clients: RealClientChoice[];
  clientId: string | null;
  clientName: string;
  updatedLabel: string;
  channels: RealChannelRow[];
};

export type RealCampaignInput = {
  id: string;
  name: string;
  platform: string;
  status: string;
  clientId: string | null;
};

export type RealMetricInput = {
  campaignId: string;
  impressions: number;
  clicks: number;
  leads: number;
  calls: number;
  spend?: number;
};

export function realChannelSlug(platform: string) {
  return REAL_CHANNELS.find((row) => row.platform === platform)?.slug ?? null;
}

export function platformFromSlug(slug: string): RealPlatform | null {
  const token = slug.trim().toLowerCase();
  if (token === "meta" || token === "facebook" || token === "instagram") return "meta";
  if (token === "google" || token === "google-ads" || token === "google_ads") return "google_ads";
  if (token === "stackadapt" || token === "ctv") return "stackadapt";
  return null;
}

export function realChannelLinks(audience: "staff" | "client", clientId: string | null = null): NavItem[] {
  const id = clientId || "all";
  return REAL_CHANNELS.map((row) => ({
    href: `/c/${id}/${row.slug}`,
    label: audience === "staff" ? row.staff : row.client,
    group: "Channels",
  }));
}

/**
 * Staff client pick. A missing switch, a non-staff viewer, or an unknown id stays on the caller's own rows.
 */
export function realClientId(input: { enabled: boolean; staff: boolean; requestedId: string | null; knownIds: readonly string[] }) {
  return dashboardClientFilter(input);
}

export function realHomeFromRows(input: {
  enabled: boolean;
  staff: boolean;
  showMoney: boolean;
  requestedId: string | null;
  clients: readonly RealClientChoice[];
  campaigns: readonly RealCampaignInput[];
  metrics: readonly RealMetricInput[];
  updatedLabel?: string;
}): RealHomeModel | null {
  if (!input.enabled) return null;
  const showMoney = input.staff && input.showMoney;
  const clientId = realClientId({
    enabled: true,
    staff: input.staff,
    requestedId: input.requestedId,
    knownIds: input.clients.map((row) => row.id),
  });
  const campaigns = input.campaigns.filter((row) => !clientId || row.clientId === clientId);
  const allowed = new Set(campaigns.map((row) => row.id));
  const totals = new Map<string, { impressions: number; clicks: number; leads: number; calls: number; spend: number; rows: number }>();
  for (const metric of input.metrics) {
    if (!allowed.has(metric.campaignId)) continue;
    const current = totals.get(metric.campaignId) ?? { impressions: 0, clicks: 0, leads: 0, calls: 0, spend: 0, rows: 0 };
    current.impressions += metric.impressions;
    current.clicks += metric.clicks;
    current.leads += metric.leads;
    current.calls += metric.calls;
    current.spend += metric.spend ?? 0;
    current.rows += 1;
    totals.set(metric.campaignId, current);
  }
  const segment = clientId || "all";
  const channels: RealChannelRow[] = REAL_CHANNELS.map((spec) => {
    const rows = campaigns.filter((row) => row.platform === spec.platform);
    const campaignRows: RealCampaignRow[] = rows.map((row) => {
      const metric = totals.get(row.id);
      const next: RealCampaignRow = {
        id: row.id,
        name: row.name,
        status: row.status || "unknown",
        leads: metric?.leads ?? 0,
        clicks: metric?.clicks ?? 0,
        impressions: metric?.impressions ?? 0,
      };
      if (showMoney) next.spend = metric?.spend ?? 0;
      return next;
    });
    const hasMetrics = rows.some((row) => (totals.get(row.id)?.rows ?? 0) > 0);
    const connected = rows.length > 0;
    const channel: RealChannelRow = {
      platform: spec.platform,
      slug: spec.slug,
      label: input.staff ? spec.staff : spec.client,
      href: `/c/${segment}/${spec.slug}`,
      connected,
      hasMetrics,
      status: !connected ? "Not connected yet" : hasMetrics ? "Active" : "No data yet",
      impressions: campaignRows.reduce((sum, row) => sum + row.impressions, 0),
      clicks: campaignRows.reduce((sum, row) => sum + row.clicks, 0),
      leads: campaignRows.reduce((sum, row) => sum + row.leads, 0),
      calls: rows.reduce((sum, row) => sum + (totals.get(row.id)?.calls ?? 0), 0),
      campaigns: campaignRows,
    };
    if (showMoney) channel.spend = campaignRows.reduce((sum, row) => sum + (row.spend ?? 0), 0);
    return channel;
  });
  const selected = clientId ? input.clients.find((row) => row.id === clientId) : null;
  const model: RealHomeModel = {
    example: false,
    showMoney,
    canPickClient: input.staff,
    clients: input.staff ? [...input.clients] : [],
    clientId,
    clientName: selected?.name || (input.staff ? "All clients" : "Your campaigns"),
    updatedLabel: input.updatedLabel || "not yet",
    channels,
  };
  return presentWithoutCost(model, showMoney);
}

export function emptyAudiencePayload() {
  return {
    example: false as const,
    recommendationOnly: true as const,
    summary: "No data yet",
    rows: [] as [],
    campaigns: [] as [],
  };
}

import { presentWithoutCost } from "./client-view";
import { DASH_DAY_OPTIONS, dashboardClientFilter, type DashWindow } from "./dashboard-model";
import type { NavItem } from "./channels/nav";
import { addDaysISO } from "../time";
import type { SP } from "../params";

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

/** Home defaults to the window it already showed. Marketing keeps its own 30-day default. */
export const REAL_DEFAULT_DAYS: DashWindow = 7;

export type RealStatus = "" | "active" | "paused";

export type RealPoint = {
  date: string;
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
  status: "Not connected yet" | "No data yet" | "No active campaigns" | "Active";
  impressions: number;
  clicks: number;
  leads: number;
  calls: number;
  /** Campaigns with delivery inside the selected dates. */
  inRange: number;
  campaigns: RealCampaignRow[];
  series: RealPoint[];
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
  days: DashWindow;
  status: RealStatus;
  series: RealPoint[];
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
  /** Set when the caller wants the date window applied. Undated rows count only when no end date is set. */
  date?: string;
};

function readParam(source: URLSearchParams | SP, key: string) {
  if (source instanceof URLSearchParams) return source.get(key) || "";
  const value = source[key];
  return (Array.isArray(value) ? value[0] : value) || "";
}

/** Accepts the marketing `d` param and the `days` / `range` names used against the home API. */
export function parseRealViewQuery(source: URLSearchParams | SP, staff: boolean): { days: DashWindow; status: RealStatus } {
  const daysRaw = readParam(source, "d") || readParam(source, "days") || readParam(source, "range");
  const days = DASH_DAY_OPTIONS.find((value) => String(value) === daysRaw.trim()) ?? REAL_DEFAULT_DAYS;
  const statusRaw = readParam(source, "st").trim().toLowerCase();
  if (statusRaw === "active" || statusRaw === "paused") return { days, status: statusRaw };
  if (statusRaw === "all" || statusRaw === "any") return { days, status: "" };
  return { days, status: staff ? "active" : "" };
}

/** Staff with no status filter must keep `st=all`, because a missing status means Active. */
export function realViewSearch(input: {
  days: DashWindow;
  status: RealStatus;
  staff: boolean;
  clientId?: string | null;
  path?: string;
}) {
  const params = new URLSearchParams();
  if (input.clientId) params.set("client", input.clientId);
  params.set("d", String(input.days));
  if (input.status) params.set("st", input.status);
  else if (input.staff) params.set("st", "all");
  const query = params.toString();
  const path = input.path || "";
  return query ? `${path}?${query}` : path;
}

export function realDateWindow(end: string, days: number) {
  const dates: string[] = [];
  const start = addDaysISO(end, -(days - 1));
  let cursor = start;
  while (dates.length < days) {
    dates.push(cursor);
    cursor = addDaysISO(cursor, 1);
  }
  return dates;
}

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

function blankPoint(date: string, showMoney: boolean): RealPoint {
  const point: RealPoint = { date, leads: 0, clicks: 0, impressions: 0 };
  if (showMoney) point.spend = 0;
  return point;
}

function addPoint(point: RealPoint, metric: RealMetricInput) {
  point.impressions += metric.impressions;
  point.clicks += metric.clicks;
  point.leads += metric.leads;
  if (point.spend != null) point.spend += metric.spend ?? 0;
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
  days?: DashWindow;
  /** Inclusive end date. When set, only metrics on these dates are counted. */
  endDate?: string;
  status?: RealStatus;
}): RealHomeModel | null {
  if (!input.enabled) return null;
  const showMoney = input.staff && input.showMoney;
  const days = input.days ?? REAL_DEFAULT_DAYS;
  const status = input.status ?? "";
  const dates = input.endDate ? realDateWindow(input.endDate, days) : [];
  const window = dates.length ? new Set(dates) : null;
  const clientId = realClientId({
    enabled: true,
    staff: input.staff,
    requestedId: input.requestedId,
    knownIds: input.clients.map((row) => row.id),
  });
  const campaigns = input.campaigns.filter((row) => !clientId || row.clientId === clientId);
  const totals = new Map<string, { impressions: number; clicks: number; leads: number; calls: number; spend: number; rows: number }>();
  const byDate = new Map<string, RealMetricInput[]>();
  for (const metric of input.metrics) {
    if (window && (!metric.date || !window.has(metric.date))) continue;
    const current = totals.get(metric.campaignId) ?? { impressions: 0, clicks: 0, leads: 0, calls: 0, spend: 0, rows: 0 };
    current.impressions += metric.impressions;
    current.clicks += metric.clicks;
    current.leads += metric.leads;
    current.calls += metric.calls;
    current.spend += metric.spend ?? 0;
    current.rows += 1;
    totals.set(metric.campaignId, current);
    if (metric.date) {
      const list = byDate.get(metric.date) ?? [];
      list.push(metric);
      byDate.set(metric.date, list);
    }
  }
  const segment = clientId || "all";
  const channels: RealChannelRow[] = REAL_CHANNELS.map((spec) => {
    const rows = campaigns.filter((row) => row.platform === spec.platform);
    const visible = rows.filter((row) => !status || row.status === status);
    const allowed = new Set(visible.map((row) => row.id));
    const series = dates.map((date) => {
      const point = blankPoint(date, showMoney);
      for (const metric of byDate.get(date) ?? []) {
        if (allowed.has(metric.campaignId)) addPoint(point, metric);
      }
      return point;
    });
    const campaignRows: RealCampaignRow[] = visible.map((row) => {
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
    const hasMetrics = visible.some((row) => (totals.get(row.id)?.rows ?? 0) > 0);
    const connected = rows.length > 0;
    const channel: RealChannelRow = {
      platform: spec.platform,
      slug: spec.slug,
      label: input.staff ? spec.staff : spec.client,
      href: `/c/${segment}/${spec.slug}`,
      connected,
      hasMetrics,
      status: !connected ? "Not connected yet" : !visible.length && status === "active" ? "No active campaigns" : hasMetrics ? "Active" : "No data yet",
      impressions: campaignRows.reduce((sum, row) => sum + row.impressions, 0),
      clicks: campaignRows.reduce((sum, row) => sum + row.clicks, 0),
      leads: campaignRows.reduce((sum, row) => sum + row.leads, 0),
      calls: visible.reduce((sum, row) => sum + (totals.get(row.id)?.calls ?? 0), 0),
      inRange: visible.filter((row) => {
        const metric = totals.get(row.id);
        return Boolean(metric && metric.impressions + metric.clicks + metric.leads + metric.calls > 0);
      }).length,
      campaigns: campaignRows,
      series,
    };
    if (showMoney) channel.spend = campaignRows.reduce((sum, row) => sum + (row.spend ?? 0), 0);
    return channel;
  });
  const series = dates.map((date, index) => {
    const point = blankPoint(date, showMoney);
    for (const channel of channels) addPoint(point, { campaignId: "", impressions: channel.series[index]?.impressions ?? 0, clicks: channel.series[index]?.clicks ?? 0, leads: channel.series[index]?.leads ?? 0, calls: 0, spend: channel.series[index]?.spend });
    return point;
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
    days,
    status,
    series,
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

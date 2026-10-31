import { deriveMetrics, type DerivedMetrics } from "./metrics";

export const CHANNEL_DAILY_KINDS = ["stackadapt", "google_business_profile", "landing_page", "lead", "ais2l", "chatgpt_ads"] as const;
export type ChannelDailyKind = (typeof CHANNEL_DAILY_KINDS)[number];

export type MetricChannel = "meta" | "google_ads" | ChannelDailyKind;

export type NormalizedFact = DerivedMetrics & {
  channel: MetricChannel;
  date: string;
  entityKey: string;
  entityName: string;
  currency: string | null;
  impressions: number | null;
  clicks: number | null;
  reach: number | null;
  spend: number | null;
  leads: number | null;
  qualifiedLeads: number | null;
  booked: number | null;
  conversions: number | null;
  conversionValue: number | null;
  profileViews: number | null;
  searches: number | null;
  calls: number | null;
  directionRequests: number | null;
  websiteClicks: number | null;
  reviewCount: number | null;
  rating: number | null;
  failedChecks: number | null;
  uptimeRate: number | null;
  medianSpeedSec: number | null;
  voiceCalls: number | null;
};

export type DailyMetricSource = {
  platform: string;
  date: Date | string;
  spend?: number | string | bigint | null;
  impressions?: number | string | bigint | null;
  clicks?: number | string | bigint | null;
  reach?: number | string | bigint | null;
  platformLeads?: number | string | bigint | null;
  platformConversions?: number | string | bigint | null;
  conversionValue?: number | string | bigint | null;
  qualifiedLeads?: number | string | null;
  booked?: number | string | null;
  currency?: string | null;
  entityKey?: string;
  entityName?: string;
};

export type ChannelDailySource = {
  channel: string;
  date: Date | string;
  entityKey?: string;
  entityName?: string;
  currency?: string | null;
  impressions?: number | string | bigint | null;
  clicks?: number | string | bigint | null;
  reach?: number | string | bigint | null;
  spend?: number | string | bigint | null;
  leads?: number | string | null;
  qualifiedLeads?: number | string | null;
  booked?: number | string | null;
  conversions?: number | string | null;
  conversionValue?: number | string | null;
  profileViews?: number | null;
  searches?: number | null;
  calls?: number | null;
  directionRequests?: number | null;
  websiteClicks?: number | null;
  reviewCount?: number | null;
  rating?: number | string | null;
  failedChecks?: number | null;
  uptimeRate?: number | string | null;
  medianSpeedSec?: number | null;
  voiceCalls?: number | null;
  term?: string;
};

function num(value: number | string | bigint | null | undefined) {
  if (value == null || value === "") return null;
  const parsed = typeof value === "bigint" ? Number(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function day(value: Date | string) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function finish(partial: Omit<NormalizedFact, keyof DerivedMetrics>): NormalizedFact {
  return { ...partial, ...deriveMetrics(partial) };
}

/** Reads a DailyMetric row. Meta and Google are not copied into ChannelDailyMetric. */
export function adaptDailyMetric(row: DailyMetricSource): NormalizedFact | null {
  if (row.platform !== "meta" && row.platform !== "google_ads") return null;
  return finish({
    channel: row.platform,
    date: day(row.date),
    entityKey: row.entityKey || "",
    entityName: row.entityName || "",
    currency: row.currency ?? "USD",
    impressions: num(row.impressions),
    clicks: num(row.clicks),
    reach: num(row.reach),
    spend: num(row.spend),
    leads: num(row.platformLeads),
    qualifiedLeads: num(row.qualifiedLeads),
    booked: num(row.booked),
    conversions: num(row.platformConversions),
    conversionValue: num(row.conversionValue),
    profileViews: null,
    searches: null,
    calls: null,
    directionRequests: null,
    websiteClicks: null,
    reviewCount: null,
    rating: null,
    failedChecks: null,
    uptimeRate: null,
    medianSpeedSec: null,
    voiceCalls: null,
  });
}

export function assertChannelDailyKind(kind: string): ChannelDailyKind {
  if (kind === "meta" || kind === "google_ads") {
    throw new Error("Meta and Google Ads stay in DailyMetric. Do not copy them into ChannelDailyMetric.");
  }
  if (kind === "search_term") throw new Error("SearchTermMetric is the only search-term table.");
  if (!(CHANNEL_DAILY_KINDS as readonly string[]).includes(kind)) throw new Error(`Unknown channel kind ${kind}`);
  return kind as ChannelDailyKind;
}

/** Reads a ChannelDailyMetric row. Rejects search terms and Meta or Google copies. */
export function adaptChannelDaily(row: ChannelDailySource): NormalizedFact {
  if (row.term) throw new Error("SearchTermMetric is the only search-term table.");
  const channel = assertChannelDailyKind(row.channel);
  const spend = channel === "google_business_profile" ? null : num(row.spend);
  return finish({
    channel,
    date: day(row.date),
    entityKey: row.entityKey || "",
    entityName: row.entityName || "",
    currency: spend == null ? null : row.currency ?? "USD",
    impressions: num(row.impressions),
    clicks: num(row.clicks),
    reach: num(row.reach),
    spend,
    leads: num(row.leads),
    qualifiedLeads: num(row.qualifiedLeads),
    booked: num(row.booked),
    conversions: num(row.conversions),
    conversionValue: spend == null ? null : num(row.conversionValue),
    profileViews: row.profileViews ?? null,
    searches: row.searches ?? null,
    calls: row.calls ?? null,
    directionRequests: row.directionRequests ?? null,
    websiteClicks: row.websiteClicks ?? null,
    reviewCount: row.reviewCount ?? null,
    rating: num(row.rating),
    failedChecks: row.failedChecks ?? null,
    uptimeRate: num(row.uptimeRate),
    medianSpeedSec: row.medianSpeedSec ?? null,
    voiceCalls: row.voiceCalls ?? null,
  });
}

export function normalizeChannelFacts(input: { daily?: DailyMetricSource[]; channel?: ChannelDailySource[] }) {
  const daily = (input.daily ?? []).map(adaptDailyMetric).filter((row): row is NormalizedFact => row != null);
  const channel = (input.channel ?? []).map(adaptChannelDaily);
  return [...daily, ...channel];
}

import type { ChannelDailySource } from "../channels/adapters";
import { omitForbiddenClientFields } from "../client-view";
import { stripForAudience, type CostAudience } from "../channels/cost-strip";
import { chatgptAdsSpendUnit, type Env } from "../config";
import { chatgptAdsRequest, type ChatgptAdsCall, type FetchLike } from "../connectors/chatgpt-ads-client";

export const SPEND_LAG_HOURS = 8;
export const SPEND_REPLAY_DAYS = 2;
export const INSIGHTS_MAX_DAYS = 365;
export const INSIGHTS_MAX_ROWS = 2000;
export const DEFAULT_CLICK_DAYS = 30;
export const DEFAULT_VIEW_DAYS = 1;
export const MICROS_PER_DOLLAR = 1_000_000;

export const INSIGHT_GRANULARITIES = ["hourly", "daily", "monthly", "none"] as const;
export type InsightGranularity = (typeof INSIGHT_GRANULARITIES)[number];

export const INSIGHT_SEGMENTS = ["country", "device", "platform"] as const;
export type InsightSegment = (typeof INSIGHT_SEGMENTS)[number];

export type SpendUnit = "dollars" | "micros" | "unverified";

export type ChatgptReportRow = {
  channel: "chatgpt_ads";
  date: string;
  entityKey: string;
  entityName: string;
  currency: string | null;
  impressions: number | null;
  clicks: number | null;
  spend: number | null;
  conversions: number | null;
  leads: number | null;
  spendLagHours: number;
  spendUnit: SpendUnit;
  spendUnitNeedsVerification: boolean;
  attributionClickDays: number;
  attributionViewDays: number;
  breakdownCountry: string | null;
  breakdownDevice: string | null;
  breakdownPlatform: string | null;
  granularity: InsightGranularity;
  source: "api" | "csv";
  deliveryNote: string;
};

const DELIVERY_NOTE = "Delivery numbers can take about 8 hours to finish.";

export function microsToDollars(micros: number) {
  return micros / MICROS_PER_DOLLAR;
}

export function interpretSpend(raw: number, unit: SpendUnit) {
  if (!Number.isFinite(raw)) return { spend: null as number | null, spendUnit: unit, spendUnitNeedsVerification: unit === "unverified" };
  if (unit === "micros") return { spend: microsToDollars(raw), spendUnit: unit, spendUnitNeedsVerification: false };
  if (unit === "dollars") return { spend: raw, spendUnit: unit, spendUnitNeedsVerification: false };
  return { spend: raw, spendUnit: "unverified" as const, spendUnitNeedsVerification: true };
}

function isoDate(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Each sync overlaps the last two days so a late spend correction replaces the stored row. */
export function withSpendReplay(input: { since: string; until: string }) {
  const untilMs = Date.parse(`${input.until}T00:00:00Z`);
  const sinceMs = Date.parse(`${input.since}T00:00:00Z`);
  if (!Number.isFinite(untilMs) || !Number.isFinite(sinceMs)) throw new Error("Insight dates must be YYYY-MM-DD.");
  const replayMs = untilMs - SPEND_REPLAY_DAYS * 86_400_000;
  let start = Math.min(sinceMs, replayMs);
  const earliest = untilMs - (INSIGHTS_MAX_DAYS - 1) * 86_400_000;
  if (start < earliest) start = earliest;
  return { since: isoDate(start), until: isoDate(untilMs), replayDays: SPEND_REPLAY_DAYS, spendLagHours: SPEND_LAG_HOURS };
}

export function inclusiveDays(since: string, until: string) {
  const start = Date.parse(`${since}T00:00:00Z`);
  const end = Date.parse(`${until}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 86_400_000) + 1;
}

export function buildInsightQuery(input: {
  since: string;
  until: string;
  granularity?: InsightGranularity;
  segment?: InsightSegment | null;
  limit?: number;
  level?: "ad_account" | "campaign" | "ad_group" | "ad";
  clickDays?: number;
  viewDays?: number;
}) {
  const granularity = input.granularity ?? "daily";
  if (!(INSIGHT_GRANULARITIES as readonly string[]).includes(granularity)) {
    return { ok: false as const, message: "Insights time buckets are hour, day, or month." };
  }
  if (input.segment && !(INSIGHT_SEGMENTS as readonly string[]).includes(input.segment)) {
    return { ok: false as const, message: "Insights breakdowns are country, device, or platform." };
  }
  const requested = inclusiveDays(input.since, input.until);
  if (requested == null) return { ok: false as const, message: "Insight dates must be YYYY-MM-DD." };
  if (requested > INSIGHTS_MAX_DAYS) return { ok: false as const, message: "Insights cover at most 365 days." };
  const replay = withSpendReplay({ since: input.since, until: input.until });
  const days = inclusiveDays(replay.since, replay.until);
  if (days == null || days > INSIGHTS_MAX_DAYS) return { ok: false as const, message: "Insights cover at most 365 days." };
  const limit = input.limit ?? INSIGHTS_MAX_ROWS;
  if (!Number.isInteger(limit) || limit < 1 || limit > INSIGHTS_MAX_ROWS) {
    return { ok: false as const, message: "Insights return at most 2000 rows per page." };
  }
  const clickDays = input.clickDays ?? DEFAULT_CLICK_DAYS;
  const viewDays = input.viewDays ?? DEFAULT_VIEW_DAYS;
  if (![7, 14, 30].includes(clickDays) || (viewDays !== 0 && viewDays !== 1)) {
    return { ok: false as const, message: "Attribution is 7, 14, or 30 click days and a 0 or 1 day view." };
  }
  const range = JSON.stringify({ type: "date_range", since: replay.since, until: replay.until, timezone: "UTC" });
  const query: Record<string, string | string[] | number> = {
    time_granularity: granularity,
    aggregation_level: input.level ?? "campaign",
    attribution_window_days: clickDays,
    view_through_attribution_window_days: viewDays,
    "time_ranges[]": range,
    limit,
  };
  if (input.segment) query["segments[]"] = input.segment;
  return { ok: true as const, query, since: replay.since, until: replay.until, clickDays, viewDays, granularity };
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function num(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function blankRow(partial: Pick<ChatgptReportRow, "date" | "entityKey" | "entityName" | "spend" | "spendUnit" | "spendUnitNeedsVerification" | "source" | "granularity"> & Partial<ChatgptReportRow>): ChatgptReportRow {
  return {
    channel: "chatgpt_ads",
    currency: partial.currency ?? "USD",
    impressions: partial.impressions ?? null,
    clicks: partial.clicks ?? null,
    conversions: partial.conversions ?? null,
    leads: partial.leads ?? null,
    spendLagHours: SPEND_LAG_HOURS,
    attributionClickDays: partial.attributionClickDays ?? DEFAULT_CLICK_DAYS,
    attributionViewDays: partial.attributionViewDays ?? DEFAULT_VIEW_DAYS,
    breakdownCountry: partial.breakdownCountry ?? null,
    breakdownDevice: partial.breakdownDevice ?? null,
    breakdownPlatform: partial.breakdownPlatform ?? null,
    deliveryNote: DELIVERY_NOTE,
    ...partial,
  };
}

export function mapInsightRecord(value: unknown, options: { unit: SpendUnit; granularity?: InsightGranularity; currency?: string | null; clickDays?: number; viewDays?: number }): ChatgptReportRow | null {
  const row = asRecord(value);
  const readable = text(row.readable_time);
  const date = (readable || text(row.date)).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const hour = readable.length > 10 ? readable.slice(11, 13) : "";
  const entityId = text(row.ad_id) || text(row.ad_group_id) || text(row.campaign_id) || text(row.entity_id) || text(row.id);
  const entityName = text(row.ad_name) || text(row.ad_group_name) || text(row.campaign_name) || entityId || "ChatGPT Ads";
  const country = text(row.country) || null;
  const device = text(row.device) || null;
  const platform = text(row.platform) || null;
  const spendRaw = row.spend_micros != null ? num(row.spend_micros) : num(row.spend);
  const unit: SpendUnit = row.spend_micros != null ? "micros" : options.unit;
  const interpreted = spendRaw == null ? { spend: null, spendUnit: unit, spendUnitNeedsVerification: unit === "unverified" } : interpretSpend(spendRaw, unit);
  const breakdown = [country, device, platform, hour].filter(Boolean).join("|");
  return blankRow({
    date,
    entityKey: [entityId || "account", options.granularity ?? "daily", breakdown].filter(Boolean).join("|"),
    entityName,
    currency: options.currency ?? "USD",
    impressions: num(row.impressions),
    clicks: num(row.clicks),
    conversions: num(row.conversions),
    spend: interpreted.spend,
    spendUnit: interpreted.spendUnit,
    spendUnitNeedsVerification: interpreted.spendUnitNeedsVerification,
    granularity: options.granularity ?? "daily",
    source: "api",
    breakdownCountry: country,
    breakdownDevice: device,
    breakdownPlatform: platform,
    attributionClickDays: options.clickDays ?? DEFAULT_CLICK_DAYS,
    attributionViewDays: options.viewDays ?? DEFAULT_VIEW_DAYS,
  });
}

export function mapInsightPayload(payload: unknown, options: { unit: SpendUnit; granularity?: InsightGranularity; clickDays?: number; viewDays?: number }) {
  const record = asRecord(payload);
  const currency = text(record.account_currency) || null;
  const data = Array.isArray(record.data) ? record.data : [];
  return data.map((item) => mapInsightRecord(item, { ...options, currency: currency ?? "USD" })).filter((row): row is ChatgptReportRow => row != null);
}

export function mapConversionPayload(payload: unknown, options: { since: string; unit?: SpendUnit }) {
  const record = asRecord(payload);
  const currency = text(record.account_currency) || "USD";
  const data = Array.isArray(record.data) ? record.data : [];
  return data.map((item) => {
    const row = asRecord(item);
    return blankRow({
      date: options.since,
      entityKey: `${text(row.entity_id) || "account"}|conversions`,
      entityName: text(row.entity_id) || "ChatGPT Ads",
      currency,
      conversions: num(row.conversions),
      spend: null,
      spendUnit: options.unit ?? "unverified",
      spendUnitNeedsVerification: false,
      granularity: "none",
      source: "api",
    });
  });
}

export function toChannelDaily(row: ChatgptReportRow): ChannelDailySource {
  return {
    channel: "chatgpt_ads",
    date: row.date,
    entityKey: row.entityKey,
    entityName: row.entityName,
    currency: row.currency,
    impressions: row.impressions,
    clicks: row.clicks,
    spend: row.spend,
    conversions: row.conversions,
    leads: row.leads,
  };
}

/** Staff keep spend. Client and share payloads lose cost fields. */
export function presentChatgptAdsReport<T>(value: T, audience: CostAudience): T {
  const stripped = stripForAudience(value, audience);
  if (audience === "staff") return stripped;
  return omitForbiddenClientFields(stripped);
}

export async function loadChatgptAdsInsights(input: {
  apiKey: string;
  since: string;
  until: string;
  segment?: InsightSegment | null;
  granularity?: InsightGranularity;
  env?: Env;
  mode?: "mock" | "live";
  fetchImpl?: FetchLike;
  log?: ChatgptAdsCall["log"];
  level?: "ad_account" | "campaign" | "ad_group" | "ad";
  path?: string;
}) {
  const built = buildInsightQuery({
    since: input.since,
    until: input.until,
    granularity: input.granularity,
    segment: input.segment,
    level: input.level,
  });
  if (!built.ok) return built;
  const response = await chatgptAdsRequest({
    method: "GET",
    path: input.path ?? "/ad_account/insights",
    query: built.query,
    apiKey: input.apiKey,
    actor: "bot",
    env: input.env,
    mode: input.mode,
    fetchImpl: input.fetchImpl,
    log: input.log,
  });
  if (!response.ok) return { ok: false as const, message: response.message };
  const unit = chatgptAdsSpendUnit(input.env ?? process.env);
  const rows = mapInsightPayload(response.data, { unit, granularity: built.granularity, clickDays: built.clickDays, viewDays: built.viewDays });
  const conversions = await chatgptAdsRequest({
    method: "POST",
    path: "/conversions/insights",
    body: {
      aggregation_level: input.level === "ad" ? "ad" : input.level === "ad_group" ? "ad_group" : "campaign",
      time_ranges: [JSON.stringify({ type: "unix_range", start: String(Math.floor(Date.parse(`${built.since}T00:00:00Z`) / 1000)), end: String(Math.floor(Date.parse(`${built.until}T00:00:00Z`) / 1000) + 86400) })],
      attribution_window_days: built.clickDays,
      view_through_attribution_window_days: built.viewDays,
      group_by_entity: false,
    },
    apiKey: input.apiKey,
    actor: "bot",
    env: input.env,
    mode: input.mode,
    fetchImpl: input.fetchImpl,
    log: input.log,
  });
  const conversionRows = conversions.ok ? mapConversionPayload(conversions.data, { since: built.since, unit }) : [];
  return {
    ok: true as const,
    rows: [...rows, ...conversionRows],
    since: built.since,
    until: built.until,
    spendLagHours: SPEND_LAG_HOURS,
    spendUnitNeedsVerification: unit === "unverified",
    attribution: `${built.clickDays}-day click / ${built.viewDays}-day view`,
  };
}

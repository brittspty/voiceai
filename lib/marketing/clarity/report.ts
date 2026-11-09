import { createHash } from "node:crypto";

export const CLARITY_PULLS = [
  { breakdown: "url_source_campaign", numOfDays: 1 as const, dimensions: ["URL", "Source", "Campaign"] },
  { breakdown: "url", numOfDays: 1 as const, dimensions: ["URL"] },
] as const;

export type ClarityBreakdown = (typeof CLARITY_PULLS)[number]["breakdown"];

const METRIC_CANON: Record<string, string> = {
  traffic: "Traffic",
  engagementtime: "EngagementTime",
  scrolldepth: "ScrollDepth",
  popularpages: "PopularPages",
  deadclickcount: "DeadClickCount",
  rageclickcount: "RageClickCount",
  quickbackclick: "QuickbackClick",
  excessivescroll: "ExcessiveScroll",
  scripterrorcount: "ScriptErrorCount",
  errorclickcount: "ErrorClickCount",
};

const DIMENSION_FIELDS: Record<string, "url" | "source" | "medium" | "campaignName" | "channel" | "device" | "browser" | "os" | "country"> = {
  url: "url",
  source: "source",
  medium: "medium",
  campaign: "campaignName",
  channel: "channel",
  device: "device",
  browser: "browser",
  os: "os",
  country: "country",
  "country/region": "country",
};

export type ClarityRawValues = Record<string, string | number>;

export type ParsedClarityRow = {
  url: string;
  source: string;
  medium: string;
  campaignName: string;
  channel: string;
  device: string;
  browser: string;
  os: string;
  country: string;
  sessions: number;
  botSessions: number;
  users: number;
  pagesPerSession: number;
  engagementActive: number;
  engagementTotal: number;
  scrollDepth: number | null;
  popularPages: number;
  deadClicks: number;
  rageClicks: number;
  quickbacks: number;
  excessiveScroll: number;
  scriptErrors: number;
  errorClicks: number;
  deadClickRate: number | null;
  rageClickRate: number | null;
  quickbackRate: number | null;
  /** Original metric objects, keyed by the API metric name. */
  raw: Record<string, ClarityRawValues>;
};

export function clarityDimensionKey(row: Pick<ParsedClarityRow, "url" | "source" | "medium" | "campaignName" | "channel" | "device" | "browser" | "os" | "country">) {
  const raw = [row.url, row.source, row.medium, row.campaignName, row.channel, row.device, row.browser, row.os, row.country].join("\u001f");
  return createHash("sha256").update(raw).digest("hex").slice(0, 40);
}

function canonMetric(name: string) {
  const key = name.replace(/[\s_-]/g, "").toLowerCase();
  return METRIC_CANON[key] || name.trim();
}

function clip(value: string, max: number) {
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function rawValue(value: unknown): string | number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return value;
  return null;
}

function asNumber(value: string | number | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function countOf(value: string | number | undefined) {
  const parsed = asNumber(value);
  if (parsed === null || parsed < 0) return 0;
  return Math.round(parsed);
}

function amountOf(value: string | number | undefined) {
  const parsed = asNumber(value);
  if (parsed === null || parsed < 0) return 0;
  return parsed;
}

/** Percents at or below 1 are treated as fractions. Larger numbers are already percents. */
function percentOf(value: string | number | undefined) {
  const parsed = asNumber(value);
  if (parsed === null || parsed < 0) return null;
  if (parsed <= 1) return parsed * 100;
  return parsed;
}

function pick(raw: ClarityRawValues | undefined, names: string[]) {
  if (!raw) return undefined;
  const folded = new Map(Object.entries(raw).map(([key, value]) => [key.toLowerCase(), value]));
  for (const name of names) {
    const found = folded.get(name.toLowerCase());
    if (found !== undefined) return found;
  }
  return undefined;
}

function splitInfo(info: Record<string, unknown>) {
  const dimensions = {
    url: "",
    source: "",
    medium: "",
    campaignName: "",
    channel: "",
    device: "",
    browser: "",
    os: "",
    country: "",
  };
  const values: ClarityRawValues = {};
  for (const [key, value] of Object.entries(info)) {
    const stored = rawValue(value);
    if (stored === null) continue;
    const field = DIMENSION_FIELDS[key.trim().toLowerCase()];
    if (field) {
      const max = field === "url" ? 1000 : field === "campaignName" ? 500 : field === "device" || field === "browser" || field === "os" || field === "country" ? 100 : 200;
      dimensions[field] = clip(String(stored), max);
      continue;
    }
    values[key] = stored;
  }
  return { dimensions, values };
}

/**
 * Read one Data Export API body.
 * Each metric block is merged onto the same URL, source, medium, and campaign.
 * The raw object keeps the API's own keys and values.
 */
export function parseClarityExport(body: unknown): ParsedClarityRow[] {
  const blocks = Array.isArray(body) ? body : [];
  const grouped = new Map<string, ParsedClarityRow>();
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const record = block as { metricName?: unknown; information?: unknown };
    const metricName = typeof record.metricName === "string" ? canonMetric(record.metricName) : "";
    if (!metricName || !Array.isArray(record.information)) continue;
    for (const info of record.information) {
      if (!info || typeof info !== "object" || Array.isArray(info)) continue;
      const split = splitInfo(info as Record<string, unknown>);
      const key = clarityDimensionKey(split.dimensions);
      const current = grouped.get(key) ?? {
        ...split.dimensions,
        sessions: 0,
        botSessions: 0,
        users: 0,
        pagesPerSession: 0,
        engagementActive: 0,
        engagementTotal: 0,
        scrollDepth: null,
        popularPages: 0,
        deadClicks: 0,
        rageClicks: 0,
        quickbacks: 0,
        excessiveScroll: 0,
        scriptErrors: 0,
        errorClicks: 0,
        deadClickRate: null,
        rageClickRate: null,
        quickbackRate: null,
        raw: {},
      };
      current.raw[metricName] = split.values;
      grouped.set(key, current);
    }
  }
  const rows: ParsedClarityRow[] = [];
  for (const row of grouped.values()) {
    const traffic = row.raw.Traffic;
    const engagement = row.raw.EngagementTime;
    const scroll = row.raw.ScrollDepth;
    const popular = row.raw.PopularPages;
    row.sessions = countOf(pick(traffic, ["totalSessionCount", "sessionsCount"]));
    row.botSessions = countOf(pick(traffic, ["totalBotSessionCount"]));
    row.users = countOf(pick(traffic, ["distantUserCount"]));
    row.pagesPerSession = amountOf(pick(traffic, ["PagesPerSessionPercentage", "pagesPerSessionPercentage"]));
    row.engagementActive = amountOf(pick(engagement, ["activeTime"]));
    row.engagementTotal = amountOf(pick(engagement, ["totalTime"]));
    row.scrollDepth = percentOf(pick(scroll, ["averageScrollDepth", "scrollDepth"]));
    row.popularPages = countOf(pick(popular, ["visitsCount", "numOfVisits", "pageViews", "subTotal"]));
    const dead = frustration(row.raw.DeadClickCount);
    const rage = frustration(row.raw.RageClickCount);
    const quick = frustration(row.raw.QuickbackClick);
    const excessive = frustration(row.raw.ExcessiveScroll);
    const script = frustration(row.raw.ScriptErrorCount);
    const errorClick = frustration(row.raw.ErrorClickCount);
    row.deadClicks = dead.count;
    row.deadClickRate = dead.rate;
    row.rageClicks = rage.count;
    row.rageClickRate = rage.rate;
    row.quickbacks = quick.count;
    row.quickbackRate = quick.rate;
    row.excessiveScroll = excessive.count;
    row.scriptErrors = script.count;
    row.errorClicks = errorClick.count;
    rows.push(row);
  }
  return rows;
}

function frustration(raw: ClarityRawValues | undefined) {
  const count = countOf(pick(raw, ["subTotal", "sessionsCount"]));
  const rate = percentOf(pick(raw, ["sessionsWithMetricPercentage"]));
  return { count, rate };
}

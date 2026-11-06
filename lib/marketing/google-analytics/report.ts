import { createHash } from "node:crypto";

export const ANALYTICS_DIMENSIONS = [
  "date",
  "sessionCampaignName",
  "sessionCampaignId",
  "sessionSource",
  "sessionMedium",
  "landingPage",
] as const;

export const ANALYTICS_METRICS = ["sessions", "engagedSessions", "keyEvents"] as const;

export type ParsedAnalyticsRow = {
  date: string;
  sessionCampaignName: string;
  sessionCampaignId: string;
  sessionSource: string;
  sessionMedium: string;
  landingPage: string;
  sessions: number;
  engagedSessions: number;
  conversions: number;
};

export function analyticsDimensionKey(row: Pick<ParsedAnalyticsRow, "sessionCampaignName" | "sessionSource" | "sessionMedium" | "landingPage">) {
  const raw = [row.sessionCampaignName, row.sessionSource, row.sessionMedium, row.landingPage].join("\u001f");
  return createHash("sha256").update(raw).digest("hex").slice(0, 40);
}

function headerNames(headers: unknown) {
  if (!Array.isArray(headers)) return [];
  return headers.map((header) => {
    if (!header || typeof header !== "object") return "";
    const name = (header as { name?: unknown }).name;
    return typeof name === "string" ? name : "";
  });
}

function cell(values: unknown, index: number) {
  if (!Array.isArray(values) || index < 0) return "";
  const cellValue = values[index];
  if (!cellValue || typeof cellValue !== "object") return "";
  const value = (cellValue as { value?: unknown }).value;
  return typeof value === "string" ? value : "";
}

export function analyticsDate(raw: string) {
  const value = raw.trim();
  if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return "";
}

function count(raw: string) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function clip(value: string, max: number) {
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/**
 * Read one Data API runReport body.
 * keyEvents is the conversion count. A response that still says conversions is accepted.
 * The order of headers does not matter.
 */
export function parseRunReport(body: unknown): ParsedAnalyticsRow[] {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const dimensions = headerNames(record.dimensionHeaders);
  const metrics = headerNames(record.metricHeaders);
  const rows = Array.isArray(record.rows) ? record.rows : [];
  const parsed: ParsedAnalyticsRow[] = [];
  const dateIndex = dimensions.indexOf("date");
  const campaignIndex = dimensions.indexOf("sessionCampaignName");
  const campaignIdIndex = dimensions.indexOf("sessionCampaignId");
  const sourceIndex = dimensions.indexOf("sessionSource");
  const mediumIndex = dimensions.indexOf("sessionMedium");
  const landingIndex = dimensions.indexOf("landingPage") >= 0 ? dimensions.indexOf("landingPage") : dimensions.indexOf("landingPagePlusQueryString");
  const sessionsIndex = metrics.indexOf("sessions");
  const engagedIndex = metrics.indexOf("engagedSessions");
  const conversionsIndex = metrics.indexOf("keyEvents") >= 0 ? metrics.indexOf("keyEvents") : metrics.indexOf("conversions");
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const recordRow = row as { dimensionValues?: unknown; metricValues?: unknown };
    const date = analyticsDate(cell(recordRow.dimensionValues, dateIndex));
    if (!date) continue;
    parsed.push({
      date,
      sessionCampaignName: clip(cell(recordRow.dimensionValues, campaignIndex), 500),
      sessionCampaignId: clip(cell(recordRow.dimensionValues, campaignIdIndex), 64),
      sessionSource: clip(cell(recordRow.dimensionValues, sourceIndex), 200),
      sessionMedium: clip(cell(recordRow.dimensionValues, mediumIndex), 200),
      landingPage: clip(cell(recordRow.dimensionValues, landingIndex), 1000),
      sessions: Math.round(count(cell(recordRow.metricValues, sessionsIndex))),
      engagedSessions: Math.round(count(cell(recordRow.metricValues, engagedIndex))),
      conversions: count(cell(recordRow.metricValues, conversionsIndex)),
    });
  }
  return parsed;
}

export function emptyAnalyticsMarker(date: string): ParsedAnalyticsRow {
  return {
    date,
    sessionCampaignName: "",
    sessionCampaignId: "",
    sessionSource: "",
    sessionMedium: "",
    landingPage: "",
    sessions: 0,
    engagedSessions: 0,
    conversions: 0,
  };
}

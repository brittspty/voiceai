import { buildInsights, EXAMPLE_INSIGHT_OBSERVATIONS, INSIGHT_RANGE, type InsightCard, type InsightObservation } from "./learn";
import { omitForbiddenClientFields } from "../marketing/client-view";
import { stripForAudience } from "../marketing/channels/cost-strip";

export type SyncedMetric = {
  clientId: string;
  vertical: string;
  channel: string;
  creative: string;
  source: string;
  leads: number | null;
  qualified: number | null;
  date: string | null;
};

export type InsightView = {
  origin: "synced" | "example" | "unavailable";
  label: "Synced data" | "EXAMPLE DATA" | "Synced data unavailable";
  recommendationsOnly: true;
  note: string;
  items: InsightCard[];
};

const PLATFORM_LABEL: Record<string, string> = {
  meta: "Meta",
  google_ads: "Google Ads",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  stackadapt: "StackAdapt",
  ais2l: "AIS2L",
  google_business_profile: "Google Business Profile",
  landing_page: "Landing page",
  lead: "Lead",
};

const FORMAT_LABEL: Record<string, string> = {
  image: "Image",
  video: "Video",
  carousel: "Carousel",
  text: "Text",
  lead_form: "Lead form",
};

const AUDIENCE_LABEL: Record<string, string> = {
  custom_list: "Custom list",
  lookalike: "Lookalike",
  interest: "Interest",
  keyword: "Keyword",
  retargeting: "Retargeting",
  broad: "Broad",
  verified_human: "Verified human",
  targeting: "Targeting",
  breakdown: "Breakdown",
};

export function storedLabel(table: Record<string, string>, value: string | null | undefined) {
  const key = (value || "").trim();
  return table[key] || "";
}

export function finiteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

export function isoDay(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function formatIsoDay(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

function anonymousClients(ids: string[]) {
  const sorted = [...new Set(ids.map((id) => id.trim()).filter(Boolean))].sort();
  return new Map(sorted.map((id, index) => [id, `c${index + 1}`]));
}

function exampleView(): InsightView {
  return {
    origin: "example",
    label: "EXAMPLE DATA",
    recommendationsOnly: true,
    note: "No synced metrics are stored, so this is the labeled example set.",
    items: buildInsights(EXAMPLE_INSIGHT_OBSERVATIONS),
  };
}

/** Uses stored counts only. An empty sync falls back to the example set. A failed read does not. */
export function insightViewFromSynced(rows: SyncedMetric[]): InsightView {
  if (rows.length === 0) return exampleView();
  const counted = rows.filter((row) => row.leads != null);
  const keys = anonymousClients(rows.map((row) => row.clientId));
  const observations: InsightObservation[] = counted.map((row) => ({
    vertical: row.vertical.trim() || "Not labeled",
    source: row.source.trim(),
    creative: row.creative.trim(),
    channel: row.channel.trim(),
    qualified: row.qualified,
    leads: row.leads ?? 0,
    clientKey: keys.get(row.clientId.trim()) || "c1",
  }));
  const days = rows.map((row) => row.date).filter((day): day is string => Boolean(day)).sort();
  const range = days.length
    ? { start: formatIsoDay(days[0] || ""), end: formatIsoDay(days[days.length - 1] || "") }
    : { start: "", end: "" };
  const items = buildInsights(observations, range.start ? range : { start: "", end: "" }, 1);
  const leadSum = counted.reduce((sum, row) => sum + (row.leads ?? 0), 0);
  const note = counted.length === 0
    ? "Synced metrics are stored. None of them included a lead count, so no comparison is shown."
    : leadSum === 0
      ? "Synced metrics recorded 0 leads, so no comparison is shown."
      : "Counts are sums of stored metrics. Client names are not shown.";
  return {
    origin: "synced",
    label: "Synced data",
    recommendationsOnly: true,
    note,
    items,
  };
}

export function presentInsightView(view: InsightView) {
  return omitForbiddenClientFields(stripForAudience(view, "staff"));
}

export function dailyRowToSynced(row: {
  workspaceId: string;
  platform: string;
  platformLeads: unknown;
  date: Date | string | null;
  creativeFormat?: string | null;
  audienceType?: string | null;
  segmentKind?: string | null;
  vertical?: string | null;
  clientId?: string | null;
}): SyncedMetric {
  return {
    clientId: (row.clientId || "").trim() || row.workspaceId,
    vertical: (row.vertical || "").trim(),
    channel: storedLabel(PLATFORM_LABEL, row.platform),
    creative: storedLabel(FORMAT_LABEL, row.creativeFormat),
    source: storedLabel(AUDIENCE_LABEL, row.audienceType) || storedLabel(AUDIENCE_LABEL, row.segmentKind),
    leads: finiteNumber(row.platformLeads),
    qualified: null,
    date: isoDay(row.date),
  };
}

export function channelRowToSynced(row: {
  workspaceId: string;
  channel: string;
  clientKey?: string | null;
  leads: unknown;
  qualifiedLeads: unknown;
  date: Date | string | null;
}): SyncedMetric {
  return {
    clientId: (row.clientKey || "").trim() || row.workspaceId,
    vertical: "",
    channel: storedLabel(PLATFORM_LABEL, row.channel),
    creative: "",
    source: "",
    leads: finiteNumber(row.leads),
    qualified: finiteNumber(row.qualifiedLeads),
    date: isoDay(row.date),
  };
}

export function exampleInsightRange() {
  return INSIGHT_RANGE;
}

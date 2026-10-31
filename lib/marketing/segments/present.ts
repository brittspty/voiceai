import type { ListRecommendation } from "./recommend";

export type AudienceMode = "staff" | "client";
export type BoardSort = "conversion" | "quality" | "revenue";

const CLIENT_FORBIDDEN = /\b(cpl|cpa|spend|cost|roas|budget)\b|\/day/i;

export const LOW_MATCH_RATE = 0.3;
export const HOLD_LABEL = "On hold: low match rate";

export type PlatformMatch = { platform: string; rate: number };

export const STAFF_COLUMNS = ["rank", "segment", "audienceSource", "conversionRate", "leadQuality", "revenue", "vendor", "matchRate", "cpl", "cpa", "confidence", "sample", "recommendation"] as const;
export const CLIENT_COLUMNS = ["rank", "segment", "audienceSource", "conversionRate", "leadQuality", "revenue", "confidence", "sample", "recommendation"] as const;

export type BoardRowInput = {
  key: string;
  name: string;
  parent: string;
  audienceSource: "maid_market";
  vendor: string;
  listId: string;
  subSegmentKey: string;
  matchRates: PlatformMatch[];
  people: number;
  successes: number;
  trials: number;
  days: number;
  quality: number;
  qualityProvisional: boolean;
  revenue: number | null;
  spend: number | null;
  recommendation: ListRecommendation;
  required: number;
};

export type BoardRow = {
  key: string;
  rank: number | null;
  name: string;
  parent: string;
  audienceSource: "maid_market";
  audienceSourceLabel: string;
  vendor?: string;
  listId: string;
  matchRates?: PlatformMatch[];
  matchRateLabel?: string;
  holdLabel?: string;
  conversionRate: string;
  conversionRateValue: number;
  leadQuality: string;
  leadQualityValue: number | null;
  revenue: string;
  confidence: string;
  confidenceBars: number;
  sample: string;
  sampleRatio: number;
  chip: ListRecommendation["chip"];
  reason: string;
  basedOn: string;
  cpl?: string;
  cpa?: string;
};

export function formatRate(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatMoney(value: number) {
  if (value >= 1000) {
    const thousands = value / 1000;
    const text = thousands >= 10 ? thousands.toFixed(0) : thousands.toFixed(1).replace(/\.0$/, "");
    return `$${text}k`;
  }
  return `$${Math.round(value)}`;
}

export function confidenceBars(probability: number, chip: ListRecommendation["chip"]) {
  if (chip === "STILL LEARNING" || chip === "NO CLEAR WINNER") return 1;
  if (probability >= 0.95) return 5;
  if (probability >= 0.8) return 4;
  if (probability >= 0.6) return 3;
  if (probability >= 0.4) return 2;
  return 1;
}

export function confidenceText(probability: number, chip: ListRecommendation["chip"]) {
  if (chip === "STILL LEARNING") return "Still learning";
  if (chip === "NO CLEAR WINNER") return "No clear winner";
  const pct = `${Math.round(probability * 100)}%`;
  if (probability >= 0.95) return `High ${pct}`;
  if (probability >= 0.8) return `Medium ${pct}`;
  return `Low ${pct}`;
}

export function presentBoard(input: {
  rows: BoardRowInput[];
  mode: AudienceMode;
  sort: BoardSort;
  ghlClosedDealSync: boolean;
  example: boolean;
  audienceSource?: string;
}): { headline: string; rows: BoardRow[]; example: boolean; mode: AudienceMode; sort: BoardSort; columns: readonly string[]; filters: { id: string; label: string }[] } {
  const maidOnly = input.rows.filter((row) => row.audienceSource === "maid_market");
  const selected = !input.audienceSource || input.audienceSource === "maid_market" ? maidOnly : [];
  const ranked = rankRows(selected, input.sort);
  const rows = ranked.map((row, index) => toRow(row, input, index));
  const vendors = [...new Set(selected.map((row) => row.vendor).filter(Boolean))];
  const visible = input.mode === "client" ? rows.map((row) => hideFromClient(row, vendors)) : rows;
  const scale = visible.filter((row) => row.chip === "SCALE").length;
  const cut = visible.filter((row) => row.chip === "CUT").length;
  const headline = input.mode === "client"
    ? clientHeadline(visible)
    : `${scale} ${scale === 1 ? "list is" : "lists are"} ready to scale. ${cut} should be cut.`;
  const model = {
    headline,
    rows: visible,
    example: input.example,
    mode: input.mode,
    sort: input.sort,
    columns: input.mode === "client" ? CLIENT_COLUMNS : STAFF_COLUMNS,
    filters: [{ id: "maid_market", label: "MAID market" }],
  };
  if (input.mode === "client") assertClientSafe(model);
  return model;
}

function rankRows(rows: BoardRowInput[], sort: BoardSort) {
  const learning = (row: BoardRowInput) => row.recommendation.chip === "STILL LEARNING" || row.recommendation.chip === "NO CLEAR WINNER";
  const ready = rows.filter((row) => !learning(row));
  const waiting = rows.filter(learning);
  ready.sort((a, b) => compareRows(a, b, sort));
  return [...ready, ...waiting];
}

function compareRows(a: BoardRowInput, b: BoardRowInput, sort: BoardSort) {
  const rate = (row: BoardRowInput) => (row.trials ? row.successes / row.trials : 0);
  const revenue = (row: BoardRowInput) => row.revenue ?? -1;
  if (sort === "quality") return b.quality - a.quality || rate(b) - rate(a) || revenue(b) - revenue(a);
  if (sort === "revenue") return revenue(b) - revenue(a) || rate(b) - rate(a) || b.quality - a.quality;
  return rate(b) - rate(a) || b.quality - a.quality || revenue(b) - revenue(a);
}

function toRow(row: BoardRowInput, input: { mode: AudienceMode; ghlClosedDealSync: boolean }, index: number): BoardRow {
  const rate = row.trials ? row.successes / row.trials : 0;
  const learning = row.recommendation.chip === "STILL LEARNING" || row.recommendation.chip === "NO CLEAR WINNER";
  const presented: BoardRow = {
    key: row.key,
    rank: learning ? null : index + 1,
    name: row.name,
    parent: row.parent,
    audienceSource: "maid_market" as const,
    audienceSourceLabel: "MAID market",
    vendor: input.mode === "staff" ? row.vendor : undefined,
    listId: row.listId,
    matchRates: input.mode === "staff" ? row.matchRates : undefined,
    matchRateLabel: input.mode === "staff" ? formatMatchRates(row.matchRates) : undefined,
    holdLabel: input.mode === "staff" && isLowMatch(row.matchRates) ? HOLD_LABEL : undefined,
    conversionRate: formatRate(rate),
    conversionRateValue: rate,
    leadQuality: row.qualityProvisional ? "Provisional" : `${Math.round(row.quality)}`,
    leadQualityValue: row.qualityProvisional ? null : row.quality,
    revenue: input.ghlClosedDealSync && row.revenue != null ? formatMoney(row.revenue) : "Not connected",
    confidence: confidenceText(row.recommendation.probability, row.recommendation.chip),
    confidenceBars: confidenceBars(row.recommendation.probability, row.recommendation.chip),
    sample: `${row.successes} of ${row.required} verified-human conversions`,
    sampleRatio: Math.max(0, Math.min(1, row.successes / Math.max(1, row.required))),
    chip: row.recommendation.chip,
    reason: input.mode === "client" ? row.recommendation.clientReason : row.recommendation.reason,
    basedOn: basedOn(row),
  };
  if (input.mode === "staff") {
    const leads = Math.max(1, Math.round(row.trials * rate));
    presented.cpl = row.spend != null ? formatMoney(row.spend / leads) : "—";
    presented.cpa = row.spend != null && row.successes > 0 ? formatMoney(row.spend / row.successes) : "—";
  }
  return presented;
}

export function isLowMatch(rates: PlatformMatch[]) {
  return rates.some((row) => row.rate < LOW_MATCH_RATE);
}

export function formatMatchRates(rates: PlatformMatch[]) {
  return rates.map((row) => `${platformLabel(row.platform)} ${Math.round(row.rate * 100)}%`).join(" · ");
}

function platformLabel(platform: string) {
  if (platform === "meta") return "Meta";
  if (platform === "google_ads") return "Google Ads";
  if (platform === "stackadapt") return "StackAdapt";
  return platform;
}

function basedOn(row: BoardRowInput) {
  return `Based on: MAID list ${row.listId} from ${row.vendor}. Verified-human conversions only. Platform reports are not conversion truth.`;
}

function clientHeadline(rows: BoardRow[]) {
  const best = rows.find((row) => row.rank === 1);
  if (!best) return "No list has enough verified conversions to rank yet.";
  return `${best.name} is the leading list so far.`;
}

function hideFromClient(row: BoardRow, vendors: string[]): BoardRow {
  const hide = (value: string) => vendors.reduce((next, vendor) => (vendor ? next.split(vendor).join("your list") : next), value);
  const next: BoardRow = {
    ...row,
    parent: hide(row.parent),
    name: hide(row.name),
    reason: hide(row.reason),
    basedOn: "Based on: verified-human conversions on this list.",
  };
  delete next.vendor;
  delete next.matchRates;
  delete next.matchRateLabel;
  delete next.holdLabel;
  delete next.cpl;
  delete next.cpa;
  return next;
}

export function testResultHeadline(input: { staff: boolean; ready: boolean; vendor: string; listId: string }) {
  if (!input.ready) return "Still learning. No winner yet.";
  if (!input.staff) return "This list is ahead.";
  return `${input.vendor} list ${input.listId} is ahead.`;
}

export function lineageNote(input: { staff: boolean; listId: string; vendor: string }) {
  if (!input.staff) return "Based on: verified-human conversions on this list.";
  return `Based on: MAID list ${input.listId} from ${input.vendor}. Verified-human conversions only.`;
}

export function segmentAudience(access: { kind: string; seesCost: boolean }): AudienceMode {
  if (access.kind === "client_viewer" || access.kind === "client_owner" || !access.seesCost) return "client";
  return "staff";
}

export function assertClientSafe(value: unknown) {
  const text = JSON.stringify(value);
  if (CLIENT_FORBIDDEN.test(text)) throw new Error("Client payload contains a cost term.");
}

export const TOOLTIPS = {
  conversionRate: "Share of people in this group who became a verified conversion. Higher is better.",
  leadQuality: "Score from CRM outcome, contact checks, fit, and the first 7 days. Higher is better. Provisional until the CRM marks the lead.",
  revenue: "Closed sales your CRM linked to these people. Only won deals count. Higher is better.",
  confidence: "How sure this result is real and not luck. High means 95% or more, and the two-proportion check passed. Higher is better.",
  sample: "Verified-human conversions so far. The floor is 100 verified-human conversions per list, and the test must run 7 days. More is better.",
  cpl: "Amount per lead. Staff only. Lower is better.",
  cpa: "Amount per verified conversion. Staff only. Lower is better.",
} as const;

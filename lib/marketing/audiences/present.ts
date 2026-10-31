import type { MaidImport } from "./import";
import type { PerformanceRow } from "./compare";
import { PLATFORM_LABELS, type AudiencePlatform } from "./payloads";
import { AUDIENCE_SOURCE_LABELS, type AudienceSource, type SegmentTag } from "../segment-taxonomy";

const COST_KEYS = new Set(["cost", "costamount", "costcurrency", "spend", "cpl", "cpa", "budget", "bid"]);
const CLIENT_KEYS = new Set([...COST_KEYS, "vendor", "matchrate", "matchratelabel", "uploaded", "matched"]);

export type AudienceReader = "staff" | "client";

export function percent(value: number | null) {
  if (value === null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export function money(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export type PresentedPlatform = {
  platform: AudiencePlatform;
  label: string;
  uploaded: number;
  matched: number;
  matchRate: number | null;
  matchRateLabel: string;
  reach: number;
  dataQuality: "ok" | "flagged" | "unknown";
  holdVerdict: boolean;
  spend?: number;
  cpl?: number | null;
  cpa?: number | null;
};

export type PresentedAudience = {
  id: string;
  name: string;
  source: AudienceSource;
  sourceLabel: string;
  dataLabel: string;
  gppString: string;
  vendor: string;
  listId: string;
  consentBasis: string;
  refreshCadence: string;
  acquisitionDate: string | null;
  size: number;
  freshness: "fresh" | "stale" | "unknown";
  freshnessLabel: string;
  tags: SegmentTag[];
  platforms: PresentedPlatform[];
  verifiedConversions: number;
  verifiedLeads: number;
  leadQuality: number | null;
  leadQualityLabel: string;
  qualityScore: number | null;
  holdVerdict: boolean;
  confidence: string;
  pixelVisitors: number;
  pushStatus: { id: string; platform: AudiencePlatform; label: string; statusLabel: string; undoUntil: string | null }[];
  cost?: string | null;
};

export type PresentedRow = {
  key: string;
  label: string;
  vendor: string;
  listId: string;
  scope: PerformanceRow["scope"];
  uploaded: number;
  matched: number;
  matchRateLabel: string;
  reach: number;
  verifiedConversions: number;
  verifiedConversionRateLabel: string;
  leadQualityLabel: string;
  qualityScore: number | null;
  dataQuality: PerformanceRow["dataQuality"];
  holdVerdict: boolean;
  confidence: string;
  recommendation: string | null;
  spend?: number;
  cpl?: number | null;
  cpa?: number | null;
};

function hiddenKey(key: string, reader: AudienceReader, seesCost: boolean) {
  const token = key.toLowerCase();
  if (reader === "client" && CLIENT_KEYS.has(token)) return true;
  if (!seesCost && COST_KEYS.has(token)) return true;
  return false;
}

function strip<T extends object>(value: T, reader: AudienceReader, seesCost: boolean): T {
  const copy = { ...value } as Record<string, unknown>;
  for (const key of Object.keys(copy)) {
    if (hiddenKey(key, reader, seesCost)) delete copy[key];
  }
  return copy as T;
}

export function scrubClientText(text: string | null, vendors: string[]) {
  if (!text) return text;
  let next = text.replace(/Match rate is under 30%[^.]+\./g, "Not enough to rank this list yet.");
  for (const vendor of vendors) {
    if (vendor) next = next.split(vendor).join("a vendor");
  }
  return next.replace(/List \S+ from a vendor/g, "A list");
}

export function scrubClientTree(value: unknown, vendors: string[]): unknown {
  if (Array.isArray(value)) return value.map((item) => scrubClientTree(item, vendors));
  if (value && typeof value === "object") {
    const copy: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (CLIENT_KEYS.has(key.toLowerCase())) continue;
      copy[key] = scrubClientTree(child, vendors);
    }
    return copy;
  }
  if (typeof value === "string") return scrubClientText(value, vendors);
  return value;
}

export function presentPlatform(input: {
  platform: AudiencePlatform;
  uploaded: number;
  matched: number;
  reach: number;
  spend: number;
  dataQuality: PresentedPlatform["dataQuality"];
  holdVerdict: boolean;
  matchRate: number | null;
}, seesCost: boolean, reader: AudienceReader = "staff"): PresentedPlatform {
  const row: PresentedPlatform = {
    platform: input.platform,
    label: PLATFORM_LABELS[input.platform],
    uploaded: input.uploaded,
    matched: input.matched,
    matchRate: input.matchRate,
    matchRateLabel: percent(input.matchRate),
    reach: input.reach,
    dataQuality: input.dataQuality,
    holdVerdict: input.holdVerdict,
    ...(seesCost ? { spend: input.spend, cpl: input.spend && input.uploaded ? null : null } : {}),
  };
  if (seesCost) {
    row.spend = input.spend;
    row.cpl = null;
    row.cpa = null;
  }
  return strip(row, reader, seesCost);
}

export function presentPerformance(row: PerformanceRow, seesCost: boolean, reader: AudienceReader = "staff", vendors: string[] = []): PresentedRow {
  const presented: PresentedRow = {
    key: row.key,
    label: row.label,
    vendor: row.vendor,
    listId: row.listId,
    scope: row.scope,
    uploaded: row.uploaded,
    matched: row.matched,
    matchRateLabel: percent(row.matchRate),
    reach: row.reach,
    verifiedConversions: row.verifiedConversions,
    verifiedConversionRateLabel: percent(row.verifiedConversionRate),
    leadQualityLabel: percent(row.leadQuality),
    qualityScore: row.qualityScore,
    dataQuality: row.dataQuality,
    holdVerdict: row.holdVerdict,
    confidence: reader === "client" ? scrubClientText(row.confidence.reason, vendors) || "" : row.confidence.reason,
    recommendation: reader === "client" ? scrubClientText(row.recommendation, vendors) : row.recommendation,
  };
  if (seesCost) {
    presented.spend = row.spend;
    presented.cpl = row.cpl;
    presented.cpa = row.cpa;
  }
  return strip(presented, reader, seesCost);
}

export function presentAudienceCard(input: {
  id: string;
  name: string;
  source: AudienceSource;
  vendor: string;
  dataLabel: string;
  gppString: string;
  listId: string;
  consentBasis: string;
  refreshCadence: string;
  acquisitionDate: string | null;
  size: number;
  freshness: PresentedAudience["freshness"];
  freshnessLabel: string;
  tags: SegmentTag[];
  platforms: PresentedPlatform[];
  verifiedConversions: number;
  verifiedLeads: number;
  leadQuality: number | null;
  qualityScore: number | null;
  holdVerdict: boolean;
  confidence: string;
  cost: string | null;
  pixelVisitors: number;
  pushStatus: PresentedAudience["pushStatus"];
}, seesCost: boolean, reader: AudienceReader = "staff"): PresentedAudience {
  const card: PresentedAudience = {
    id: input.id,
    name: input.name,
    source: input.source,
    sourceLabel: AUDIENCE_SOURCE_LABELS[input.source],
    dataLabel: input.dataLabel,
    gppString: input.gppString,
    vendor: input.vendor,
    listId: input.listId,
    consentBasis: input.consentBasis,
    refreshCadence: input.refreshCadence,
    acquisitionDate: input.acquisitionDate,
    size: input.size,
    freshness: input.freshness,
    freshnessLabel: input.freshnessLabel,
    tags: input.tags,
    platforms: input.platforms.map((platform) => strip(platform, reader, seesCost)),
    pushStatus: input.pushStatus,
    verifiedConversions: input.verifiedConversions,
    verifiedLeads: input.verifiedLeads,
    leadQuality: input.leadQuality,
    leadQualityLabel: percent(input.leadQuality),
    qualityScore: input.qualityScore,
    holdVerdict: input.holdVerdict,
    confidence: reader === "client" ? scrubClientText(input.confidence, [input.vendor]) || "" : input.confidence,
    pixelVisitors: input.pixelVisitors,
  };
  if (seesCost && reader === "staff") card.cost = input.cost;
  return strip(card, reader, seesCost);
}

export function clientLeakKeys(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) clientLeakKeys(item, keys);
    return keys;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (CLIENT_KEYS.has(key.toLowerCase())) keys.push(key);
      clientLeakKeys(child, keys);
    }
  }
  return keys;
}

export function costKeys(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) costKeys(item, keys);
    return keys;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (COST_KEYS.has(key.toLowerCase())) keys.push(key);
      costKeys(child, keys);
    }
  }
  return keys;
}

export function lineageForStorage(imported: MaidImport, seesCost: boolean) {
  return { ...imported.lineage, cost: seesCost ? imported.lineage.cost : null };
}

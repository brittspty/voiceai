import {
  isMaidComparisonSource,
  segmentConfidenceEngine,
  type AudienceSource,
  type SegmentConfidence,
  type SegmentTag,
} from "../segment-taxonomy";
import type { AudiencePlatform } from "./payloads";

export type PlatformPerformance = {
  platform: AudiencePlatform;
  uploaded: number;
  matched: number;
  reach: number;
  spend: number;
};

export type ComparableAudience = {
  id: string;
  name: string;
  source: AudienceSource;
  vendor: string;
  listId: string;
  tags: SegmentTag[];
  platforms: PlatformPerformance[];
  verifiedConversions: number;
  verifiedLeads: number;
  qualifiedLeads: number;
};

export type PerformanceRow = {
  key: string;
  label: string;
  vendor: string;
  listId: string;
  scope: "list" | "vendor" | "subsegment";
  scopeLabel: string;
  uploaded: number;
  matched: number;
  matchRate: number | null;
  reach: number;
  verifiedConversions: number;
  verifiedLeads: number;
  qualifiedLeads: number;
  verifiedConversionRate: number | null;
  leadQuality: number | null;
  spend: number;
  cpl: number | null;
  cpa: number | null;
  qualityScore: number | null;
  dataQuality: "ok" | "flagged" | "unknown";
  holdVerdict: boolean;
  confidence: SegmentConfidence;
  recommendation: string | null;
};

function rate(numerator: number, denominator: number) {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

function sumPlatforms(rows: ComparableAudience[]) {
  const uploaded = rows.reduce((sum, row) => sum + row.platforms.reduce((inner, platform) => inner + platform.uploaded, 0), 0);
  const matched = rows.reduce((sum, row) => sum + row.platforms.reduce((inner, platform) => inner + platform.matched, 0), 0);
  const reach = rows.reduce((sum, row) => sum + row.platforms.reduce((inner, platform) => inner + platform.reach, 0), 0);
  const spend = rows.reduce((sum, row) => sum + row.platforms.reduce((inner, platform) => inner + platform.spend, 0), 0);
  const anyLow = rows.some((row) => row.platforms.some((platform) => platform.uploaded > 0 && platform.matched / platform.uploaded < 0.3));
  return { uploaded, matched, reach, spend, anyLow };
}

function buildRow(input: {
  key: string;
  label: string;
  vendor: string;
  listId: string;
  scope: PerformanceRow["scope"];
  scopeLabel: string;
  audiences: ComparableAudience[];
}): PerformanceRow {
  const totals = sumPlatforms(input.audiences);
  const verifiedConversions = input.audiences.reduce((sum, row) => sum + row.verifiedConversions, 0);
  const verifiedLeads = input.audiences.reduce((sum, row) => sum + row.verifiedLeads, 0);
  const qualifiedLeads = input.audiences.reduce((sum, row) => sum + row.qualifiedLeads, 0);
  const matchRate = rate(totals.matched, totals.uploaded);
  const dataQuality = matchRate === null ? "unknown" : matchRate < 0.3 || totals.anyLow ? "flagged" : "ok";
  const heldRate = matchRate !== null && (matchRate < 0.3 || totals.anyLow) ? matchRate < 0.3 ? matchRate : 0 : matchRate;
  const confidence = segmentConfidenceEngine.evaluate({
    sampleSize: totals.reach || totals.matched,
    verifiedConversions,
    matchRate: dataQuality === "flagged" && matchRate !== null && matchRate >= 0.3 ? 0 : heldRate,
  });
  const holdVerdict = confidence.holdVerdict || dataQuality === "flagged";
  const verifiedConversionRate = rate(verifiedConversions, totals.reach || totals.matched);
  const leadQuality = rate(qualifiedLeads, verifiedConversions);
  const qualityScore = holdVerdict || verifiedConversionRate === null || matchRate === null
    ? null
    : Math.round(((matchRate * 0.4) + (verifiedConversionRate * 0.4) + ((leadQuality ?? 0) * 0.2)) * 100);
  const recommendation = holdVerdict
    ? null
    : `List ${input.listId} from ${input.vendor} leads ${input.scopeLabel} on verified conversion rate.`;
  return {
    key: input.key,
    label: input.label,
    vendor: input.vendor,
    listId: input.listId,
    scope: input.scope,
    scopeLabel: input.scopeLabel,
    uploaded: totals.uploaded,
    matched: totals.matched,
    matchRate,
    reach: totals.reach,
    verifiedConversions,
    verifiedLeads,
    qualifiedLeads,
    verifiedConversionRate,
    leadQuality,
    spend: totals.spend,
    cpl: rate(totals.spend, verifiedLeads),
    cpa: rate(totals.spend, verifiedConversions),
    qualityScore,
    dataQuality,
    holdVerdict,
    confidence: holdVerdict ? { ...confidence, holdVerdict: true, level: confidence.level === "high" || confidence.level === "medium" ? "held" : confidence.level } : confidence,
    recommendation,
  };
}

function bestChild(rows: ComparableAudience[]) {
  return [...rows].sort((a, b) => b.verifiedConversions - a.verifiedConversions || a.listId.localeCompare(b.listId))[0];
}

function rank(rows: PerformanceRow[]) {
  return [...rows].sort((a, b) => {
    if (a.holdVerdict !== b.holdVerdict) return a.holdVerdict ? 1 : -1;
    const rateDelta = (b.verifiedConversionRate ?? -1) - (a.verifiedConversionRate ?? -1);
    if (rateDelta) return rateDelta;
    const qualityDelta = (b.leadQuality ?? -1) - (a.leadQuality ?? -1);
    if (qualityDelta) return qualityDelta;
    return b.verifiedConversions - a.verifiedConversions;
  });
}

export function compareMaidAudiences(audiences: ComparableAudience[]) {
  const maid = audiences.filter((row) => isMaidComparisonSource(row.source));
  const lists = rank(maid.map((row) => buildRow({
    key: row.id,
    label: row.name,
    vendor: row.vendor,
    listId: row.listId,
    scope: "list",
    scopeLabel: "MAID lists",
    audiences: [row],
  })));
  const byVendor = new Map<string, ComparableAudience[]>();
  for (const row of maid) {
    const bucket = byVendor.get(row.vendor) ?? [];
    bucket.push(row);
    byVendor.set(row.vendor, bucket);
  }
  const vendors = rank([...byVendor.entries()].map(([vendor, rows]) => {
    const best = bestChild(rows);
    return buildRow({
      key: vendor,
      label: vendor,
      vendor,
      listId: best?.listId || "",
      scope: "vendor",
      scopeLabel: `vendor ${vendor}`,
      audiences: rows,
    });
  }));
  const byTag = new Map<string, { tag: SegmentTag; rows: ComparableAudience[] }>();
  for (const row of maid) {
    for (const tag of row.tags) {
      const key = `${tag.dimension}:${tag.key}`;
      const current = byTag.get(key) ?? { tag, rows: [] };
      current.rows.push(row);
      byTag.set(key, current);
    }
  }
  const subsegments = rank([...byTag.values()].map(({ tag, rows }) => {
    const best = bestChild(rows);
    return buildRow({
      key: `${tag.dimension}:${tag.key}`,
      label: tag.label,
      vendor: best?.vendor || "",
      listId: best?.listId || "",
      scope: "subsegment",
      scopeLabel: `${tag.dimension} ${tag.label}`,
      audiences: rows,
    });
  }));
  return { lists, vendors, subsegments };
}

export function platformMatch(uploaded: number, matched: number) {
  if (uploaded <= 0) return { matchRate: null as number | null, dataQuality: "unknown" as const, holdVerdict: true };
  const matchRate = matched / uploaded;
  const flagged = matchRate < 0.3;
  return { matchRate, dataQuality: flagged ? "flagged" as const : "ok" as const, holdVerdict: flagged };
}

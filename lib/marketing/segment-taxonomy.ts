/**
 * Shared segment taxonomy for the data layer / segment engine and the audience library.
 * Audience source is the top level. Intent, geo, demographics, and behavior sit beneath it.
 * platform_native is a legacy import value. Specificity does not run platform-native targeting.
 */

export const AUDIENCE_SOURCES = ["data_market_maid", "pixel_retargeting", "crm_first_party", "platform_native"] as const;

export type AudienceSource = (typeof AUDIENCE_SOURCES)[number];

export const DEFAULT_AUDIENCE_SOURCE: AudienceSource = "data_market_maid";

export const LEGACY_AUDIENCE_SOURCE: AudienceSource = "platform_native";

export const SEGMENT_DIMENSIONS = ["intent", "geo", "demographics", "behavior"] as const;

export type SegmentDimension = (typeof SEGMENT_DIMENSIONS)[number];

export const AUDIENCE_SOURCE_LABELS: Record<AudienceSource, string> = {
  data_market_maid: "Data-market MAID audience",
  pixel_retargeting: "Pixel retargeting pool",
  crm_first_party: "CRM / first-party",
  platform_native: "Platform-native (legacy import)",
};

export type SegmentTag = {
  dimension: SegmentDimension;
  key: string;
  label: string;
};

/** Lineage the segment engine and the audience library both read. */
export interface SegmentNode {
  source: AudienceSource;
  vendor: string;
  listId: string;
  tags: SegmentTag[];
}

export type SegmentConfidenceLevel = "high" | "medium" | "low" | "held";

export type SegmentConfidenceInput = {
  sampleSize: number;
  verifiedConversions: number;
  matchRate: number | null;
};

export type SegmentConfidence = {
  level: SegmentConfidenceLevel;
  holdVerdict: boolean;
  reason: string;
};

/** Match rate below this flags data quality and holds a performance verdict. */
export const MATCH_RATE_HOLD = 0.3;

export interface SegmentConfidenceEngine {
  evaluate(input: SegmentConfidenceInput): SegmentConfidence;
}

export function isAudienceSource(value: string): value is AudienceSource {
  return (AUDIENCE_SOURCES as readonly string[]).includes(value);
}

export function isSegmentDimension(value: string): value is SegmentDimension {
  return (SEGMENT_DIMENSIONS as readonly string[]).includes(value);
}

/** MAID lists are what we compare. Platform-native is not a test arm. */
export function isMaidComparisonSource(source: AudienceSource) {
  return source === "data_market_maid";
}

/**
 * Confidence rules shared with the segment engine.
 * A match rate under 30% holds the verdict. A missing match report holds it too.
 * Smaller verified samples lower confidence and still allow a list-vs-list read
 * once the match rate is in and healthy.
 */
export function evaluateSegmentConfidence(input: SegmentConfidenceInput): SegmentConfidence {
  if (input.matchRate === null) {
    return {
      level: "held",
      holdVerdict: true,
      reason: "No match report yet. The performance verdict is held.",
    };
  }
  if (input.matchRate < MATCH_RATE_HOLD) {
    return {
      level: "held",
      holdVerdict: true,
      reason: "Match rate is under 30%. Data quality is flagged and the performance verdict is held.",
    };
  }
  if (input.verifiedConversions < 5 || input.sampleSize < 30) {
    return {
      level: "low",
      holdVerdict: false,
      reason: "Match rate is healthy. The verified sample is still small.",
    };
  }
  if (input.verifiedConversions < 20) {
    return {
      level: "medium",
      holdVerdict: false,
      reason: "Enough verified conversions for a medium-confidence comparison.",
    };
  }
  return {
    level: "high",
    holdVerdict: false,
    reason: "Enough verified conversions for a high-confidence comparison.",
  };
}

export const segmentConfidenceEngine: SegmentConfidenceEngine = {
  evaluate: evaluateSegmentConfidence,
};

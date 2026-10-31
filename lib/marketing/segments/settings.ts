import { DRILL_LEVELS, type DrillLevel } from "../audience-source";

export type QualityWeights = {
  crmOutcome: number;
  contactValidity: number;
  icpFit: number;
  engagement: number;
};

/** Data Strategist v1. The design spec's 30-lead, 90%, 1.5x, and 0.5x rules are not used. */
export const SEGMENT_ENGINE_V1 = {
  probabilityToBeatBest: 0.95,
  twoProportionAlpha: 0.05,
  relativeLift: 0.2,
  minConversionsPerArm: 100,
  minDays: 7,
  maxDays: 28,
  cutProbability: 0.05,
  qualityDrop: 0.2,
  qualityWeights: { crmOutcome: 0.4, contactValidity: 0.25, icpFit: 0.2, engagement: 0.15 } as QualityWeights,
  drillLevels: [...DRILL_LEVELS] as DrillLevel[],
};

export type SegmentSettings = typeof SEGMENT_ENGINE_V1;

export type SegmentOverride = {
  probabilityToBeatBest?: number;
  twoProportionAlpha?: number;
  relativeLift?: number;
  minConversionsPerArm?: number;
  minDays?: number;
  maxDays?: number;
  cutProbability?: number;
  qualityDrop?: number;
  qualityWeights?: Partial<QualityWeights>;
  drillLevels?: DrillLevel[];
};

function finite(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Client override beats workspace override beats the v1 defaults. */
export function resolveSegmentSettings(workspace?: SegmentOverride | null, client?: SegmentOverride | null): SegmentSettings {
  const merged: SegmentOverride = { ...workspace, ...client };
  if (client?.qualityWeights || workspace?.qualityWeights) {
    merged.qualityWeights = { ...workspace?.qualityWeights, ...client?.qualityWeights };
  }
  const weights = normalizeWeights({ ...SEGMENT_ENGINE_V1.qualityWeights, ...merged.qualityWeights });
  return {
    probabilityToBeatBest: finite(merged.probabilityToBeatBest, SEGMENT_ENGINE_V1.probabilityToBeatBest),
    twoProportionAlpha: finite(merged.twoProportionAlpha, SEGMENT_ENGINE_V1.twoProportionAlpha),
    relativeLift: finite(merged.relativeLift, SEGMENT_ENGINE_V1.relativeLift),
    minConversionsPerArm: Math.max(1, Math.round(finite(merged.minConversionsPerArm, SEGMENT_ENGINE_V1.minConversionsPerArm))),
    minDays: Math.max(1, Math.round(finite(merged.minDays, SEGMENT_ENGINE_V1.minDays))),
    maxDays: Math.max(1, Math.round(finite(merged.maxDays, SEGMENT_ENGINE_V1.maxDays))),
    cutProbability: finite(merged.cutProbability, SEGMENT_ENGINE_V1.cutProbability),
    qualityDrop: finite(merged.qualityDrop, SEGMENT_ENGINE_V1.qualityDrop),
    qualityWeights: weights,
    drillLevels: merged.drillLevels?.length ? [...merged.drillLevels] : [...SEGMENT_ENGINE_V1.drillLevels],
  };
}

function normalizeWeights(weights: QualityWeights): QualityWeights {
  const sum = weights.crmOutcome + weights.contactValidity + weights.icpFit + weights.engagement;
  if (!(sum > 0)) return { ...SEGMENT_ENGINE_V1.qualityWeights };
  return {
    crmOutcome: weights.crmOutcome / sum,
    contactValidity: weights.contactValidity / sum,
    icpFit: weights.icpFit / sum,
    engagement: weights.engagement / sum,
  };
}

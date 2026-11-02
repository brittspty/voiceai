import { SEGMENT_ENGINE_V1 } from "../segments/settings";

/** Locked Data Strategist v1 values. Overrides on the segment engine do not change these. */
export const AUDIENCE_P1_THRESHOLDS = Object.freeze({
  probabilityToBeatBest: SEGMENT_ENGINE_V1.probabilityToBeatBest,
  twoProportionAlpha: SEGMENT_ENGINE_V1.twoProportionAlpha,
  minConversionsPerArm: SEGMENT_ENGINE_V1.minConversionsPerArm,
  minDays: SEGMENT_ENGINE_V1.minDays,
  maxDays: SEGMENT_ENGINE_V1.maxDays,
  lowMatchRate: 0.3,
  cutAfterMinimumSample: true as const,
  campaignWrite: false as const,
  adAccountWrite: false as const,
});

export type ThresholdRow = { id: string; label: string; value: string };

export function thresholdRows(): ThresholdRow[] {
  const rules = AUDIENCE_P1_THRESHOLDS;
  return [
    { id: "probability", label: "Probability to beat the best", value: "95%" },
    { id: "p-value", label: "Two-proportion p-value", value: "under 0.05" },
    { id: "conversions", label: "Verified-human conversions per arm", value: String(rules.minConversionsPerArm) },
    { id: "days", label: "Minimum days", value: String(rules.minDays) },
    { id: "window", label: "No clear winner after day", value: String(rules.maxDays) },
    { id: "match", label: "Platform match rate hold", value: "under 30%" },
    { id: "cut", label: "Cut", value: "only after the minimum sample" },
    { id: "writes", label: "Campaign amount changes", value: "not approved" },
  ];
}

export function presentThresholds() {
  return {
    exampleData: false as const,
    locked: true as const,
    title: "Data Strategist v1",
    note: "Locked Data Strategist v1 values. This screen cannot change them.",
    rows: thresholdRows(),
    rules: AUDIENCE_P1_THRESHOLDS,
  };
}

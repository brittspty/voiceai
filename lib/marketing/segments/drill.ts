import { DRILL_ATTRIBUTES, isTargetableAudienceSource, isAudienceSource, type DrillLevel } from "../audience-source";
import { crossClientLearningAllowed } from "../provenance";
import type { SegmentSettings } from "./settings";
import { requiredConversions, twoProportionPValue, probabilityToBeatBest } from "./stats";

export type DrillBucket = {
  key: string;
  attribute: string;
  value: string;
  successes: number;
  trials: number;
  days: number;
  quality: number;
  audienceSource?: string;
};

export type DrillParent = {
  key: string;
  successes: number;
  trials: number;
  days: number;
  quality: number;
  people: number;
};

/**
 * One attribute per level, in taxonomy order.
 * Split only a winner, and only when every targetable child can still reach the minimum sample.
 * Surface only children that beat the parent with confidence and meet that sample.
 */
export function nextDrill(input: {
  parent: DrillParent;
  parentWon: boolean;
  level: DrillLevel;
  buckets: DrillBucket[];
  settings: SegmentSettings;
  baselineRate: number | null;
  consent: boolean;
  contributingClients: number;
  crossClient: boolean;
}) {
  if (input.crossClient && !crossClientLearningAllowed(input.consent, input.contributingClients)) {
    return { split: false as const, reason: "Cross-client patterns are off.", surfaced: [] as SurfacedChild[] };
  }
  if (!input.parentWon) {
    return { split: false as const, reason: "Only a winning group is split.", surfaced: [] as SurfacedChild[] };
  }
  const required = requiredConversions(input.baselineRate, input.settings);
  const attributes = DRILL_ATTRIBUTES[input.level];
  for (const attribute of attributes) {
    const children = input.buckets.filter((bucket) => {
      if (bucket.attribute !== attribute) return false;
      if (input.level === "audience_source" && isAudienceSource(bucket.value) && !isTargetableAudienceSource(bucket.value)) return false;
      return true;
    });
    if (children.length < 2) continue;
    const share = Math.floor(input.parent.successes / children.length);
    if (share < required) continue;
    const surfaced = children
      .map((child) => surfaceChild(input.parent, child, input.settings, required))
      .filter((child): child is SurfacedChild => child !== null);
    return {
      split: true as const,
      level: input.level,
      attribute,
      reason: `Split on ${attribute}. New sub-segments start as a test.`,
      surfaced,
      withheld: children.length - surfaced.length,
    };
  }
  return { split: false as const, reason: "No attribute leaves every child able to reach the minimum sample.", surfaced: [] as SurfacedChild[] };
}

export type SurfacedChild = {
  key: string;
  attribute: string;
  value: string;
  lift: number;
  probability: number;
  pValue: number | null;
  action: "test";
  reason: string;
};

function surfaceChild(parent: DrillParent, child: DrillBucket, settings: SegmentSettings, required: number): SurfacedChild | null {
  if (child.successes < required || child.days < settings.minDays) return null;
  const parentRate = parent.trials ? parent.successes / parent.trials : 0;
  const childRate = child.trials ? child.successes / child.trials : 0;
  if (!(childRate > parentRate)) return null;
  const probabilities = probabilityToBeatBest(
    [
      { key: "child", successes: child.successes, trials: child.trials },
      { key: "parent", successes: parent.successes, trials: parent.trials },
    ],
    2,
  );
  const pValue = twoProportionPValue(child.successes, child.trials, parent.successes, parent.trials);
  if ((probabilities.child ?? 0) < settings.probabilityToBeatBest) return null;
  if (pValue == null || pValue >= settings.twoProportionAlpha) return null;
  const lift = parentRate > 0 ? childRate / parentRate : 0;
  return {
    key: child.key,
    attribute: child.attribute,
    value: child.value,
    lift,
    probability: probabilities.child ?? 0,
    pValue,
    action: "test",
    reason: `${child.value} converts about ${lift.toFixed(1)} times the parent group, with ${child.successes} verified conversions. This is a likely reason from that sample, not proof.`,
  };
}

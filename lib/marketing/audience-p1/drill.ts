import { forReader, type P1Reader } from "../p1-reader";
import { AUDIENCE_P1_THRESHOLDS } from "./thresholds";

export const DRILL_DIMENSIONS = ["geo", "demographics", "intent", "behavior", "source"] as const;
export type DrillDimension = (typeof DRILL_DIMENSIONS)[number];

const TITLES: Record<DrillDimension, string> = {
  geo: "Geo",
  demographics: "Demographics",
  intent: "Intent",
  behavior: "Behavior",
  source: "Source",
};

type RawSlice = {
  id: string;
  name: string;
  lift: number;
  successes: number;
  trials: number;
  reason: string;
};

const SLICES: Record<DrillDimension, RawSlice[]> = {
  geo: [
    { id: "metro-a", name: "Example metro A", lift: 1.6, successes: 140, trials: 800, reason: "This place books more often than the parent group." },
    { id: "region-b", name: "Example region B", lift: 0.6, successes: 40, trials: 500, reason: "This place books less often than the parent group." },
  ],
  demographics: [
    { id: "band-a", name: "Example age band A", lift: 1.4, successes: 120, trials: 700, reason: "This age band books more often than the parent group." },
    { id: "band-b", name: "Example age band B", lift: 0.7, successes: 110, trials: 900, reason: "This age band books less often than the parent group." },
  ],
  intent: [
    { id: "intent-a", name: "Example in-market A", lift: 1.8, successes: 160, trials: 600, reason: "People with this intent book more often than the parent group." },
    { id: "intent-b", name: "Example recency B", lift: 0.9, successes: 80, trials: 700, reason: "This recency group is close to the parent and still learning." },
  ],
  behavior: [
    { id: "behavior-a", name: "Example site behavior A", lift: 1.3, successes: 130, trials: 750, reason: "This behavior books more often than the parent group." },
    { id: "behavior-b", name: "Example email behavior B", lift: 0.5, successes: 36, trials: 400, reason: "This behavior books less often than the parent group." },
  ],
  source: [
    { id: "source-a", name: "Example market list", lift: 1.5, successes: 150, trials: 800, reason: "This source books more often than the parent group." },
    { id: "source-b", name: "Example pixel pool", lift: 0.8, successes: 100, trials: 900, reason: "This source books less often than the parent group." },
  ],
};

export function isDrillDimension(value: string): value is DrillDimension {
  return (DRILL_DIMENSIONS as readonly string[]).includes(value);
}

function chipFor(slice: RawSlice): "SCALE" | "CUT" | "TEST MORE" | "STILL LEARNING" {
  if (slice.successes < AUDIENCE_P1_THRESHOLDS.minConversionsPerArm) return "STILL LEARNING";
  if (slice.lift >= 1.2) return "SCALE";
  if (slice.lift <= 0.8) return "CUT";
  return "TEST MORE";
}

function confidenceFor(slice: RawSlice) {
  const chip = chipFor(slice);
  if (chip === "STILL LEARNING") return { confidence: "Low 40%", confidenceBars: 1 };
  if (chip === "SCALE") return { confidence: "High 96%", confidenceBars: 5 };
  if (chip === "CUT") return { confidence: "Medium 72%", confidenceBars: 3 };
  return { confidence: "Medium 70%", confidenceBars: 3 };
}

export function presentDrill(reader: P1Reader, dimension: DrillDimension = "geo") {
  const basedOn = reader === "staff"
    ? "Based on: EXAMPLE DATA. Example Vendor list ex-100. Verified-human conversions versus the parent group."
    : "Based on: EXAMPLE DATA. Verified-human conversions versus the parent group.";
  const rows = SLICES[dimension].map((slice) => {
    const chip = chipFor(slice);
    const confidence = confidenceFor(slice);
    return {
      id: slice.id,
      name: slice.name,
      lift: slice.lift,
      liftLabel: `${slice.lift.toFixed(1)}× the parent`,
      sampleLabel: `${slice.successes} of ${AUDIENCE_P1_THRESHOLDS.minConversionsPerArm} verified-human conversions`,
      sampleRatio: Math.max(0, Math.min(1, slice.successes / AUDIENCE_P1_THRESHOLDS.minConversionsPerArm)),
      ...confidence,
      chip,
      whyLabel: slice.lift >= 1 ? "Why it converts" : "Why it lags",
      why: slice.reason,
      basedOn,
    };
  });
  return forReader(
    {
      exampleData: true as const,
      banner: "EXAMPLE DATA",
      dimension,
      title: TITLES[dimension],
      dimensions: DRILL_DIMENSIONS.map((id) => ({ id, title: TITLES[id], href: `/audience-data/drill?dimension=${id}`, selected: id === dimension })),
      parentLabel: "Parent group",
      rows,
      overlapNote: "Groups can overlap, so a person can sit in more than one group. Shares can add up to more than the parent.",
    },
    reader,
  );
}

import { createHash } from "node:crypto";
import type { MarketingAccess } from "./access";

export const Z90 = 1.6448536269514722;
export const HOLDOUT_UNDO_MS = 30_000;

export type HoldoutKind = "geo" | "time" | "audience";
export type HoldoutMetric = "leads" | "bookings" | "conversions";
export type CellRole = "treatment" | "holdout";
export type LiftVerdict = "too_early" | "clearly_helping" | "maybe_helping" | "no_clear_effect" | "invalidated";
export type LiftMethod = "diff_in_diff" | "synthetic_control" | "holdout_comparison";

export type HoldoutDesignInput = {
  name?: string;
  question: string;
  kind: HoldoutKind;
  metric: HoldoutMetric;
  holdoutPercent?: number;
  units: string[];
  holdoutUnits?: string[];
  startDate: string;
  endDate: string;
  preStartDate?: string;
  minSample?: number;
};

export type HoldoutDesign = {
  name: string;
  question: string;
  kind: HoldoutKind;
  metric: HoldoutMetric;
  holdoutPercent: number;
  units: string[];
  holdoutUnits: string[];
  startDate: string;
  endDate: string;
  preStartDate: string | null;
  minSample: number;
};

export type Assignment = { unitKey: string; role: CellRole };

export type LiftObservationInput = {
  unitKey: string;
  period: "pre" | "post";
  outcome: number;
  spend?: number;
  impressions?: number;
};

export type LiftMath = {
  ready: boolean;
  verdict: LiftVerdict;
  method: LiftMethod | null;
  extra: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  confidence: number | null;
  extraLeadCost: number | null;
  sentence: string;
  treatmentOutcome: number;
  holdoutOutcome: number;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function hashBucket(testKey: string, unit: string) {
  const hex = createHash("sha256").update(`${testKey}\0${unit}`).digest("hex");
  return parseInt(hex.slice(0, 8), 16) % 100;
}

function cleanUnits(units: string[]) {
  return [...new Set(units.map((unit) => unit.trim()).filter(Boolean))];
}

export function buildHoldoutDesign(input: HoldoutDesignInput): { ok: true; design: HoldoutDesign } | { ok: false; error: string } {
  const question = input.question.trim();
  if (!question) return { ok: false, error: "Say what you want to know." };
  if (!DAY.test(input.startDate) || !DAY.test(input.endDate)) return { ok: false, error: "Use a start date and an end date." };
  if (input.endDate <= input.startDate) return { ok: false, error: "End date must be after the start date." };
  if (input.preStartDate && (!DAY.test(input.preStartDate) || input.preStartDate >= input.startDate)) {
    return { ok: false, error: "The earlier comparison period has to start before the test." };
  }
  const percent = input.holdoutPercent ?? 10;
  if (!Number.isInteger(percent) || percent < 1 || percent > 50) return { ok: false, error: "Holdout must be between 1% and 50%." };
  const units = cleanUnits(input.units);
  if (units.length < 2) return { ok: false, error: input.kind === "time" ? "Add at least two dates." : "Add at least two areas." };
  const holdoutUnits = cleanUnits(input.holdoutUnits ?? []).filter((unit) => units.includes(unit));
  const minSample = input.minSample ?? 30;
  if (!Number.isInteger(minSample) || minSample < 1) return { ok: false, error: "Set a minimum number of leads before a result is shown." };
  const kinds: HoldoutKind[] = ["geo", "time", "audience"];
  const metrics: HoldoutMetric[] = ["leads", "bookings", "conversions"];
  if (!kinds.includes(input.kind) || !metrics.includes(input.metric)) return { ok: false, error: "Choose a test type and what you will count." };
  return {
    ok: true,
    design: {
      name: (input.name || question).trim().slice(0, 140),
      question,
      kind: input.kind,
      metric: input.metric,
      holdoutPercent: percent,
      units,
      holdoutUnits,
      startDate: input.startDate,
      endDate: input.endDate,
      preStartDate: input.preStartDate || null,
      minSample,
    },
  };
}

export function assignHoldoutUnits(input: {
  testKey: string;
  units: string[];
  holdoutPercent: number;
  kind: HoldoutKind;
  holdoutUnits?: string[];
}): Assignment[] {
  const units = cleanUnits(input.units);
  if (units.length < 2) throw new Error("Add at least two areas.");
  if (!Number.isInteger(input.holdoutPercent) || input.holdoutPercent < 1 || input.holdoutPercent > 50) {
    throw new Error("Holdout must be between 1% and 50%.");
  }
  const explicit = cleanUnits(input.holdoutUnits ?? []).filter((unit) => units.includes(unit));
  if (explicit.length) {
    const hold = new Set(explicit);
    return balance(units.map((unitKey) => ({ unitKey, role: hold.has(unitKey) ? "holdout" as const : "treatment" as const, bucket: hashBucket(input.testKey, unitKey) })));
  }
  if (input.kind === "time") {
    const sorted = [...units].sort();
    const holdCount = Math.min(sorted.length - 1, Math.max(1, Math.round((sorted.length * input.holdoutPercent) / 100)));
    const hold = new Set(sorted.slice(0, holdCount));
    return sorted.map((unitKey) => ({ unitKey, role: hold.has(unitKey) ? "holdout" : "treatment" }));
  }
  return balance(units.map((unitKey) => {
    const bucket = hashBucket(input.testKey, unitKey);
    return { unitKey, role: bucket < input.holdoutPercent ? "holdout" as const : "treatment" as const, bucket };
  }));
}

function balance(rows: { unitKey: string; role: CellRole; bucket: number }[]): Assignment[] {
  const hold = rows.filter((row) => row.role === "holdout");
  const treat = rows.filter((row) => row.role === "treatment");
  if (hold.length && treat.length) return rows.map(({ unitKey, role }) => ({ unitKey, role }));
  const sorted = [...rows].sort((a, b) => a.bucket - b.bucket || a.unitKey.localeCompare(b.unitKey));
  const moved = hold.length === 0 ? sorted[0] : sorted[sorted.length - 1];
  return rows.map((row) => ({
    unitKey: row.unitKey,
    role: row.unitKey === moved.unitKey ? (row.role === "holdout" ? "treatment" : "holdout") : row.role,
  }));
}

type UnitPeriod = { outcome: number; spend: number; impressions: number };

function periodStats(map: Map<string, UnitPeriod>) {
  const values = [...map.values()].map((row) => row.outcome);
  const n = values.length;
  const total = values.reduce((sum, value) => sum + value, 0);
  const mean = n ? total / n : 0;
  let se = 0;
  if (n >= 2) {
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1);
    se = Math.max(Math.sqrt(variance / n), Math.sqrt(Math.max(total, 0)) / n);
  } else if (n === 1) {
    se = Math.sqrt(Math.max(total, 0)) / n;
  }
  const spend = [...map.values()].reduce((sum, row) => sum + row.spend, 0);
  return { n, total, mean, se, spend };
}

function tooEarly(treatmentOutcome = 0, holdoutOutcome = 0): LiftMath {
  return {
    ready: false,
    verdict: "too_early",
    method: null,
    extra: null,
    rangeLow: null,
    rangeHigh: null,
    confidence: null,
    extraLeadCost: null,
    sentence: "Too early to tell",
    treatmentOutcome,
    holdoutOutcome,
  };
}

function metricNoun(metric: HoldoutMetric) {
  if (metric === "bookings") return "bookings";
  if (metric === "conversions") return "conversions";
  return "leads";
}

function resultSentence(metric: HoldoutMetric, extra: number, low: number, high: number) {
  const noun = metricNoun(metric);
  const point = Math.round(extra);
  const start = Math.round(low);
  const end = Math.round(high);
  if (point > 0) {
    return `These ads brought in about ${point} extra ${noun} (range ${start}–${end}) that wouldn't have come otherwise. We're fairly sure (90%).`;
  }
  return `These ads did not show a clear gain in ${noun} (range ${start}–${end}). We're fairly sure (90%).`;
}

function verdictFor(extra: number, low: number): LiftVerdict {
  if (low > 0) return "clearly_helping";
  if (extra > 0) return "maybe_helping";
  return "no_clear_effect";
}

export function computeLift(input: {
  metric: HoldoutMetric;
  minSample: number;
  assignments: Assignment[];
  observations: LiftObservationInput[];
}): LiftMath {
  const role = new Map(input.assignments.map((row) => [row.unitKey, row.role]));
  const cells: Record<CellRole, Record<"pre" | "post", Map<string, UnitPeriod>>> = {
    treatment: { pre: new Map(), post: new Map() },
    holdout: { pre: new Map(), post: new Map() },
  };
  for (const observation of input.observations) {
    const which = role.get(observation.unitKey);
    if (!which) continue;
    const bucket = cells[which][observation.period];
    const prev = bucket.get(observation.unitKey) ?? { outcome: 0, spend: 0, impressions: 0 };
    prev.outcome += observation.outcome;
    prev.spend += observation.spend ?? 0;
    prev.impressions += observation.impressions ?? 0;
    bucket.set(observation.unitKey, prev);
  }
  for (const row of cells.holdout.post.values()) {
    if (row.impressions > 0) {
      return {
        ready: false,
        verdict: "invalidated",
        method: null,
        extra: null,
        rangeLow: null,
        rangeHigh: null,
        confidence: null,
        extraLeadCost: null,
        sentence: "Test paused: the holdout group started seeing ads.",
        treatmentOutcome: periodStats(cells.treatment.post).total,
        holdoutOutcome: periodStats(cells.holdout.post).total,
      };
    }
  }
  const treated = periodStats(cells.treatment.post);
  const held = periodStats(cells.holdout.post);
  const sample = treated.total + held.total;
  if (treated.n === 0 || held.n === 0 || sample < input.minSample) return tooEarly(treated.total, held.total);

  const treatedPre = periodStats(cells.treatment.pre);
  const heldPre = periodStats(cells.holdout.pre);
  let method: LiftMethod = "holdout_comparison";
  let extra = (treated.mean - held.mean) * treated.n;
  let se = treated.n * Math.sqrt(treated.se ** 2 + held.se ** 2);

  const synthetic = syntheticControl(cells);
  if (synthetic) {
    method = "synthetic_control";
    extra = synthetic.extra;
    se = synthetic.se;
  } else if (treatedPre.n > 0 && heldPre.n > 0) {
    method = "diff_in_diff";
    const perUnit = (treated.mean - treatedPre.mean) - (held.mean - heldPre.mean);
    extra = perUnit * treated.n;
    const sePer = Math.sqrt(treated.se ** 2 + treatedPre.se ** 2 + held.se ** 2 + heldPre.se ** 2);
    se = sePer * treated.n;
  }
  if (!Number.isFinite(extra) || !Number.isFinite(se) || se < 0) return tooEarly(treated.total, held.total);
  const low = extra - Z90 * se;
  const high = extra + Z90 * se;
  const spend = treated.spend;
  const extraLeadCost = extra > 0 && spend > 0 ? spend / extra : null;
  return {
    ready: true,
    verdict: verdictFor(extra, low),
    method,
    extra,
    rangeLow: low,
    rangeHigh: high,
    confidence: 0.9,
    extraLeadCost,
    sentence: resultSentence(input.metric, extra, low, high),
    treatmentOutcome: treated.total,
    holdoutOutcome: held.total,
  };
}

function syntheticControl(cells: Record<CellRole, Record<"pre" | "post", Map<string, UnitPeriod>>>) {
  if (cells.treatment.post.size !== 1 || cells.holdout.post.size < 2) return null;
  if (cells.treatment.pre.size !== 1 || cells.holdout.pre.size < 2) return null;
  const treatUnit = [...cells.treatment.post.keys()][0];
  const treatPre = cells.treatment.pre.get(treatUnit)?.outcome;
  const treatPost = cells.treatment.post.get(treatUnit)?.outcome;
  if (treatPre === undefined || treatPost === undefined) return null;
  const donors = [...cells.holdout.post.keys()].filter((key) => cells.holdout.pre.has(key));
  if (donors.length < 2) return null;
  const distances = donors.map((key) => Math.abs((cells.holdout.pre.get(key)?.outcome ?? 0) - treatPre));
  const exact = distances.some((distance) => distance === 0);
  const raw = distances.map((distance) => (exact ? (distance === 0 ? 1 : 0) : 1 / distance));
  const weightTotal = raw.reduce((sum, weight) => sum + weight, 0);
  if (!weightTotal) return null;
  const synth = donors.reduce((sum, key, index) => sum + (raw[index] / weightTotal) * (cells.holdout.post.get(key)?.outcome ?? 0), 0);
  const donorPosts = donors.map((key) => cells.holdout.post.get(key)?.outcome ?? 0);
  const mean = donorPosts.reduce((sum, value) => sum + value, 0) / donorPosts.length;
  const variance = donorPosts.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (donorPosts.length - 1);
  const se = Math.max(Math.sqrt(Math.max(variance, 0)), Math.sqrt(Math.max(treatPost, 0)));
  return { extra: treatPost - synth, se };
}

export type LiftView = {
  ready: boolean;
  verdict: LiftVerdict;
  verdictLabel: string;
  method: LiftMethod | null;
  sentence: string;
  extraLeads: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  confidence: number | null;
  extraLeadCost?: number;
  staffCostLine?: string;
};

const VERDICT_LABEL: Record<LiftVerdict, string> = {
  too_early: "Too early to tell",
  clearly_helping: "Clearly helping",
  maybe_helping: "Maybe helping",
  no_clear_effect: "No clear effect",
  invalidated: "Test paused",
};

export function viewStoredLift(
  row: {
    ready: boolean;
    verdict: LiftVerdict;
    method: string;
    sentence: string;
    extraLeads: number | null;
    rangeLow: number | null;
    rangeHigh: number | null;
    confidence: number | null;
    extraLeadCost: number | null;
  },
  seesCost: boolean,
): LiftView {
  return presentLift(
    {
      ready: row.ready,
      verdict: row.verdict,
      method: row.method === "diff_in_diff" || row.method === "synthetic_control" || row.method === "holdout_comparison" ? row.method : null,
      extra: row.extraLeads,
      rangeLow: row.rangeLow,
      rangeHigh: row.rangeHigh,
      confidence: row.confidence,
      extraLeadCost: row.extraLeadCost,
      sentence: row.sentence,
      treatmentOutcome: 0,
      holdoutOutcome: 0,
    },
    seesCost,
  );
}

export function presentLift(result: LiftMath, seesCost: boolean): LiftView {
  const view: LiftView = {
    ready: result.ready,
    verdict: result.verdict,
    verdictLabel: VERDICT_LABEL[result.verdict],
    method: result.method,
    sentence: result.sentence,
    extraLeads: result.ready ? result.extra : null,
    rangeLow: result.ready ? result.rangeLow : null,
    rangeHigh: result.ready ? result.rangeHigh : null,
    confidence: result.ready ? result.confidence : null,
  };
  if (seesCost && result.ready && result.extraLeadCost !== null && result.extraLeadCost > 0) {
    view.extraLeadCost = result.extraLeadCost;
    view.staffCostLine = `Extra lead cost $${Math.round(result.extraLeadCost)}`;
  }
  return view;
}

export function canStartHoldout(access: Pick<MarketingAccess, "kind">) {
  return access.kind === "super_admin";
}

export function canDesignHoldout(access: Pick<MarketingAccess, "kind">) {
  return access.kind === "super_admin" || access.kind === "account_manager";
}

export function canUndoHoldoutStart(status: string, startedAt: Date | null, now = new Date()) {
  if (status !== "running" || !startedAt) return false;
  return now.getTime() - startedAt.getTime() < HOLDOUT_UNDO_MS;
}

export function holdoutProgress(startDate: string, endDate: string, now = new Date()) {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  const total = Math.max(1, Math.round((end - start) / 86_400_000));
  const day = Math.min(total, Math.max(0, Math.floor((now.getTime() - start) / 86_400_000) + 1));
  return { day, total, label: `Day ${day} of ${total}` };
}

export const HOLDOUT_QUESTION = "Are these ads bringing in leads we wouldn't get anyway?";

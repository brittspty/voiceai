import type { SegmentSettings } from "./settings";

const Z_ALPHA = 1.959963984540054;
const Z_BETA = 0.841621233572914;

/** Trials per arm for a two-proportion test at 80% power. Null when the rates are not usable. */
export function trialsPerArm(baselineRate: number, relativeLift: number) {
  const p1 = baselineRate;
  const p2 = baselineRate * (1 + relativeLift);
  if (!(p1 > 0 && p1 < 1 && p2 > 0 && p2 < 1 && p2 !== p1)) return null;
  const z = Z_ALPHA + Z_BETA;
  const n = (z * z * (p1 * (1 - p1) + p2 * (1 - p2))) / (p2 - p1) ** 2;
  return Math.ceil(n);
}

/** Conversions required per arm. Never below the floor (100 in v1). */
export function requiredConversions(baselineRate: number | null, settings: Pick<SegmentSettings, "relativeLift" | "minConversionsPerArm">) {
  const floor = settings.minConversionsPerArm;
  if (baselineRate == null || !(baselineRate > 0 && baselineRate < 1)) return floor;
  const trials = trialsPerArm(baselineRate, settings.relativeLift);
  if (trials == null) return floor;
  const rate = Math.min(0.99, Math.max(baselineRate, baselineRate * (1 + settings.relativeLift)));
  return Math.max(floor, Math.ceil(trials * rate));
}

function erf(x: number) {
  const sign = Math.sign(x);
  const a = Math.abs(x);
  const p = 0.3275911;
  const t = 1 / (1 + p * a);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-a * a);
  return sign * y;
}

function normalCdf(z: number) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** Two-sided p-value for a difference in proportions. */
export function twoProportionPValue(successA: number, trialsA: number, successB: number, trialsB: number) {
  if (trialsA <= 0 || trialsB <= 0) return null;
  const p1 = successA / trialsA;
  const p2 = successB / trialsB;
  const pooled = (successA + successB) / (trialsA + trialsB);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / trialsA + 1 / trialsB));
  if (!(se > 0)) return p1 === p2 ? 1 : 0;
  const z = Math.abs(p1 - p2) / se;
  return Math.max(0, Math.min(1, 2 * (1 - normalCdf(z))));
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rng: () => number) {
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function gamma(rng: () => number, shape: number): number {
  if (shape < 1) return gamma(rng, shape + 1) * rng() ** (1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (let i = 0; i < 10_000; i += 1) {
    let x = 0;
    let v = 0;
    do {
      x = normal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
  return d;
}

function beta(rng: () => number, alpha: number, betaShape: number) {
  const x = gamma(rng, alpha);
  const y = gamma(rng, betaShape);
  return x / (x + y);
}

export type RateArm = { key: string; successes: number; trials: number };

/** Beta-binomial probability each arm is strictly best. Uniform prior. */
export function probabilityToBeatBest(arms: RateArm[], seed = 1, draws = 4000) {
  const rng = mulberry32(seed);
  const wins = new Map(arms.map((arm) => [arm.key, 0]));
  for (let draw = 0; draw < draws; draw += 1) {
    let bestKey = "";
    let best = -1;
    let tie = false;
    for (const arm of arms) {
      const sample = beta(rng, 1 + arm.successes, 1 + Math.max(0, arm.trials - arm.successes));
      if (sample > best + 1e-15) {
        best = sample;
        bestKey = arm.key;
        tie = false;
      } else if (Math.abs(sample - best) <= 1e-15) tie = true;
    }
    if (!tie && bestKey) wins.set(bestKey, (wins.get(bestKey) ?? 0) + 1);
  }
  const out: Record<string, number> = {};
  for (const arm of arms) out[arm.key] = (wins.get(arm.key) ?? 0) / draws;
  return out;
}

export type JudgedArm = RateArm & { days: number; quality: number };

export type Judgment = {
  status: "still_learning" | "winner" | "no_clear_winner";
  winnerKey: string | null;
  probabilities: Record<string, number>;
  pValue: number | null;
  requiredConversions: number;
  label: "still learning" | "winner" | "no clear winner";
};

/**
 * A winner needs probability-to-beat-best ≥ 0.95, a two-proportion p < 0.05,
 * the conversion floor (and the MDE sample when it is larger), and the minimum days.
 * Otherwise the test is still learning and is never called a winner.
 */
export function judgeArms(arms: JudgedArm[], settings: SegmentSettings, baselineRate: number | null = null): Judgment {
  const required = requiredConversions(baselineRate, settings);
  const probabilities = probabilityToBeatBest(arms);
  const ranked = [...arms].sort((a, b) => (probabilities[b.key] ?? 0) - (probabilities[a.key] ?? 0));
  const leader = ranked[0];
  const runner = ranked[1];
  const pValue = leader && runner ? twoProportionPValue(leader.successes, leader.trials, runner.successes, runner.trials) : null;
  const enough = arms.every((arm) => arm.successes >= required && arm.days >= settings.minDays);
  const confident = leader != null && (probabilities[leader.key] ?? 0) >= settings.probabilityToBeatBest && pValue != null && pValue < settings.twoProportionAlpha;
  if (enough && confident && leader) {
    return { status: "winner", winnerKey: leader.key, probabilities, pValue, requiredConversions: required, label: "winner" };
  }
  const pastMax = arms.length > 0 && arms.every((arm) => arm.days >= settings.maxDays);
  if (pastMax && !confident) {
    return { status: "no_clear_winner", winnerKey: null, probabilities, pValue, requiredConversions: required, label: "no clear winner" };
  }
  return { status: "still_learning", winnerKey: null, probabilities, pValue, requiredConversions: required, label: "still learning" };
}

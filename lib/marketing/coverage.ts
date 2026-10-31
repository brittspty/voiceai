export type SourceFreshness = {
  source: string;
  ageHours: number;
  freshWithinHours: number;
};

export type CoverageInput = {
  sources: SourceFreshness[];
  metricsCovered: number;
  metricsTotal: number;
  qualityPassRate: number;
};

export type CoverageResult = {
  score: number;
  freshness: { source: string; score: number }[];
  metricsCovered: number;
  metricsTotal: number;
  qualityPassRate: number;
  explanation: string;
};

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function freshnessScore(source: SourceFreshness) {
  const window = source.freshWithinHours > 0 ? source.freshWithinHours : 24;
  if (source.ageHours <= window) return 100;
  const over = (source.ageHours - window) / window;
  return Math.max(0, Math.round(100 - over * 100));
}

/**
 * 0–100 score from freshness, dictionary coverage, and the quality pass rate.
 * Bots read this and lower confidence when it is low. They do not write budgets.
 */
export function coverageScore(input: CoverageInput): CoverageResult {
  const freshness = input.sources.map((source) => ({ source: source.source, score: freshnessScore(source) }));
  const fresh = freshness.length ? freshness.reduce((sum, row) => sum + row.score, 0) / freshness.length : 0;
  const total = Math.max(0, input.metricsTotal);
  const covered = total ? clamp01(input.metricsCovered / total) * 100 : 0;
  const quality = clamp01(input.qualityPassRate) * 100;
  const score = Math.round(fresh * 0.4 + covered * 0.3 + quality * 0.3);
  const explanation = explainCoverage(score, fresh, input.metricsCovered, total, quality);
  return {
    score,
    freshness,
    metricsCovered: Math.max(0, input.metricsCovered),
    metricsTotal: total,
    qualityPassRate: clamp01(input.qualityPassRate),
    explanation,
  };
}

function explainCoverage(score: number, fresh: number, covered: number, total: number, quality: number) {
  const band = score >= 80 ? "strong" : score >= 50 ? "partial" : "thin";
  const freshText = fresh >= 80 ? "Sources are recent." : "Some sources are stale.";
  return `Data coverage is ${band} at ${score} out of 100. ${freshText} ${covered} of ${total} dictionary metrics have data. ${Math.round(quality)}% of intake rows passed quality checks.`;
}

/** Bots keep their confidence when coverage is high and lower it when coverage is low. */
export function botConfidence(base: number, coverage: number) {
  const safe = Math.max(0, Math.min(100, base));
  if (coverage >= 80) return safe;
  const factor = Math.max(0.25, Math.max(0, coverage) / 80);
  return Math.round(safe * factor);
}

export function coveredMetricKeys(metricKeys: string[], observations: { metricKey: string }[]) {
  const have = new Set(observations.map((row) => row.metricKey));
  return metricKeys.filter((key) => have.has(key));
}

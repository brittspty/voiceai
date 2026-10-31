import { METRIC_CATALOG, VERTICALS, type CatalogMetric, type MetricBenchmarks, type Vertical } from "./catalog";

export type StoredMetric = {
  metricKey: string;
  definition?: string;
  formula?: string;
  benchmarks?: MetricBenchmarks;
};

export type GlossaryEntry = CatalogMetric & { source: "catalog" | "override" };

/**
 * The only read path for bots and screens.
 * Stored rows override definition, formula, and benchmarks for that workspace.
 * They do not add a second catalog.
 */
export function readMetricDictionary(stored: StoredMetric[] = [], seesStaff = true): GlossaryEntry[] {
  const overrides = new Map(stored.map((row) => [row.metricKey, row]));
  const entries = METRIC_CATALOG.map((row) => {
    const override = overrides.get(row.id);
    if (!override) return { ...row, benchmarks: { ...row.benchmarks }, source: "catalog" as const };
    return {
      ...row,
      definition: override.definition?.trim() || row.definition,
      formula: override.formula?.trim() || row.formula,
      benchmarks: mergeBenchmarks(row.benchmarks, override.benchmarks),
      source: "override" as const,
    };
  });
  return seesStaff ? entries : entries.filter((row) => !row.staffOnly);
}

export function mergeBenchmarks(base: MetricBenchmarks, override?: MetricBenchmarks): MetricBenchmarks {
  const next: MetricBenchmarks = { ...base };
  if (!override) return next;
  for (const vertical of VERTICALS) {
    const value = override[vertical];
    if (typeof value === "number" && Number.isFinite(value)) next[vertical] = value;
  }
  return next;
}

export function glossaryForVertical(entries: GlossaryEntry[], vertical: Vertical) {
  return entries.map((entry) => ({
    id: entry.id,
    name: entry.name,
    definition: entry.definition,
    formula: entry.formula,
    unit: entry.unit,
    direction: entry.direction,
    category: entry.category,
    channels: entry.channels,
    staffOnly: entry.staffOnly,
    benchmark: entry.benchmarks[vertical] ?? null,
  }));
}

export function directionLabel(direction: CatalogMetric["direction"]) {
  return direction === "higher_better" ? "Higher is better." : "Lower is better.";
}

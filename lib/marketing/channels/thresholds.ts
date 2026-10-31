export type Thresholds = {
  minLeads: number;
  minClicks: number;
  leadsDropPct: number;
  cplRisePct: number;
  ctrDropPct: number;
  frequencyWarn: number;
  failedChecks: number;
  pacingBand: number;
  speedToLeadSec: number;
  trackingQuietHours: number;
  searchWasteSpend: number;
  searchWasteDays: number;
  growMultiple: number;
  budgetLimitedShare: number;
  impressionShare: number;
  reviewLiftPct: number;
  reallocMultiple: number;
};

export const DEFAULT_THRESHOLDS: Thresholds = {
  minLeads: 30,
  minClicks: 1000,
  leadsDropPct: 0.25,
  cplRisePct: 0.3,
  ctrDropPct: 0.3,
  frequencyWarn: 3.5,
  failedChecks: 3,
  pacingBand: 0.15,
  speedToLeadSec: 60,
  trackingQuietHours: 24,
  searchWasteSpend: 75,
  searchWasteDays: 14,
  growMultiple: 1.5,
  budgetLimitedShare: 0.4,
  impressionShare: 0.6,
  reviewLiftPct: 0.3,
  reallocMultiple: 1.8,
};

const KEYS = Object.keys(DEFAULT_THRESHOLDS) as (keyof Thresholds)[];

/** Defaults apply until a client saves a number. Blank or invalid values stay on the default. */
export function resolveThresholds(overrides?: Partial<Record<keyof Thresholds, unknown>> | null): Thresholds {
  const next = { ...DEFAULT_THRESHOLDS };
  if (!overrides) return next;
  for (const key of KEYS) {
    const raw = overrides[key];
    if (raw == null || raw === "") continue;
    const parsed = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) continue;
    next[key] = parsed;
  }
  return next;
}

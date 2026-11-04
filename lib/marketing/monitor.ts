import { addDaysISO } from "../time";
import type { Benchmark } from "./config";
import { MONITOR_LAG_MS } from "./config";
import { metricTitle, rateSummary } from "./decisions/labels";

export const RATE_WINDOW_DAYS = 7;
export const RATE_MIN_IMPRESSIONS = 1000;
export const RATE_MIN_CLICKS = 50;
export const CTR_BASELINE_RATIO = 0.6;
export const COST_BASELINE_RATIO = 1.5;
export const BARE_CTR = 0.05;
export const BARE_CTR_MULTIPLE = 3;
export const BARE_BASELINE_IMPRESSIONS = 5000;
export const BARE_MIN_CLICKS = 50;
export const BARE_MIN_DAYS = 3;
export const AUTOMATED_CTR = 0.08;

export type MetricPoint = {
  id: string;
  adId: string;
  adName: string;
  adGroupId: string;
  campaignId: string;
  adAccountId: string;
  objective: string;
  campaignName?: string;
  date: string;
  ingestedAt: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  reach: number;
  leads: number;
  conversions: number;
  conversionValue: number;
};

export type HourPoint = { adId: string; hour: number; clicks: number; impressions: number; conversions: number };

export type HumanBudget = { campaignId: string; amount: number; period: "daily" | "lifetime"; currency: string };

export type MonitorDraft = {
  type: "performance" | "traffic" | "roi" | "budget_change";
  code: string;
  severity: "info" | "warning" | "critical";
  adId: string;
  adName: string;
  campaignId: string;
  adAccountId: string;
  title: string;
  summary: string;
  rationale: string;
  metric: string;
  baseline: string;
  observed: string;
  windowStart: string;
  windowEnd: string;
  sampleSize: number;
  sourceMetricIds: string[];
  currentBudgetAmount: string | null;
  currentBudgetPeriod: "daily" | "lifetime" | null;
  proposedBudgetAmount: string | null;
  proposedBudgetPeriod: "daily" | "lifetime" | null;
  proposedCurrency: string | null;
};

export type MonitorAlert = Omit<MonitorDraft, "type" | "rationale" | "currentBudgetAmount" | "currentBudgetPeriod" | "proposedBudgetAmount" | "proposedBudgetPeriod" | "proposedCurrency"> & {
  dataLandedAt: string;
};

type Totals = {
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  reach: number;
  leads: number;
  conversions: number;
  ids: string[];
  landedAt: string;
};

function emptyTotals(): Totals {
  return { spend: 0, impressions: 0, clicks: 0, linkClicks: 0, reach: 0, leads: 0, conversions: 0, ids: [], landedAt: "" };
}

function add(total: Totals, row: MetricPoint) {
  total.spend += row.spend;
  total.impressions += row.impressions;
  total.clicks += row.clicks;
  total.linkClicks += row.linkClicks;
  total.reach += row.reach;
  total.leads += row.leads;
  total.conversions += row.conversions;
  total.ids.push(row.id);
  if (!total.landedAt || row.ingestedAt > total.landedAt) total.landedAt = row.ingestedAt;
}

function ratio(part: number, whole: number) {
  if (!whole) return null;
  return part / whole;
}

function num(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return value.toFixed(4);
}

function worse(metric: string, observed: number | null, baseline: number | null) {
  if (observed === null || baseline === null || baseline === 0) return false;
  if (metric === "ctr") return observed <= baseline * CTR_BASELINE_RATIO;
  if (metric === "cpc" || metric === "cpm") return observed >= baseline * COST_BASELINE_RATIO;
  return observed > baseline * 1.25;
}

function spanDays(dates: readonly string[]) {
  if (!dates.length) return 0;
  const sorted = [...dates].sort();
  const start = sorted[0];
  const end = sorted[sorted.length - 1];
  if (!start || !end) return 0;
  const a = Date.parse(`${start}T00:00:00.000Z`);
  const b = Date.parse(`${end}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

function benchmarkWorse(metric: string, observed: number | null, bench: number | undefined) {
  if (observed === null || bench === undefined) return false;
  if (metric === "ctr") return observed < bench;
  return observed > bench;
}

export function evaluateAds(input: {
  rows: MetricPoint[];
  hours?: HourPoint[];
  budgets?: HumanBudget[];
  now: Date;
  today: string;
  yesterday: string;
  baselineDays: number;
  alertMinImpressions: number;
  benchmarks: Record<string, Benchmark>;
  landingWindowMs?: number;
}) {
  const windowMs = input.landingWindowMs ?? MONITOR_LAG_MS;
  const recentDates = new Set([input.today, input.yesterday]);
  const alerts: MonitorAlert[] = [];
  const drafts: MonitorDraft[] = [];
  const byAd = new Map<string, MetricPoint[]>();
  for (const row of input.rows) {
    const list = byAd.get(row.adId) ?? [];
    list.push(row);
    byAd.set(row.adId, list);
  }

  for (const [adId, rows] of byAd) {
    const sample = rows[0];
    if (!sample) continue;
    const observedRows = rows.filter((row) => recentDates.has(row.date));
    const observed = emptyTotals();
    for (const row of observedRows) add(observed, row);
    if (!observed.landedAt) continue;
    const landed = Date.parse(observed.landedAt);
    if (!Number.isFinite(landed) || input.now.getTime() - landed > windowMs || landed > input.now.getTime()) continue;

    const baselineRows = input.rows.filter((row) => {
      if (recentDates.has(row.date)) return false;
      if (row.adId === adId) return false;
      return row.adGroupId === sample.adGroupId;
    });
    const baselinePool = baselineRows.length ? baselineRows : input.rows.filter((row) => !recentDates.has(row.date) && row.adId !== adId && row.adAccountId === sample.adAccountId);
    const baseline = emptyTotals();
    for (const row of baselinePool) add(baseline, row);
    const bench = input.benchmarks[sample.objective] ?? {};
    const observedRates = {
      ctr: ratio(observed.clicks, observed.impressions),
      cpc: ratio(observed.spend, observed.clicks),
      cpm: observed.impressions ? (observed.spend / observed.impressions) * 1000 : null,
      cpa: ratio(observed.spend, observed.conversions),
      cpl: ratio(observed.spend, observed.leads),
    };
    const baselineRates = {
      ctr: ratio(baseline.clicks, baseline.impressions),
      cpc: ratio(baseline.spend, baseline.clicks),
      cpm: baseline.impressions ? (baseline.spend / baseline.impressions) * 1000 : null,
      cpa: ratio(baseline.spend, baseline.conversions),
      cpl: ratio(baseline.spend, baseline.leads),
    };

    const push = (draft: MonitorDraft) => {
      drafts.push(draft);
      alerts.push({
        code: draft.code,
        severity: draft.severity,
        adId: draft.adId,
        adName: draft.adName,
        campaignId: draft.campaignId,
        adAccountId: draft.adAccountId,
        title: draft.title,
        summary: draft.summary,
        metric: draft.metric,
        baseline: draft.baseline,
        observed: draft.observed,
        windowStart: draft.windowStart,
        windowEnd: draft.windowEnd,
        sampleSize: draft.sampleSize,
        sourceMetricIds: draft.sourceMetricIds,
        dataLandedAt: observed.landedAt,
      });
    };

    const common = {
      adId,
      adName: sample.adName,
      campaignId: sample.campaignId,
      adAccountId: sample.adAccountId,
      windowStart: input.yesterday,
      windowEnd: input.today,
      sampleSize: observed.impressions,
      sourceMetricIds: observed.ids,
    };

    const rateStart = addDaysISO(input.today, -(RATE_WINDOW_DAYS - 1));
    const rateRows = rows.filter((row) => row.date >= rateStart && row.date <= input.today);
    const rateTotals = emptyTotals();
    for (const row of rateRows) add(rateTotals, row);
    const rateSpan = spanDays(rateRows.map((row) => row.date));
    const rateReady = rateSpan >= RATE_WINDOW_DAYS && rateTotals.impressions >= RATE_MIN_IMPRESSIONS && rateTotals.clicks >= RATE_MIN_CLICKS;
    const outsideRate = (row: MetricPoint) => row.date < rateStart || row.date > input.today;
    const rateBaselineRows = input.rows.filter((row) => outsideRate(row) && row.adId !== adId && row.adGroupId === sample.adGroupId);
    const rateBaselinePool = rateBaselineRows.length
      ? rateBaselineRows
      : input.rows.filter((row) => outsideRate(row) && row.adId !== adId && row.adAccountId === sample.adAccountId);
    const rateBaseline = emptyTotals();
    for (const row of rateBaselinePool) add(rateBaseline, row);
    if (rateReady) {
      const rateObserved = {
        ctr: ratio(rateTotals.clicks, rateTotals.impressions),
        cpc: ratio(rateTotals.spend, rateTotals.clicks),
        cpm: rateTotals.impressions ? (rateTotals.spend / rateTotals.impressions) * 1000 : null,
      };
      const rateBase = {
        ctr: ratio(rateBaseline.clicks, rateBaseline.impressions),
        cpc: ratio(rateBaseline.spend, rateBaseline.clicks),
        cpm: rateBaseline.impressions ? (rateBaseline.spend / rateBaseline.impressions) * 1000 : null,
      };
      for (const metric of ["ctr", "cpc", "cpm"] as const) {
        const observedValue = rateObserved[metric];
        const baselineValue = rateBase[metric];
        const offBaseline = worse(metric, observedValue, baselineValue);
        const offBench = benchmarkWorse(metric, observedValue, bench[metric]);
        if (!offBaseline && !offBench) continue;
        push({
          ...common,
          type: "performance",
          code: `${metric}_off`,
          severity: offBaseline && offBench ? "critical" : "warning",
          title: metricTitle({
            campaignName: sample.campaignName || "",
            adName: sample.adName,
            metric,
            observed: observedValue,
            baseline: baselineValue,
            conversions: rateTotals.conversions,
            days: rateSpan,
            seesCost: true,
          }),
          summary: rateSummary({ metric, ctr: metric === "ctr" ? observedValue : null, conversions: rateTotals.conversions }),
          rationale: "Compared with similar ads across at least 7 days, 1,000 impressions, and 50 clicks. Critical only when both the usual rate and the benchmark are missed.",
          metric,
          baseline: num(baselineValue),
          observed: num(observedValue),
          windowStart: rateStart,
          windowEnd: input.today,
          sampleSize: rateTotals.impressions,
          sourceMetricIds: rateTotals.ids,
          currentBudgetAmount: null,
          currentBudgetPeriod: null,
          proposedBudgetAmount: null,
          proposedBudgetPeriod: null,
          proposedCurrency: null,
        });
      }
    }

    const bareStart = addDaysISO(input.today, -(BARE_MIN_DAYS - 1));
    const bareRows = rows.filter((row) => row.date >= bareStart && row.date <= input.today);
    const bareTotals = emptyTotals();
    for (const row of bareRows) add(bareTotals, row);
    const bareSpan = spanDays(bareRows.map((row) => row.date));
    const bareCtr = ratio(bareTotals.clicks, bareTotals.impressions) ?? 0;
    const outsideBare = (row: MetricPoint) => row.date < bareStart || row.date > input.today;
    const bareBaselineRows = input.rows.filter((row) => outsideBare(row) && row.adId !== adId && row.adGroupId === sample.adGroupId);
    const bareBaselinePool = bareBaselineRows.length
      ? bareBaselineRows
      : input.rows.filter((row) => outsideBare(row) && row.adId !== adId && row.adAccountId === sample.adAccountId);
    const bareBaseline = emptyTotals();
    for (const row of bareBaselinePool) add(bareBaseline, row);
    const bareBaseCtr = ratio(bareBaseline.clicks, bareBaseline.impressions) ?? 0;
    const bareAbsolute = bareCtr >= BARE_CTR;
    const bareMultiple = bareBaseline.impressions >= BARE_BASELINE_IMPRESSIONS && bareBaseCtr > 0 && bareCtr >= bareBaseCtr * BARE_CTR_MULTIPLE;
    const noConversionEvent = sample.objective === "traffic" || sample.objective === "awareness";
    if (
      bareSpan >= BARE_MIN_DAYS &&
      bareTotals.clicks >= BARE_MIN_CLICKS &&
      bareTotals.conversions === 0 &&
      bareTotals.leads === 0 &&
      (bareAbsolute || bareMultiple)
    ) {
      const high = bareCtr >= AUTOMATED_CTR;
      push({
        ...common,
        type: "traffic",
        code: "ctr_without_results",
        severity: noConversionEvent || !high ? "warning" : "critical",
        title: metricTitle({
          campaignName: sample.campaignName || "",
          adName: sample.adName,
          metric: "ctr",
          observed: bareCtr,
          baseline: bareBaseCtr || null,
          conversions: 0,
          days: bareSpan,
          seesCost: false,
        }),
        summary: noConversionEvent
          ? "This campaign is not measuring conversions. The click rate is only a warning."
          : rateSummary({ metric: "ctr", ctr: bareCtr, conversions: 0 }),
        rationale: "Click rate is at least 5% or 3x a baseline of 5,000 impressions, with 50 clicks, no conversions, and at least 3 days.",
        metric: "ctr",
        baseline: num(bareBaseCtr || null),
        observed: num(bareCtr),
        windowStart: bareStart,
        windowEnd: input.today,
        sampleSize: bareTotals.impressions,
        sourceMetricIds: bareTotals.ids,
        currentBudgetAmount: null,
        currentBudgetPeriod: null,
        proposedBudgetAmount: null,
        proposedBudgetPeriod: null,
        proposedCurrency: null,
      });
    }

    if (observed.impressions < input.alertMinImpressions) continue;
    for (const metric of ["cpa", "cpl"] as const) {
      const observedValue = observedRates[metric];
      const baselineValue = baselineRates[metric];
      const offBaseline = worse(metric, observedValue, baselineValue);
      const offBench = benchmarkWorse(metric, observedValue, bench[metric]);
      if (!offBaseline && !offBench) continue;
      if (observed.conversions + observed.leads === 0) continue;
      push({
        ...common,
        type: "performance",
        code: `${metric}_off`,
        severity: offBaseline && offBench ? "critical" : "warning",
        title: `${sample.adName}: results cost more than similar ads`,
        summary: "Results cost more than similar ads. This is a note, not a change.",
        rationale: "Compared with your other ads on results.",
        metric,
        baseline: num(baselineValue),
        observed: num(observedValue),
        currentBudgetAmount: null,
        currentBudgetPeriod: null,
        proposedBudgetAmount: null,
        proposedBudgetPeriod: null,
        proposedCurrency: null,
      });
    }
    const landing = ratio(observed.linkClicks, observed.clicks);
    if (observed.clicks >= 30 && landing !== null && landing < 0.25) {
      push({
        ...common,
        type: "traffic",
        code: "click_to_landing",
        severity: "warning",
        title: `${sample.adName} clicks are not reaching the page`,
        summary: "People click the ad, but few of those clicks arrive on the landing page.",
        rationale: "Link clicks are a small share of all clicks.",
        metric: "click_to_landing",
        baseline: "0.2500",
        observed: num(landing),
        currentBudgetAmount: null,
        currentBudgetPeriod: null,
        proposedBudgetAmount: null,
        proposedBudgetPeriod: null,
        proposedCurrency: null,
      });
    }
    const frequency = ratio(observed.impressions, observed.reach);
    if (frequency !== null && frequency >= 8) {
      push({
        ...common,
        type: "traffic",
        code: "high_frequency",
        severity: "warning",
        title: `${sample.adName} is being shown to the same people too often`,
        summary: "The same people are seeing this ad many times. Results often get worse when that happens.",
        rationale: "Impressions divided by reach is 8 or more.",
        metric: "frequency",
        baseline: "8.0000",
        observed: num(frequency),
        currentBudgetAmount: null,
        currentBudgetPeriod: null,
        proposedBudgetAmount: null,
        proposedBudgetPeriod: null,
        proposedCurrency: null,
      });
    }
    const hours = (input.hours ?? []).filter((hour) => hour.adId === adId);
    if (hours.length) {
      const clicks = hours.reduce((sum, hour) => sum + hour.clicks, 0);
      const odd = hours.filter((hour) => hour.hour <= 5);
      const oddClicks = odd.reduce((sum, hour) => sum + hour.clicks, 0);
      const oddResults = odd.reduce((sum, hour) => sum + hour.conversions, 0);
      if (clicks >= 20 && oddClicks / clicks >= 0.6 && oddResults === 0) {
        push({
          ...common,
          type: "traffic",
          code: "odd_hours",
          severity: "warning",
          title: `${sample.adName} is getting clicks at odd hours`,
          summary: "Most clicks arrived overnight, and those hours did not produce results.",
          rationale: "More than 60% of clicks are in hours 0 through 5, with no conversions in those hours.",
          metric: "odd_hour_clicks",
          baseline: "0.6000",
          observed: num(oddClicks / clicks),
          currentBudgetAmount: null,
          currentBudgetPeriod: null,
          proposedBudgetAmount: null,
          proposedBudgetPeriod: null,
          proposedCurrency: null,
        });
      }
    }

    const budget = (input.budgets ?? []).find((item) => item.campaignId === sample.campaignId);
    const efficiencyOff = ["cpa", "cpl", "cpc"].some((metric) => worse(metric, observedRates[metric as "cpa"], baselineRates[metric as "cpa"]));
    if (budget && budget.period === "daily" && observed.spend > 0 && efficiencyOff) {
      const proposed = Math.max(1, Math.round(budget.amount * 0.8 * 100) / 100);
      if (proposed < budget.amount) {
        push({
          ...common,
          type: "budget_change",
          code: "budget_change",
          severity: "warning",
          title: `Consider a lower daily budget for ${sample.adName}`,
          summary: `Results cost more than similar ads. A person can lower the daily budget from ${budget.amount.toFixed(2)} ${budget.currency} to ${proposed.toFixed(2)} ${budget.currency}. Nothing changes until someone accepts.`,
          rationale: "Efficiency is worse than the baseline, so the suggestion stays inside the current budget.",
          metric: "budget",
          baseline: budget.amount.toFixed(4),
          observed: observed.spend.toFixed(4),
          currentBudgetAmount: budget.amount.toFixed(4),
          currentBudgetPeriod: "daily",
          proposedBudgetAmount: proposed.toFixed(4),
          proposedBudgetPeriod: "daily",
          proposedCurrency: budget.currency,
        });
      }
      drafts.push({
        ...common,
        type: "roi",
        code: "roi_within_budget",
        severity: "info",
        title: `Keep ${sample.adName} inside its daily budget`,
        summary: `Return looks weak. Stay inside the ${budget.amount.toFixed(2)} ${budget.currency} daily budget. This does not raise or spend the budget.`,
        rationale: "ROI advice is capped by the budget a person already set.",
        metric: "roi",
        baseline: budget.amount.toFixed(4),
        observed: observed.spend.toFixed(4),
        currentBudgetAmount: budget.amount.toFixed(4),
        currentBudgetPeriod: "daily",
        proposedBudgetAmount: null,
        proposedBudgetPeriod: null,
        proposedCurrency: budget.currency,
      });
    }
  }

  return { alerts, drafts };
}

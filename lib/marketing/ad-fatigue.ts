import { addDaysISO } from "../time";

/**
 * Daily ad-fatigue scorer.
 * Compares each ad with its own earlier period, shrinks small samples toward
 * an empirical-Bayes prior, and recommends keep / rotate / pause.
 * It never writes an ad or a budget. A recommendation is emitted only when
 * confidence passes the client threshold (0.8 unless that client changed it).
 */

export const AD_FATIGUE_CLICK_PRIOR_DAYS = 7;
export const AD_FATIGUE_VIEW_PRIOR_DAYS = 1;
export const AD_FATIGUE_RESUME_PRIOR_CHECKS = 2;
export const AD_FATIGUE_CONFIDENCE_THRESHOLD = 0.8;
export const AD_FATIGUE_FIXED_LINE = "Yes records your answer. Nothing on the ad account changes.";
export const AD_FATIGUE_PRIOR_STRENGTH = 20;
export const AD_FATIGUE_RATE_PRIOR_TRIALS = 50;
export const FREQUENCY_HIGH = 3.5;

const CLICK_MAX = 28;
const VIEW_MAX = 7;
const CHECKS_MAX = 6;
const DEDUPE_DAYS = 7;

export type AdFatigueAction = "keep" | "rotate" | "pause";
export type AdFatiguePlatform = "meta" | "google_ads" | "stackadapt";

export type AdFatigueRow = {
  id: string;
  date: string;
  impressions: number;
  clicks: number;
  reach: number;
  spend: number;
  conversions: number;
  conversionValue: number;
  creativeKey: string;
  attributionWindow: string;
};

export type AdFatigueAd = {
  adId: string;
  adName: string;
  platform: AdFatiguePlatform;
  campaignId: string;
  campaignName: string;
  adAccountId: string;
  clientKey: string;
  assigneeUserId: string | null;
  rows: AdFatigueRow[];
};

export type AdFatigueCheckPoint = {
  adId: string;
  action: AdFatigueAction;
  emitted: boolean;
  at: string;
};

export type AdFatigueInboxItem = {
  adId: string;
  action: AdFatigueAction;
  at: string;
};

export type AdFatigueClientPrior = {
  clientKey: string;
  threshold?: number;
};

export type LearnedWindow = {
  clickDays: number;
  viewDays: number;
  goodChecksBeforeResume: number;
  observations: number;
  resumeEpisodes: number;
};

export type AdFatigueSignal = {
  baseline: number | null;
  recent: number | null;
  flagged: boolean;
  confidence: number;
};

export type AdFatigueVerdict = {
  adId: string;
  adName: string;
  platform: AdFatiguePlatform;
  campaignId: string;
  campaignName: string;
  adAccountId: string;
  clientKey: string;
  assigneeUserId: string | null;
  action: AdFatigueAction;
  confidence: number;
  emit: boolean;
  reason: string;
  metric: string;
  sampleSize: number;
  sourceMetricIds: string[];
  windowStart: string;
  windowEnd: string;
  learned: LearnedWindow;
  threshold: number;
  signals: {
    ctr: AdFatigueSignal;
    frequency: AdFatigueSignal;
    cpa: AdFatigueSignal;
    roas: AdFatigueSignal;
    conversionRate: AdFatigueSignal;
    repetition: AdFatigueSignal & { days: number };
  };
};

export type AdFatigueRecommendationDraft = {
  type: "ad_fatigue";
  action: AdFatigueAction;
  reason: string;
  adId: string;
  campaignId: string;
  adAccountId: string;
  assigneeUserId: string | null;
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
  confidence: number;
  threshold: number;
  learned: LearnedWindow;
  changesSpend: false;
  writesAds: false;
  recommendationOnly: true;
};

export type AdFatiguePlan = {
  states: { clientKey: string; threshold: number; learned: LearnedWindow }[];
  checks: AdFatigueVerdict[];
  recommendations: AdFatigueRecommendationDraft[];
};

type RatePrior = { alpha: number; beta: number };
type RatePosterior = { mean: number; variance: number };
type Totals = {
  impressions: number;
  clicks: number;
  reach: number;
  spend: number;
  conversions: number;
  conversionValue: number;
  ids: string[];
  dates: Set<string>;
};

export function normalCdf(z: number) {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

export function clampThreshold(value: number) {
  if (!Number.isFinite(value)) return AD_FATIGUE_CONFIDENCE_THRESHOLD;
  return Math.min(0.99, Math.max(0.5, value));
}

export function shrinkBinomial(priorMean: number, priorTrials: number, successes: number, trials: number) {
  const mean = clampUnit(priorMean, 0.002, 0.5);
  const strength = Math.max(1, priorTrials);
  return (mean * strength + Math.max(0, successes)) / (strength + Math.max(0, trials));
}

export function parseAttributionWindow(label: string): { kind: "click" | "view"; days: number } | null {
  const match = /^(\d+)d_(click|view)$/i.exec(label.trim());
  if (!match) return null;
  const days = Number(match[1]);
  if (!Number.isFinite(days) || days < 1) return null;
  return { kind: match[2].toLowerCase() === "view" ? "view" : "click", days };
}

export function learnWindowDays(input: {
  priorDays: number;
  observations: { days: number; weight: number }[];
  priorStrength?: number;
  max: number;
}) {
  const strength = input.priorStrength ?? AD_FATIGUE_PRIOR_STRENGTH;
  let weighted = 0;
  let weight = 0;
  for (const row of input.observations) {
    if (!Number.isFinite(row.days) || !Number.isFinite(row.weight) || row.weight <= 0) continue;
    weighted += clampDays(row.days, input.max) * row.weight;
    weight += row.weight;
  }
  const posterior = (strength * input.priorDays + weighted) / (strength + weight);
  return clampDays(posterior, input.max);
}

export function learnResumeChecks(needed: number[], priorStrength = AD_FATIGUE_PRIOR_STRENGTH) {
  const samples = needed.filter((value) => Number.isFinite(value) && value > 0).map((value) => Math.min(CHECKS_MAX, value));
  const total = samples.reduce((sum, value) => sum + value, 0);
  const posterior = (priorStrength * AD_FATIGUE_RESUME_PRIOR_CHECKS + total) / (priorStrength + samples.length);
  return clampDays(posterior, CHECKS_MAX);
}

export type AssigneeRow = {
  userId: string;
  scopeKind: "client" | "ad_account" | "campaign";
  adAccountId: string | null;
  campaignId: string | null;
};

/** Campaign assignment wins, then the ad account, then a client-wide assignment. */
export function pickAssignee(assignments: AssigneeRow[], adAccountId: string, campaignId: string) {
  const campaignHits = assignments.filter((row) => row.scopeKind === "campaign" && row.campaignId === campaignId);
  const accountHits = assignments.filter((row) => row.scopeKind === "ad_account" && row.adAccountId === adAccountId);
  const clientHits = assignments.filter((row) => row.scopeKind === "client");
  const pool = campaignHits.length ? campaignHits : accountHits.length ? accountHits : clientHits;
  if (!pool.length) return null;
  return [...pool].sort((left, right) => left.userId.localeCompare(right.userId))[0]?.userId ?? null;
}

export function adFatiguePlatforms(env: Record<string, string | undefined>) {
  const raw = env.MARKETING_AD_FATIGUE_PLATFORMS;
  const parts = (raw === undefined ? "meta" : raw)
    .split(",")
    .map((part) => part.trim())
    .filter((part): part is "meta" | "google_ads" => part === "meta" || part === "google_ads");
  return parts.length ? [...new Set(parts)] : ["meta" as const];
}

export function adFatigueThresholdMap(env: Record<string, string | undefined>) {
  const raw = (env.MARKETING_AD_FATIGUE_THRESHOLDS || "").trim();
  const map = new Map<string, number>();
  if (!raw) return map;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return map;
    for (const [key, value] of Object.entries(parsed)) {
      const numeric = typeof value === "number" ? value : Number(value);
      if (key.trim() && Number.isFinite(numeric)) map.set(key.trim(), clampThreshold(numeric));
    }
  } catch {
    return map;
  }
  return map;
}

function clampUnit(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clampDays(value: number, max: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(max, Math.max(1, value));
}

function roundDays(value: number) {
  return Math.max(1, Math.round(value));
}

function emptyTotals(): Totals {
  return {
    impressions: 0,
    clicks: 0,
    reach: 0,
    spend: 0,
    conversions: 0,
    conversionValue: 0,
    ids: [],
    dates: new Set<string>(),
  };
}

function addRow(total: Totals, row: AdFatigueRow) {
  total.impressions += Math.max(0, row.impressions);
  total.clicks += Math.max(0, row.clicks);
  total.reach += Math.max(0, row.reach);
  total.spend += Math.max(0, row.spend);
  total.conversions += Math.max(0, row.conversions);
  total.conversionValue += Math.max(0, row.conversionValue);
  if (row.id) total.ids.push(row.id);
  total.dates.add(row.date);
}

function probBelow(mean: number, variance: number, bar: number) {
  if (!Number.isFinite(mean) || !Number.isFinite(bar)) return 0;
  if (variance <= 1e-18) return mean < bar ? 1 : mean > bar ? 0 : 0.5;
  return normalCdf((bar - mean) / Math.sqrt(variance));
}

function probAbove(mean: number, variance: number, bar: number) {
  if (!Number.isFinite(mean) || !Number.isFinite(bar)) return 0;
  if (variance <= 1e-18) return mean > bar ? 1 : mean < bar ? 0 : 0.5;
  return normalCdf((mean - bar) / Math.sqrt(variance));
}

function ratePosterior(prior: RatePrior, successes: number, trials: number): RatePosterior {
  const alpha = prior.alpha + Math.max(0, successes);
  const beta = prior.beta + Math.max(0, trials - successes);
  const total = alpha + beta;
  const mean = total > 0 ? alpha / total : 0.5;
  const variance = total > 1 ? (alpha * beta) / (total * total * (total + 1)) : 0.25;
  return { mean, variance };
}

function fitRatePrior(samples: { successes: number; trials: number }[], fallbackMean: number): RatePrior {
  const usable = samples.filter((sample) => sample.trials >= 20 && sample.successes >= 0);
  if (usable.length < 2) {
    const trials = usable.reduce((sum, sample) => sum + sample.trials, 0);
    const successes = usable.reduce((sum, sample) => sum + sample.successes, 0);
    const mean = trials > 0 ? shrinkBinomial((successes + 1) / (trials + 2), 2, successes, trials) : fallbackMean;
    const mu = clampUnit(mean, 0.002, 0.5);
    return { alpha: mu * AD_FATIGUE_RATE_PRIOR_TRIALS, beta: (1 - mu) * AD_FATIGUE_RATE_PRIOR_TRIALS };
  }
  const weights = usable.map((sample) => sample.trials);
  const weight = weights.reduce((sum, value) => sum + value, 0);
  const mu = clampUnit(
    usable.reduce((sum, sample) => sum + (sample.successes / sample.trials) * sample.trials, 0) / weight,
    0.002,
    0.5,
  );
  const rates = usable.map((sample) => sample.successes / sample.trials);
  const variance = rates.reduce((sum, rate) => sum + (rate - mu) ** 2, 0) / (rates.length - 1);
  const avgTrials = weight / usable.length;
  const sampling = avgTrials > 0 ? (mu * (1 - mu)) / avgTrials : 0;
  const tau = Math.max(0, variance - sampling);
  let kappa = tau > 1e-8 ? (mu * (1 - mu)) / tau - 1 : AD_FATIGUE_RATE_PRIOR_TRIALS;
  if (!Number.isFinite(kappa)) kappa = AD_FATIGUE_RATE_PRIOR_TRIALS;
  kappa = Math.min(400, Math.max(AD_FATIGUE_RATE_PRIOR_TRIALS, kappa));
  return { alpha: mu * kappa, beta: (1 - mu) * kappa };
}

function windowDistance(label: string, clickDays: number) {
  const parsed = parseAttributionWindow(label);
  if (!parsed) return 100;
  if (parsed.kind === "view") return 50 + Math.abs(parsed.days - AD_FATIGUE_VIEW_PRIOR_DAYS);
  return Math.abs(parsed.days - clickDays);
}

function rowsForScoring(rows: AdFatigueRow[], clickDays: number) {
  const byDate = new Map<string, AdFatigueRow[]>();
  for (const row of rows) {
    const list = byDate.get(row.date) ?? [];
    list.push(row);
    byDate.set(row.date, list);
  }
  const chosen: AdFatigueRow[] = [];
  for (const [date, list] of byDate) {
    const ranked = [...list].sort((left, right) => windowDistance(left.attributionWindow, clickDays) - windowDistance(right.attributionWindow, clickDays) || left.id.localeCompare(right.id));
    const best = windowDistance(ranked[0]?.attributionWindow ?? "", clickDays);
    const tied = ranked.filter((row) => windowDistance(row.attributionWindow, clickDays) === best);
    const total = emptyTotals();
    let creativeKey = tied[0]?.creativeKey ?? "";
    let impressions = -1;
    for (const row of tied) {
      addRow(total, row);
      if (row.impressions > impressions) {
        impressions = row.impressions;
        creativeKey = row.creativeKey;
      }
    }
    chosen.push({
      id: total.ids.join(","),
      date,
      impressions: total.impressions,
      clicks: total.clicks,
      reach: total.reach,
      spend: total.spend,
      conversions: total.conversions,
      conversionValue: total.conversionValue,
      creativeKey,
      attributionWindow: tied[0]?.attributionWindow ?? "",
    });
  }
  return chosen.sort((left, right) => left.date.localeCompare(right.date));
}

function sumBetween(rows: AdFatigueRow[], start: string, end: string) {
  const total = emptyTotals();
  for (const row of rows) {
    if (row.date >= start && row.date <= end) addRow(total, row);
  }
  return total;
}

function creativeStreak(rows: AdFatigueRow[], end: string) {
  const dated = rows.filter((row) => row.date <= end).sort((left, right) => left.date.localeCompare(right.date));
  if (!dated.length) return 0;
  const latest = dated[dated.length - 1]?.creativeKey ?? "";
  if (!latest) return 0;
  let days = 0;
  let cursor = end;
  const byDate = new Map(dated.map((row) => [row.date, row.creativeKey]));
  for (let guard = 0; guard < 90; guard += 1) {
    const key = byDate.get(cursor);
    if (key !== latest) break;
    days += 1;
    cursor = addDaysISO(cursor, -1);
  }
  return days;
}

function money(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "";
  return value.toFixed(2);
}

function percent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "";
  return `${(value * 100).toFixed(1)}%`;
}

function safeName(name: string) {
  const clean = name.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return clean || "This ad";
}

function blankSignal(): AdFatigueSignal {
  return { baseline: null, recent: null, flagged: false, confidence: 0 };
}

function episodesFromHistory(history: AdFatigueCheckPoint[]) {
  const byAd = new Map<string, AdFatigueCheckPoint[]>();
  for (const row of history) {
    const list = byAd.get(row.adId) ?? [];
    list.push(row);
    byAd.set(row.adId, list);
  }
  const needed: number[] = [];
  let episodes = 0;
  for (const rows of byAd.values()) {
    const ordered = [...rows].sort((left, right) => left.at.localeCompare(right.at));
    let pending = false;
    let keeps = 0;
    for (const row of ordered) {
      if (row.action === "pause" || row.action === "rotate") {
        if (pending) {
          needed.push(Math.min(CHECKS_MAX, keeps + 1));
          episodes += 1;
        }
        pending = row.emitted;
        keeps = 0;
        continue;
      }
      if (!pending || row.action !== "keep") continue;
      keeps += 1;
      if (row.emitted) {
        needed.push(Math.min(CHECKS_MAX, keeps));
        episodes += 1;
        pending = false;
        keeps = 0;
      }
    }
  }
  return { needed, episodes };
}

function resumeReady(history: AdFatigueCheckPoint[], adId: string, today: string, action: AdFatigueAction, goodChecks: number) {
  if (action !== "keep") return { ready: false, keeps: 0, suppressed: false };
  const prior = history
    .filter((row) => row.adId === adId && row.at < today)
    .sort((left, right) => right.at.localeCompare(left.at));
  let keeps = 1;
  let suppressed = false;
  for (const row of prior) {
    if (row.action === "keep") {
      keeps += 1;
      continue;
    }
    suppressed = row.emitted && (row.action === "pause" || row.action === "rotate");
    break;
  }
  return { ready: suppressed && keeps >= goodChecks, keeps, suppressed };
}

function recentlySent(recent: AdFatigueInboxItem[], adId: string, action: AdFatigueAction, today: string) {
  const cutoff = addDaysISO(today, -DEDUPE_DAYS);
  return recent.some((row) => row.adId === adId && row.action === action && row.at >= cutoff && row.at <= today);
}

function buildReason(input: {
  name: string;
  action: AdFatigueAction;
  confidence: number;
  keeps: number;
  signals: AdFatigueVerdict["signals"];
}) {
  const confidence = `${Math.round(input.confidence * 100)}%`;
  const name = `'${input.name}'`;
  if (input.action === "keep") {
    const checks = Math.max(1, input.keeps);
    return `${name} looks ready to run again after ${checks} good check${checks === 1 ? "" : "s"}. Confidence ${confidence}.`;
  }
  const parts: string[] = [];
  if (input.signals.ctr.flagged && input.signals.ctr.baseline !== null && input.signals.ctr.recent !== null) {
    parts.push(`clicks fell from ${percent(input.signals.ctr.baseline)} to ${percent(input.signals.ctr.recent)} against its own earlier period`);
  }
  if (input.signals.conversionRate.flagged && input.signals.conversionRate.baseline !== null && input.signals.conversionRate.recent !== null) {
    parts.push(`the conversion rate fell from ${percent(input.signals.conversionRate.baseline)} to ${percent(input.signals.conversionRate.recent)}`);
  }
  if (input.signals.frequency.flagged && input.signals.frequency.recent !== null) {
    parts.push(`people are seeing it ${input.signals.frequency.recent.toFixed(1)} times`);
  }
  if (input.signals.repetition.flagged) {
    parts.push(`the same creative has run for ${input.signals.repetition.days} days`);
  }
  if (input.signals.cpa.flagged && input.signals.cpa.baseline !== null && input.signals.cpa.recent !== null) {
    parts.push(`cost per result moved from ${money(input.signals.cpa.baseline)} to ${money(input.signals.cpa.recent)}`);
  }
  if (input.signals.roas.flagged && input.signals.roas.baseline !== null && input.signals.roas.recent !== null) {
    parts.push(`return on ad spend fell from ${input.signals.roas.baseline.toFixed(2)} to ${input.signals.roas.recent.toFixed(2)}`);
  }
  const verb = input.action === "pause" ? "should pause" : "should rotate";
  if (!parts.length) return `${name} ${verb}. Confidence ${confidence}.`;
  const detail = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `${name} ${verb}. ${detail ? detail.charAt(0).toUpperCase() + detail.slice(1) : detail}. Confidence ${confidence}.`;
}

function metricFor(action: AdFatigueAction, signals: AdFatigueVerdict["signals"]) {
  if (action === "keep") return "fatigue";
  const moneySignal = signals.cpa.flagged || signals.roas.flagged;
  const publicSignal = signals.ctr.flagged || signals.conversionRate.flagged || signals.frequency.flagged || signals.repetition.flagged;
  if (moneySignal && !publicSignal) return signals.roas.flagged && !signals.cpa.flagged ? "roas" : "cpa";
  if (signals.ctr.flagged) return "ctr";
  if (signals.conversionRate.flagged) return "conversion_rate";
  if (signals.frequency.flagged) return "frequency";
  if (signals.repetition.flagged) return "creative_repetition";
  if (signals.roas.flagged) return "roas";
  if (signals.cpa.flagged) return "cpa";
  return "fatigue";
}

function finishRate(signal: AdFatigueSignal, ratio: number, threshold: number, ceiling: number): AdFatigueSignal {
  const confidence = Math.min(signal.confidence, ceiling);
  const dropped = signal.baseline !== null && signal.recent !== null && signal.recent < signal.baseline * ratio;
  return {
    ...signal,
    confidence,
    flagged: dropped && confidence >= threshold && ceiling >= threshold,
  };
}

function compareRates(prior: RatePrior, baseline: { successes: number; trials: number }, recent: { successes: number; trials: number }, drop: number) {
  if (baseline.trials <= 0 || recent.trials <= 0) return { ...blankSignal(), baseline: null, recent: null };
  const base = ratePosterior(prior, baseline.successes, baseline.trials);
  const next = ratePosterior(prior, recent.successes, recent.trials);
  const confidence = probBelow(next.mean, next.variance, base.mean * (1 - drop));
  return { baseline: base.mean, recent: next.mean, flagged: false, confidence };
}

function ratioEstimate(spend: number, rate: RatePosterior, trials: number) {
  const meanCount = rate.mean * trials;
  const varianceCount = rate.variance * trials * trials;
  if (spend <= 0 || meanCount < 0.5) return null;
  const mean = spend / meanCount;
  const variance = (spend * spend * varianceCount) / meanCount ** 4;
  return { mean, variance: Math.max(0, variance) };
}

function scoreAd(input: {
  ad: AdFatigueAd;
  rows: AdFatigueRow[];
  today: string;
  clickDays: number;
  learned: LearnedWindow;
  threshold: number;
  ctrPrior: RatePrior;
  cvrPrior: RatePrior;
  history: AdFatigueCheckPoint[];
  recentInbox: AdFatigueInboxItem[];
  thin: boolean;
}): AdFatigueVerdict {
  const length = roundDays(input.clickDays);
  const windowEnd = input.today;
  const recentStart = addDaysISO(windowEnd, -(length - 1));
  const baselineEnd = addDaysISO(recentStart, -1);
  const baselineStart = addDaysISO(baselineEnd, -(length - 1));
  const recent = sumBetween(input.rows, recentStart, windowEnd);
  const baseline = sumBetween(input.rows, baselineStart, baselineEnd);
  const enoughDays = recent.dates.size >= Math.max(2, Math.ceil(length / 2)) && baseline.dates.size >= Math.max(2, Math.ceil(length / 2));
  const ceiling = enoughDays && !input.thin ? 1 : 0.55;

  const ctrRaw = compareRates(input.ctrPrior, { successes: baseline.clicks, trials: baseline.impressions }, { successes: recent.clicks, trials: recent.impressions }, 0.15);
  const cvrRaw = compareRates(input.cvrPrior, { successes: baseline.conversions, trials: baseline.clicks }, { successes: recent.conversions, trials: recent.clicks }, 0.15);
  const ctr = finishRate(ctrRaw, 0.85, input.threshold, ceiling);
  const conversionRate = finishRate(cvrRaw, 0.85, input.threshold, ceiling);

  const frequencyValue = recent.reach > 0 ? recent.impressions / recent.reach : null;
  const frequencySe = recent.reach > 0 ? Math.sqrt(Math.max(recent.impressions, 1)) / recent.reach : 0;
  const frequencyHighConfidence = frequencyValue === null ? 0 : probAbove(frequencyValue, frequencySe ** 2, FREQUENCY_HIGH);
  const frequency: AdFatigueSignal = {
    baseline: FREQUENCY_HIGH,
    recent: frequencyValue,
    confidence: Math.min(ceiling, frequencyHighConfidence),
    flagged: frequencyValue !== null && frequencyValue >= FREQUENCY_HIGH && frequencyHighConfidence >= input.threshold && ceiling >= input.threshold,
  };

  const baseCvr = ratePosterior(input.cvrPrior, baseline.conversions, baseline.clicks);
  const nextCvr = ratePosterior(input.cvrPrior, recent.conversions, recent.clicks);
  const baseCpa = ratioEstimate(baseline.spend, baseCvr, baseline.clicks);
  const nextCpa = ratioEstimate(recent.spend, nextCvr, recent.clicks);
  let cpa = blankSignal();
  if (baseCpa && nextCpa) {
    const confidence = Math.min(ceiling, probAbove(nextCpa.mean, nextCpa.variance, baseCpa.mean * 1.25));
    cpa = {
      baseline: baseCpa.mean,
      recent: nextCpa.mean,
      confidence,
      flagged: nextCpa.mean > baseCpa.mean * 1.25 && confidence >= input.threshold && ceiling >= input.threshold,
    };
  }

  let roas = blankSignal();
  if (baseline.spend > 0 && recent.spend > 0 && (baseline.conversionValue > 0 || recent.conversionValue > 0)) {
    const baseRoas = baseline.conversionValue / baseline.spend;
    const nextRoas = recent.conversionValue / recent.spend;
    const strength = AD_FATIGUE_RATE_PRIOR_TRIALS;
    const weight = Math.min(recent.impressions, 10_000);
    const shrunkNext = (strength * baseRoas + weight * nextRoas) / (strength + weight);
    const se = Math.max(baseRoas, nextRoas, 0.05) / Math.sqrt(strength + Math.min(weight, 400));
    const confidence = Math.min(ceiling, probBelow(shrunkNext, se ** 2, baseRoas * 0.8));
    roas = {
      baseline: baseRoas,
      recent: nextRoas,
      confidence,
      flagged: nextRoas < baseRoas * 0.8 && confidence >= input.threshold && ceiling >= input.threshold,
    };
  }

  const days = creativeStreak(input.rows, windowEnd);
  const repetitionBar = Math.max(21, length * 3);
  const dayScore = 1 / (1 + Math.exp(-(days - (repetitionBar - 3)) / 1.5));
  const sampleScore = 1 - Math.exp(-recent.impressions / 800);
  const repetitionHigh = days >= repetitionBar && recent.impressions >= 500;
  const repetitionConfidence = Math.min(ceiling, repetitionHigh ? dayScore * Math.max(sampleScore, 0.5) : dayScore * sampleScore * 0.25);
  const repetition = {
    baseline: repetitionBar,
    recent: days,
    days,
    confidence: repetitionConfidence,
    flagged: repetitionHigh && repetitionConfidence >= input.threshold && ceiling >= input.threshold,
  };

  const delivery = Math.max(ctr.flagged ? ctr.confidence : 0, conversionRate.flagged ? conversionRate.confidence : 0);
  const pressure = Math.max(frequency.flagged ? frequency.confidence : 0, cpa.flagged ? cpa.confidence : 0, roas.flagged ? roas.confidence : 0);
  const repeated = repetition.flagged ? repetition.confidence : 0;
  let action: AdFatigueAction = "keep";
  const moneyPressure = Math.max(cpa.flagged ? cpa.confidence : 0, roas.flagged ? roas.confidence : 0);
  if (delivery >= input.threshold && pressure >= input.threshold) action = "pause";
  else if (repeated >= input.threshold || delivery >= input.threshold || moneyPressure >= input.threshold) action = "rotate";

  const uncertainty = Math.max(ctr.confidence, conversionRate.confidence, cpa.confidence, roas.confidence, repetition.confidence);
  let confidence = action === "pause" ? Math.min(delivery, pressure) : action === "rotate" ? Math.max(repeated, delivery, moneyPressure) : 1 - uncertainty;
  confidence = clampUnit(confidence, 0, 0.99);
  if (ceiling < 1) confidence = Math.min(confidence, ceiling);
  const resume = resumeReady(input.history, input.ad.adId, input.today, action, roundDays(input.learned.goodChecksBeforeResume));
  const passes = confidence >= input.threshold;
  const duplicate = recentlySent(input.recentInbox, input.ad.adId, action, input.today);
  const emit = passes && !duplicate && (action === "pause" || action === "rotate" || (action === "keep" && resume.ready));
  const signals = { ctr, frequency, cpa, roas, conversionRate, repetition };
  const reason = buildReason({
    name: safeName(input.ad.adName),
    action,
    confidence,
    keeps: resume.keeps,
    signals,
  });
  return {
    adId: input.ad.adId,
    adName: input.ad.adName,
    platform: input.ad.platform,
    campaignId: input.ad.campaignId,
    campaignName: input.ad.campaignName,
    adAccountId: input.ad.adAccountId,
    clientKey: input.ad.clientKey,
    assigneeUserId: input.ad.assigneeUserId,
    action,
    confidence,
    emit,
    reason,
    metric: metricFor(action, signals),
    sampleSize: recent.impressions,
    sourceMetricIds: [...new Set([...recent.ids, ...baseline.ids])],
    windowStart: recentStart,
    windowEnd,
    learned: input.learned,
    threshold: input.threshold,
    signals,
  };
}

function windowObservations(ads: AdFatigueAd[], kind: "click" | "view") {
  const observations: { days: number; weight: number }[] = [];
  for (const ad of ads) {
    for (const row of ad.rows) {
      const parsed = parseAttributionWindow(row.attributionWindow);
      if (!parsed || parsed.kind !== kind) continue;
      const weight = row.conversions > 0 ? row.conversions : 0;
      if (weight <= 0) continue;
      observations.push({ days: parsed.days, weight });
    }
  }
  return observations;
}

function draftFrom(verdict: AdFatigueVerdict): AdFatigueRecommendationDraft {
  const learnedLabel = `Learned window: ${roundDays(verdict.learned.clickDays)}-day click, ${roundDays(verdict.learned.viewDays)}-day view. Good checks before a fresh yes: ${roundDays(verdict.learned.goodChecksBeforeResume)}.`;
  return {
    type: "ad_fatigue",
    action: verdict.action,
    reason: verdict.reason,
    adId: verdict.adId,
    campaignId: verdict.campaignId,
    adAccountId: verdict.adAccountId,
    assigneeUserId: verdict.assigneeUserId,
    title: verdict.reason,
    summary: AD_FATIGUE_FIXED_LINE,
    rationale: [verdict.reason, learnedLabel, AD_FATIGUE_FIXED_LINE].join("\n"),
    metric: verdict.metric,
    baseline: verdict.threshold.toFixed(4),
    observed: verdict.confidence.toFixed(4),
    windowStart: verdict.windowStart,
    windowEnd: verdict.windowEnd,
    sampleSize: verdict.sampleSize,
    sourceMetricIds: verdict.sourceMetricIds,
    confidence: verdict.confidence,
    threshold: verdict.threshold,
    learned: verdict.learned,
    changesSpend: false,
    writesAds: false,
    recommendationOnly: true,
  };
}

/**
 * One pass over the ads that belong to a day.
 * Priors are 7-day click, 1-day view, and 2 good checks. Client rows move those posteriors.
 * Google and StackAdapt rows use this same function; the daily job decides which platforms to load.
 */
export function planAdFatigue(input: {
  ads: AdFatigueAd[];
  today: string;
  history?: AdFatigueCheckPoint[];
  recentInbox?: AdFatigueInboxItem[];
  priors?: AdFatigueClientPrior[];
  defaultThreshold?: number;
  thresholdByClient?: Map<string, number>;
}): AdFatiguePlan {
  const history = input.history ?? [];
  const recentInbox = input.recentInbox ?? [];
  const defaultThreshold = clampThreshold(input.defaultThreshold ?? AD_FATIGUE_CONFIDENCE_THRESHOLD);
  const byClient = new Map<string, AdFatigueAd[]>();
  for (const ad of input.ads) {
    const list = byClient.get(ad.clientKey) ?? [];
    list.push(ad);
    byClient.set(ad.clientKey, list);
  }
  const priorByClient = new Map((input.priors ?? []).map((prior) => [prior.clientKey, prior]));
  const states: AdFatiguePlan["states"] = [];
  const checks: AdFatigueVerdict[] = [];

  for (const [clientKey, ads] of byClient) {
    const configured = input.thresholdByClient?.get(clientKey) ?? priorByClient.get(clientKey)?.threshold ?? defaultThreshold;
    const threshold = clampThreshold(configured);
    const adIds = new Set(ads.map((ad) => ad.adId));
    const clientHistory = history.filter((row) => adIds.has(row.adId) && row.at < input.today);
    const { needed, episodes } = episodesFromHistory(clientHistory);
    const goodChecks = learnResumeChecks(needed);
    const clickDays = learnWindowDays({
      priorDays: AD_FATIGUE_CLICK_PRIOR_DAYS,
      observations: windowObservations(ads, "click"),
      max: CLICK_MAX,
    });
    const viewDays = learnWindowDays({
      priorDays: AD_FATIGUE_VIEW_PRIOR_DAYS,
      observations: windowObservations(ads, "view"),
      max: VIEW_MAX,
    });
    const learned: LearnedWindow = {
      clickDays,
      viewDays,
      goodChecksBeforeResume: goodChecks,
      observations: windowObservations(ads, "click").length + windowObservations(ads, "view").length,
      resumeEpisodes: episodes,
    };
    states.push({ clientKey, threshold, learned });
    const scoredRows = new Map(ads.map((ad) => [ad.adId, rowsForScoring(ad.rows, roundDays(clickDays))]));
    const ctrSamples: { successes: number; trials: number }[] = [];
    const cvrSamples: { successes: number; trials: number }[] = [];
    const length = roundDays(clickDays);
    for (const ad of ads) {
      const rows = scoredRows.get(ad.adId) ?? [];
      const recentStart = addDaysISO(input.today, -(length - 1));
      const baselineEnd = addDaysISO(recentStart, -1);
      const baselineStart = addDaysISO(baselineEnd, -(length - 1));
      const baseline = sumBetween(rows, baselineStart, baselineEnd);
      ctrSamples.push({ successes: baseline.clicks, trials: baseline.impressions });
      cvrSamples.push({ successes: baseline.conversions, trials: baseline.clicks });
    }
    const ctrPrior = fitRatePrior(ctrSamples, 0.01);
    const cvrPrior = fitRatePrior(cvrSamples, 0.05);
    for (const ad of ads) {
      const rows = scoredRows.get(ad.adId) ?? [];
      if (!rows.length) continue;
      const thin = rows.reduce((sum, row) => sum + row.impressions, 0) < 200;
      checks.push(
        scoreAd({
          ad,
          rows,
          today: input.today,
          clickDays,
          learned,
          threshold,
          ctrPrior,
          cvrPrior,
          history,
          recentInbox,
          thin,
        }),
      );
    }
  }

  return {
    states,
    checks,
    recommendations: checks.filter((check) => check.emit).map(draftFrom),
  };
}

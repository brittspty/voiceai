import { shouldRefire, type Severity } from "./refire";

export const FATIGUE_COOLDOWN_DAYS = 7;
export const FREQUENCY_THRESHOLD = 3.5;
export const SEVERE_FREQUENCY = 8;
export const CTR_DECAY_RATIO = 0.75;
export const CPA_RISE_RATIO = 1.25;
export const MIN_FATIGUE_IMPRESSIONS = 200;
export const MIN_FATIGUE_DAYS = 4;

export type FatigueReason = "frequency" | "ctr_decay" | "cpa_rise";

export type FatiguePoint = {
  id: string;
  platform: string;
  adId: string;
  adName: string;
  creativeVersionId: string | null;
  creativeId: string | null;
  headline: string;
  campaignId: string;
  campaignName: string;
  adAccountId: string;
  date: string;
  impressions: number;
  clicks: number;
  reach: number;
  spend: number;
  conversions: number;
  leads: number;
};

export type FatiguePrevious = { adId: string; severity: Severity; at: string };

export type FatigueHit = {
  platform: string;
  adId: string;
  adName: string;
  creativeVersionId: string | null;
  creativeId: string | null;
  campaignId: string;
  campaignName: string;
  adAccountId: string;
  frequency: number | null;
  ctrRecent: number | null;
  ctrPrior: number | null;
  ctrSlope: number | null;
  ctrDropPct: number | null;
  cpaRecent: number | null;
  cpaPrior: number | null;
  cpaRisePct: number | null;
  reasons: FatigueReason[];
  severity: "warning" | "critical";
  windowStart: string;
  windowEnd: string;
  sampleSize: number;
  sourceMetricIds: string[];
  headline: string;
  publicHeadline: string;
  summary: string;
  rationale: string;
  metric: "frequency" | "ctr" | "cpa";
  baseline: string;
  observed: string;
  dedupeKey: string;
  emit: boolean;
  changesSpend: false;
  variation: {
    status: "draft";
    headline: string;
    body: string;
    fingerprint: string;
    current: string;
    proposed: string;
  } | null;
};

const PUBLIC_NOTE = "Approving queues a draft for a person to upload. Nothing goes live on its own.";
const VARIATION_BODY = "New version to test against the tired ad. A person uploads this. Nothing publishes on its own.";

function addDays(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function fixed(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return value.toFixed(4);
}

function slope(points: { x: number; y: number }[]) {
  if (points.length < 2) return null;
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  let numerator = 0;
  let denominator = 0;
  for (const point of points) {
    numerator += (point.x - meanX) * (point.y - meanY);
    denominator += (point.x - meanX) ** 2;
  }
  if (denominator === 0) return null;
  return numerator / denominator;
}

function sum(rows: FatiguePoint[]) {
  return rows.reduce(
    (total, row) => {
      total.impressions += row.impressions;
      total.clicks += row.clicks;
      total.reach += row.reach;
      total.spend += row.spend;
      total.conversions += row.conversions;
      total.leads += row.leads;
      total.ids.push(row.id);
      return total;
    },
    { impressions: 0, clicks: 0, reach: 0, spend: 0, conversions: 0, leads: 0, ids: [] as string[] },
  );
}

function dailyCtr(rows: FatiguePoint[]) {
  const byDate = new Map<string, { impressions: number; clicks: number }>();
  for (const row of rows) {
    const current = byDate.get(row.date) ?? { impressions: 0, clicks: 0 };
    current.impressions += row.impressions;
    current.clicks += row.clicks;
    byDate.set(row.date, current);
  }
  return [...byDate.entries()]
    .filter(([, totals]) => totals.impressions > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, totals], index) => ({ x: index, y: totals.clicks / totals.impressions }));
}

export function fatigueHeadline(input: {
  adName: string;
  frequency: number | null;
  ctrDropPct: number | null;
  cpaRisePct: number | null;
  seesCost: boolean;
}) {
  const name = `'${input.adName}'`;
  const drop = input.ctrDropPct !== null && input.ctrDropPct >= 25 ? Math.round(input.ctrDropPct) : null;
  const frequency = input.frequency !== null && input.frequency >= FREQUENCY_THRESHOLD ? input.frequency : null;
  if (frequency !== null && drop !== null) {
    return `${name} is wearing out: people saw it ${frequency.toFixed(1)} times and clicks fell ${drop}% in 7 days.`;
  }
  if (frequency !== null) return `${name} is wearing out: people saw it ${frequency.toFixed(1)} times.`;
  if (drop !== null) return `${name} is wearing out: clicks fell ${drop}% in 7 days.`;
  if (input.seesCost && input.cpaRisePct !== null && input.cpaRisePct > 0) {
    return `${name} is wearing out: cost per result rose ${Math.round(input.cpaRisePct)}% in 7 days.`;
  }
  return null;
}

export function presentFatigueSignal(
  input: {
    adId: string;
    adName: string;
    campaignId: string;
    platform: string;
    frequency: number | null;
    ctrRecent: number | null;
    ctrPrior: number | null;
    reasons: string[];
    fatigued: boolean;
    cpaRisePct?: number | null;
  },
  seesCost: boolean,
) {
  if (!input.fatigued) return null;
  const onlyCost = input.reasons.length > 0 && input.reasons.every((reason) => reason === "cpa_rise");
  if (!seesCost && onlyCost) return null;
  const ctrDropPct = input.ctrPrior && input.ctrRecent !== null && input.ctrPrior > 0 ? ((input.ctrPrior - input.ctrRecent) / input.ctrPrior) * 100 : null;
  const headline = fatigueHeadline({
    adName: input.adName,
    frequency: input.frequency,
    ctrDropPct,
    cpaRisePct: seesCost ? input.cpaRisePct ?? null : null,
    seesCost,
  });
  if (!headline) return null;
  return {
    adId: input.adId,
    adName: input.adName,
    campaignId: input.campaignId,
    platform: input.platform,
    headline,
    chip: "Tired" as const,
  };
}

export function fatigueForViewer(
  hit: Pick<FatigueHit, "platform" | "adId" | "adName" | "campaignId" | "frequency" | "ctrDropPct" | "cpaRisePct" | "reasons" | "publicHeadline" | "headline">,
  seesCost: boolean,
) {
  const onlyCost = hit.reasons.every((reason) => reason === "cpa_rise");
  if (!seesCost && onlyCost) return null;
  const headline = seesCost ? hit.headline : hit.publicHeadline;
  if (!headline) return null;
  return {
    platform: hit.platform,
    adId: hit.adId,
    adName: hit.adName,
    campaignId: hit.campaignId,
    frequency: hit.frequency,
    ctrDropPct: hit.ctrDropPct,
    reasons: seesCost ? hit.reasons : hit.reasons.filter((reason) => reason !== "cpa_rise"),
    headline,
    chip: "Tired" as const,
  };
}

function latestPrevious(rows: FatiguePrevious[], adId: string) {
  return rows
    .filter((row) => row.adId === adId)
    .sort((left, right) => right.at.localeCompare(left.at))[0] ?? null;
}

/**
 * Flags a creative when synced delivery shows frequency pressure, a falling CTR, a rising CPA, or a mix.
 * Meta and Google rows use the same rules. Nothing here writes a budget or publishes an ad.
 */
export function detectFatigue(input: {
  rows: FatiguePoint[];
  today: string;
  now?: string;
  previous?: FatiguePrevious[];
  minImpressions?: number;
}) {
  const minImpressions = input.minImpressions ?? MIN_FATIGUE_IMPRESSIONS;
  const windowEnd = input.today;
  const recentStart = addDays(windowEnd, -6);
  const priorEnd = addDays(windowEnd, -7);
  const priorStart = addDays(windowEnd, -13);
  const now = input.now ?? `${windowEnd}T12:00:00.000Z`;
  const byAd = new Map<string, FatiguePoint[]>();
  for (const row of input.rows) {
    const list = byAd.get(row.adId) ?? [];
    list.push(row);
    byAd.set(row.adId, list);
  }

  const flagged: FatigueHit[] = [];
  const healthyAdIds: string[] = [];

  for (const [adId, rows] of byAd) {
    const sample = [...rows].sort((left, right) => right.date.localeCompare(left.date))[0];
    if (!sample) continue;
    const recentRows = rows.filter((row) => row.date >= recentStart && row.date <= windowEnd);
    const priorRows = rows.filter((row) => row.date >= priorStart && row.date <= priorEnd);
    const recent = sum(recentRows);
    const prior = sum(priorRows);
    const recentDays = new Set(recentRows.map((row) => row.date)).size;
    if (recent.impressions < minImpressions || recentDays < MIN_FATIGUE_DAYS) continue;

    const series = dailyCtr(recentRows);
    const ctrSlope = slope(series);
    const early = series.slice(0, 3);
    const late = series.slice(-3);
    const earlyCtr = early.length ? early.reduce((total, point) => total + point.y, 0) / early.length : null;
    const lateCtr = late.length ? late.reduce((total, point) => total + point.y, 0) / late.length : null;
    const ctrRecent = recent.impressions ? recent.clicks / recent.impressions : null;
    const ctrPrior = prior.impressions ? prior.clicks / prior.impressions : null;
    const periodDrop = ctrPrior && ctrRecent !== null && ctrPrior > 0 ? (ctrPrior - ctrRecent) / ctrPrior : 0;
    const halfDrop = earlyCtr && lateCtr !== null && earlyCtr > 0 ? (earlyCtr - lateCtr) / earlyCtr : 0;
    const periodDecay = ctrPrior !== null && ctrRecent !== null && ctrPrior > 0 && ctrRecent <= ctrPrior * CTR_DECAY_RATIO;
    const slopeDecay = ctrSlope !== null && ctrSlope < 0 && earlyCtr !== null && lateCtr !== null && earlyCtr > 0 && lateCtr <= earlyCtr * CTR_DECAY_RATIO;
    const ctrDecay = periodDecay || slopeDecay;
    const frequency = recent.reach > 0 ? recent.impressions / recent.reach : null;
    const freqHigh = frequency !== null && frequency >= FREQUENCY_THRESHOLD && recent.reach >= 50;
    const severe = frequency !== null && frequency >= SEVERE_FREQUENCY;
    const cpaRecent = recent.conversions > 0 ? recent.spend / recent.conversions : null;
    const cpaPrior = prior.conversions > 0 ? prior.spend / prior.conversions : null;
    const cpaRise = cpaRecent !== null && cpaPrior !== null && cpaPrior > 0 && recent.conversions >= 1 && prior.conversions >= 1 && cpaRecent >= cpaPrior * CPA_RISE_RATIO;
    const cpaRisePct = cpaRise && cpaPrior ? ((cpaRecent! - cpaPrior) / cpaPrior) * 100 : null;
    const ctrDropPct = Math.max(periodDrop, halfDrop) > 0 ? Math.max(periodDrop, halfDrop) * 100 : null;
    const steepCtr = ctrDropPct !== null && ctrDropPct >= 35 && frequency !== null && frequency >= 2.5 && recent.reach >= 50;
    const reasons: FatigueReason[] = [];
    if (freqHigh || severe) reasons.push("frequency");
    if (ctrDecay) reasons.push("ctr_decay");
    if (cpaRise) reasons.push("cpa_rise");
    const fatigued = (freqHigh && ctrDecay) || (freqHigh && cpaRise) || (ctrDecay && cpaRise) || severe || (steepCtr && ctrDecay);
    if (!fatigued) {
      healthyAdIds.push(adId);
      continue;
    }

    const severity: "warning" | "critical" =
      (frequency !== null && frequency >= SEVERE_FREQUENCY) || periodDrop >= 0.5 || (cpaRisePct !== null && cpaRisePct >= 50) ? "critical" : "warning";
    const publicHeadline =
      fatigueHeadline({ adName: sample.adName, frequency, ctrDropPct, cpaRisePct: null, seesCost: false }) ??
      `'${sample.adName}' is wearing out.`;
    const staffHeadline =
      fatigueHeadline({ adName: sample.adName, frequency, ctrDropPct, cpaRisePct, seesCost: true }) ?? publicHeadline;
    const onlyCpa = reasons.length === 1 && reasons[0] === "cpa_rise";
    const metric = onlyCpa ? "cpa" : reasons.includes("frequency") ? "frequency" : "ctr";
    const currentText = sample.headline || sample.adName;
    const proposedText = `${currentText} — new version`;
    const variation = sample.creativeId
      ? {
          status: "draft" as const,
          headline: proposedText,
          body: VARIATION_BODY,
          fingerprint: `fatigue:${adId}:${windowEnd}`,
          current: currentText,
          proposed: proposedText,
        }
      : null;
    const rationale = variation
      ? [`Current: ${variation.current}`, `Proposed: ${variation.proposed}`, PUBLIC_NOTE].join("\n")
      : ["Preview not available", PUBLIC_NOTE].join("\n");
    const previous = latestPrevious(input.previous ?? [], adId);
    flagged.push({
      platform: sample.platform,
      adId,
      adName: sample.adName,
      creativeVersionId: sample.creativeVersionId,
      creativeId: sample.creativeId,
      campaignId: sample.campaignId,
      campaignName: sample.campaignName,
      adAccountId: sample.adAccountId,
      frequency,
      ctrRecent,
      ctrPrior,
      ctrSlope,
      ctrDropPct,
      cpaRecent,
      cpaPrior,
      cpaRisePct,
      reasons,
      severity,
      windowStart: recentStart,
      windowEnd,
      sampleSize: recent.impressions,
      sourceMetricIds: [...recent.ids, ...prior.ids],
      headline: onlyCpa ? staffHeadline : publicHeadline,
      publicHeadline,
      summary: "Approve a new version to test against it.",
      rationale,
      metric,
      baseline: metric === "cpa" ? fixed(cpaPrior) : metric === "ctr" ? fixed(ctrPrior) : FREQUENCY_THRESHOLD.toFixed(4),
      observed: metric === "cpa" ? fixed(cpaRecent) : metric === "ctr" ? fixed(ctrRecent) : fixed(frequency),
      dedupeKey: `${sample.adAccountId}:creative_fatigue:${adId}`,
      emit: shouldRefire({ previous, next: severity, now, cooldownDays: FATIGUE_COOLDOWN_DAYS }),
      changesSpend: false,
      variation,
    });
  }

  return { flagged, healthyAdIds };
}

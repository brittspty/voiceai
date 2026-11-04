/**
 * Decision rules read stored metric rows only.
 * They never write a budget and never call an ad platform.
 */

import { addDaysISO } from "../../time";
import { normalizeAppName } from "./apps";
import { recommendationDedupeKey } from "./key";

export const CTR_MIN_IMPRESSIONS = 1000;
export const CTR_DROP = 0.25;
export const CONVERSION_MIN_CLICKS = 50;
export const CONVERSION_MIN_PRIOR = 5;
export const CONVERSION_DROP = 0.25;
export const GAP_MIN_IMPRESSIONS = 5000;
export const GAP_MIN_CLICKS = 100;
export const GAP_MIN_SPAN_DAYS = 13;
export const STALE_MIN_DAYS = 5;
export const STALE_MAX_DAYS = 30;
export const FREQUENCY_MIN_UNIQUE = 1000;
export const FREQUENCY_CAP_DEFAULT = 5;
export const OUTLIER_MIN_IMPRESSIONS = 5000;
export const OUTLIER_RATIO = 0.5;

export type DailySlice = {
  id: string;
  campaignId: string;
  campaignName: string;
  clientId: string;
  clientName: string;
  status: string;
  date: string;
  impressions: number;
  clicks: number;
  conversions: number;
};

export type CtvDaySlice = {
  clientId: string;
  clientName: string;
  campaignId: string;
  campaignName: string;
  date: string;
  impressions: number;
  uniqueImpressions: number;
  exampleData?: boolean;
};

export type BreakdownSlice = {
  clientId: string;
  clientName: string;
  dimension: string;
  name: string;
  impressions: number;
  visits: number;
  exampleData?: boolean;
};

export type AlertSlice = {
  id: string;
  adId: string;
  adName: string;
  campaignId: string;
  clientId: string;
  clientName: string;
  code: string;
  severity: string;
  title: string;
  metric: string;
  baseline: string;
  observed: string;
  windowStart: string;
  windowEnd: string;
  sampleSize: number;
  sourceMetricIds: string[];
  archivedAt?: string | null;
};

export type DecisionDraft = {
  type: string;
  rule: string;
  severity: "info" | "warning" | "high" | "critical";
  clientId: string;
  clientName: string;
  campaignId: string | null;
  adId: string | null;
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
  evidence: Record<string, unknown>;
  steps: string[];
  dedupeKey: string;
  writesAds: false;
  changesSpend: false;
  budgetWrite: "none";
};

export type RuleInput = {
  end: string;
  frequencyCap?: number;
  daily?: readonly DailySlice[];
  ctvDays?: readonly CtvDaySlice[];
  breakdowns?: readonly BreakdownSlice[];
  alerts?: readonly AlertSlice[];
};

const NO_WRITE = { writesAds: false as const, changesSpend: false as const, budgetWrite: "none" as const };

function fixed(value: number) {
  if (!Number.isFinite(value)) return "n/a";
  return value.toFixed(4);
}

function daysBetween(start: string, end: string) {
  const a = Date.parse(`${start}T00:00:00.000Z`);
  const b = Date.parse(`${end}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

function inRange(date: string, start: string, end: string) {
  return date >= start && date <= end;
}

function makeDraft(input: Omit<DecisionDraft, "dedupeKey" | "writesAds" | "changesSpend" | "budgetWrite"> & { scope: string }): DecisionDraft {
  const { scope, ...rest } = input;
  return {
    ...rest,
    ...NO_WRITE,
    dedupeKey: recommendationDedupeKey({
      type: input.type,
      clientId: input.clientId,
      campaignId: scope,
      adId: input.adId || "",
      rule: input.rule,
    }),
    evidence: {
      ...input.evidence,
      rule: input.rule,
      steps: input.steps,
      writesAds: false,
      changesSpend: false,
      budgetWrite: "none",
    },
  };
}

function sumDaily(rows: readonly DailySlice[]) {
  const totals = { impressions: 0, clicks: 0, conversions: 0, ids: [] as string[] };
  for (const row of rows) {
    totals.impressions += row.impressions;
    totals.clicks += row.clicks;
    totals.conversions += row.conversions;
    if (row.id) totals.ids.push(row.id);
  }
  return totals;
}

function byKey<T>(rows: readonly T[], key: (row: T) => string) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    if (!id) continue;
    const list = map.get(id) ?? [];
    list.push(row);
    map.set(id, list);
  }
  return map;
}

function ctrDrafts(rows: readonly DailySlice[], end: string) {
  const recentStart = addDaysISO(end, -13);
  const priorEnd = addDaysISO(recentStart, -1);
  const priorStart = addDaysISO(priorEnd, -13);
  const drafts: DecisionDraft[] = [];
  for (const [campaignId, mine] of byKey(rows, (row) => row.campaignId)) {
    const sample = mine[0];
    if (!sample) continue;
    const recent = sumDaily(mine.filter((row) => inRange(row.date, recentStart, end)));
    const prior = sumDaily(mine.filter((row) => inRange(row.date, priorStart, priorEnd)));
    if (recent.impressions < CTR_MIN_IMPRESSIONS || prior.impressions < CTR_MIN_IMPRESSIONS) continue;
    const recentCtr = recent.clicks / recent.impressions;
    const priorCtr = prior.clicks / prior.impressions;
    if (!(priorCtr > 0) || recentCtr > priorCtr * (1 - CTR_DROP)) continue;
    drafts.push(
      makeDraft({
        type: "ctr_drift",
        rule: "ctr_drift",
        severity: recentCtr <= priorCtr * 0.5 ? "high" : "warning",
        clientId: sample.clientId,
        clientName: sample.clientName,
        campaignId,
        adId: null,
        scope: campaignId,
        title: `${sample.campaignName} click rate fell`,
        summary: `${sample.clientName}: click rate for the last 14 days is below the 14 days before.`,
        rationale: "Compared the last 14 days of stored daily metrics with the prior 14 days.",
        metric: "ctr",
        baseline: fixed(priorCtr),
        observed: fixed(recentCtr),
        windowStart: recentStart,
        windowEnd: end,
        sampleSize: recent.impressions,
        sourceMetricIds: [...prior.ids, ...recent.ids],
        steps: [
          "Open this campaign in the ad platform.",
          "Compare click rate for the last 14 days with the 14 days before.",
          "Refresh the creative or the audience if the drop is real.",
          "Nothing on this screen changes the campaign.",
        ],
        evidence: {
          metric: "ctr",
          baseline: fixed(priorCtr),
          observed: fixed(recentCtr),
          windowStart: priorStart,
          windowEnd: end,
          priorWindow: { start: priorStart, end: priorEnd },
          recentWindow: { start: recentStart, end },
          sampleSize: recent.impressions,
          priorImpressions: prior.impressions,
          recentImpressions: recent.impressions,
          sourceMetricIds: [...prior.ids, ...recent.ids],
        },
      }),
    );
  }
  return drafts;
}

function conversionDrafts(rows: readonly DailySlice[], end: string) {
  const recentStart = addDaysISO(end, -13);
  const priorEnd = addDaysISO(recentStart, -1);
  const priorStart = addDaysISO(priorEnd, -13);
  const drafts: DecisionDraft[] = [];
  for (const [campaignId, mine] of byKey(rows, (row) => row.campaignId)) {
    const sample = mine[0];
    if (!sample) continue;
    const recent = sumDaily(mine.filter((row) => inRange(row.date, recentStart, end)));
    const prior = sumDaily(mine.filter((row) => inRange(row.date, priorStart, priorEnd)));
    if (recent.clicks < CONVERSION_MIN_CLICKS || prior.clicks < CONVERSION_MIN_CLICKS) continue;
    if (prior.conversions < CONVERSION_MIN_PRIOR) continue;
    const recentRate = recent.conversions / recent.clicks;
    const priorRate = prior.conversions / prior.clicks;
    if (!(priorRate > 0) || recentRate > priorRate * (1 - CONVERSION_DROP)) continue;
    drafts.push(
      makeDraft({
        type: "conversion_drift",
        rule: "conversion_drift",
        severity: recentRate <= priorRate * 0.5 ? "high" : "warning",
        clientId: sample.clientId,
        clientName: sample.clientName,
        campaignId,
        adId: null,
        scope: campaignId,
        title: `${sample.campaignName} conversion rate fell`,
        summary: `${sample.clientName}: conversions per click for the last 14 days are below the 14 days before.`,
        rationale: "Compared stored conversions and clicks for two 14-day windows.",
        metric: "conversion_rate",
        baseline: fixed(priorRate),
        observed: fixed(recentRate),
        windowStart: recentStart,
        windowEnd: end,
        sampleSize: recent.clicks,
        sourceMetricIds: [...prior.ids, ...recent.ids],
        steps: [
          "Open this campaign in the ad platform.",
          "Compare the conversion rate for the last 14 days with the 14 days before.",
          "Check the landing page and the conversion action.",
          "Nothing on this screen changes the campaign.",
        ],
        evidence: {
          metric: "conversion_rate",
          baseline: fixed(priorRate),
          observed: fixed(recentRate),
          windowStart: priorStart,
          windowEnd: end,
          sampleSize: recent.clicks,
          priorConversions: prior.conversions,
          recentConversions: recent.conversions,
          sourceMetricIds: [...prior.ids, ...recent.ids],
        },
      }),
    );
  }
  return drafts;
}

function gapFor(rows: readonly DailySlice[], end: string, label: string, scope: string, rule: string, clientWide: boolean) {
  const start = addDaysISO(end, -13);
  const window = rows.filter((row) => inRange(row.date, start, end));
  if (!window.length) return null;
  const dates = [...new Set(window.map((row) => row.date))].sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!first || !last || daysBetween(first, last) < GAP_MIN_SPAN_DAYS) return null;
  const totals = sumDaily(window);
  if (totals.impressions < GAP_MIN_IMPRESSIONS || totals.clicks < GAP_MIN_CLICKS || totals.conversions !== 0) return null;
  const sample = window[0];
  if (!sample) return null;
  return makeDraft({
    type: "conversion_gap",
    rule,
    severity: "high",
    clientId: sample.clientId,
    clientName: sample.clientName,
    campaignId: clientWide ? null : sample.campaignId,
    adId: null,
    scope,
    title: clientWide ? `${sample.clientName} recorded no conversions` : `${label} recorded no conversions`,
    summary: `${sample.clientName} has impressions and clicks across 14 days and zero conversions.`,
    rationale: "Stored daily metrics show clicks and impressions with no conversions for at least 14 days.",
    metric: "conversions",
    baseline: "0",
    observed: "0",
    windowStart: start,
    windowEnd: end,
    sampleSize: totals.clicks,
    sourceMetricIds: totals.ids,
    steps: [
      "Confirm the pixel or conversion action is still firing.",
      "Open a landing page from this campaign and submit a test.",
      "Check that clicks are reaching the page.",
      "Nothing on this screen changes tracking or the campaign.",
    ],
    evidence: {
      metric: "conversions",
      baseline: "0",
      observed: "0",
      windowStart: start,
      windowEnd: end,
      sampleSize: totals.clicks,
      impressions: totals.impressions,
      clicks: totals.clicks,
      conversions: 0,
      spanDays: daysBetween(first, last),
      sourceMetricIds: totals.ids,
    },
  });
}

function gapDrafts(rows: readonly DailySlice[], end: string) {
  const drafts: DecisionDraft[] = [];
  for (const [campaignId, mine] of byKey(rows, (row) => row.campaignId)) {
    const draft = gapFor(mine, end, mine[0]?.campaignName || "Campaign", campaignId, "conversion_gap", false);
    if (draft) drafts.push(draft);
  }
  for (const [clientId, mine] of byKey(rows, (row) => row.clientId)) {
    const draft = gapFor(mine, end, mine[0]?.clientName || "Client", "", "conversion_gap_client", true);
    if (draft) drafts.push({ ...draft, clientId });
  }
  return drafts;
}

function staleDrafts(rows: readonly DailySlice[], end: string) {
  const campaigns = byKey(rows, (row) => row.campaignId);
  const totals = new Map<string, { clientId: string; conversions: number; impressions: number }>();
  for (const [campaignId, mine] of campaigns) {
    const summed = sumDaily(mine);
    totals.set(campaignId, { clientId: mine[0]?.clientId || "", conversions: summed.conversions, impressions: summed.impressions });
  }
  const drafts: DecisionDraft[] = [];
  for (const [campaignId, mine] of campaigns) {
    const sample = mine[0];
    if (!sample || sample.status !== "active") continue;
    const dates = mine.map((row) => row.date).sort();
    const last = dates[dates.length - 1];
    if (!last) continue;
    const age = daysBetween(last, end);
    if (age < STALE_MIN_DAYS || age > STALE_MAX_DAYS) continue;
    const mineTotals = totals.get(campaignId);
    const peers = [...totals.values()].filter((row) => row.clientId === sample.clientId);
    const top = peers.every(
      (row) =>
        (mineTotals?.conversions ?? 0) > row.conversions ||
        ((mineTotals?.conversions ?? 0) === row.conversions && (mineTotals?.impressions ?? 0) >= row.impressions),
    );
    const summed = sumDaily(mine);
    drafts.push(
      makeDraft({
        type: "stale_campaign",
        rule: "stale_campaign",
        severity: top ? "high" : "warning",
        clientId: sample.clientId,
        clientName: sample.clientName,
        campaignId,
        adId: null,
        scope: campaignId,
        title: top ? `${sample.campaignName} stopped, and it was the top performer` : `${sample.campaignName} stopped reporting`,
        summary: `${sample.clientName}: the campaign is still active and the last stored day is ${age} days old.`,
        rationale: "The newest DailyMetric is between 5 and 30 days old while the campaign status is active.",
        metric: "last_metric_age_days",
        baseline: String(STALE_MIN_DAYS),
        observed: String(age),
        windowStart: last,
        windowEnd: end,
        sampleSize: summed.impressions,
        sourceMetricIds: summed.ids,
        steps: [
          "Confirm this campaign is still supposed to be active.",
          "Look for a delivery, billing, or policy hold in the ad platform.",
          "Nothing on this screen pauses or restarts the campaign.",
        ],
        evidence: {
          metric: "last_metric_age_days",
          baseline: String(STALE_MIN_DAYS),
          observed: String(age),
          windowStart: last,
          windowEnd: end,
          sampleSize: summed.impressions,
          campaignStatus: sample.status,
          topPerformer: top,
          sourceMetricIds: summed.ids,
        },
      }),
    );
  }
  return drafts;
}

function frequencyDrafts(rows: readonly CtvDaySlice[], end: string, cap: number) {
  const start = addDaysISO(end, -29);
  const drafts: DecisionDraft[] = [];
  const groups = byKey(
    rows.filter((row) => !row.exampleData && inRange(row.date, start, end)),
    (row) => `${row.clientId}|${row.campaignId}`,
  );
  for (const [, mine] of groups) {
    const sample = mine[0];
    if (!sample || !sample.campaignId) continue;
    let impressions = 0;
    let unique = 0;
    for (const row of mine) {
      impressions += row.impressions;
      unique += row.uniqueImpressions;
    }
    if (unique < FREQUENCY_MIN_UNIQUE) continue;
    const frequency = impressions / unique;
    if (!(frequency > cap)) continue;
    const scope = `ctv:${sample.campaignId}`;
    drafts.push(
      makeDraft({
        type: "ctv_frequency",
        rule: "ctv_frequency",
        severity: frequency >= cap * 1.5 ? "high" : "warning",
        clientId: sample.clientId,
        clientName: sample.clientName,
        campaignId: null,
        adId: null,
        scope,
        title: `${sample.campaignName} is reaching the same households too often`,
        summary: `${sample.clientName}: frequency over 30 days is above the cap. Recommend 3 to 4 impressions per household per week.`,
        rationale: "Impressions divided by unique impressions on stored CTV delivery days.",
        metric: "frequency",
        baseline: fixed(cap),
        observed: fixed(frequency),
        windowStart: start,
        windowEnd: end,
        sampleSize: unique,
        sourceMetricIds: [],
        steps: [
          "In the CTV platform, set a frequency cap of 3 to 4 impressions per household per week.",
          "Nothing on this screen changes the cap.",
        ],
        evidence: {
          metric: "frequency",
          baseline: fixed(cap),
          observed: fixed(frequency),
          windowStart: start,
          windowEnd: end,
          sampleSize: unique,
          impressions,
          uniqueImpressions: unique,
          externalCampaignId: sample.campaignId,
          recommendedCap: "3-4 per household per week",
        },
      }),
    );
  }
  return drafts;
}

function outlierDrafts(rows: readonly BreakdownSlice[]) {
  const usable = rows.filter((row) => !row.exampleData && (row.dimension === "app" || row.dimension === "publisher") && row.name.trim());
  const normalized = usable.map((row) => ({ ...row, name: normalizeAppName(row.name) })).filter((row) => row.name);
  const groups = byKey(normalized, (row) => `${row.clientId}|${row.dimension}|${row.name.toLowerCase()}`);
  const byClientDimension = byKey(normalized, (row) => `${row.clientId}|${row.dimension}`);
  const drafts: DecisionDraft[] = [];
  for (const [key, mine] of groups) {
    const sample = mine[0];
    if (!sample) continue;
    const impressions = mine.reduce((sum, row) => sum + row.impressions, 0);
    const visits = mine.reduce((sum, row) => sum + row.visits, 0);
    if (impressions < OUTLIER_MIN_IMPRESSIONS) continue;
    const peers = byClientDimension.get(`${sample.clientId}|${sample.dimension}`) ?? [];
    const peerNames = new Set(peers.map((row) => normalizeAppName(row.name).toLowerCase()));
    if (peerNames.size < 2) continue;
    const peerImpressions = peers.reduce((sum, row) => sum + row.impressions, 0);
    const peerVisits = peers.reduce((sum, row) => sum + row.visits, 0);
    if (peerImpressions <= 0 || peerVisits <= 0) continue;
    const rate = (visits / impressions) * 1000;
    const average = (peerVisits / peerImpressions) * 1000;
    if (!(average > 0) || rate >= average * OUTLIER_RATIO) continue;
    const scope = `${sample.dimension}:${sample.name.toLowerCase()}`;
    drafts.push(
      makeDraft({
        type: "ctv_outlier",
        rule: "ctv_outlier",
        severity: rate <= average * 0.25 ? "high" : "warning",
        clientId: sample.clientId,
        clientName: sample.clientName,
        campaignId: null,
        adId: null,
        scope,
        title: `${sample.name} is below the ${sample.dimension} average`,
        summary: `${sample.clientName}: visits per 1,000 impressions are well below the client average.`,
        rationale: "Compared stored CTV breakdown visits per 1,000 impressions with the client average after app-name normalization.",
        metric: "visits_per_1k",
        baseline: fixed(average),
        observed: fixed(rate),
        windowStart: "",
        windowEnd: "",
        sampleSize: impressions,
        sourceMetricIds: [],
        steps: [
          "Review this app or publisher against the client average.",
          "Exclude it in the ad platform if the visit rate stays low.",
          "Nothing on this screen changes targeting.",
        ],
        evidence: {
          metric: "visits_per_1k",
          baseline: fixed(average),
          observed: fixed(rate),
          sampleSize: impressions,
          impressions,
          visits,
          dimension: sample.dimension,
          name: sample.name,
          groupKey: key,
        },
      }),
    );
  }
  return drafts;
}

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, warning: 2, info: 3 };

function groupedAlertDrafts(rows: readonly AlertSlice[]) {
  const open = rows.filter((row) => !row.archivedAt);
  const groups = byKey(open, (row) => `${row.clientId}|${row.campaignId}|${row.code}`);
  const drafts: DecisionDraft[] = [];
  for (const [, mine] of groups) {
    const sample = mine[0];
    if (!sample) continue;
    const worst = [...mine].sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9))[0] ?? sample;
    const severity = worst.severity === "critical" ? "critical" : worst.severity === "high" ? "high" : worst.severity === "info" ? "info" : "warning";
    const ids = [...new Set(mine.flatMap((row) => row.sourceMetricIds))];
    const ads = [...new Set(mine.map((row) => row.adId))];
    drafts.push(
      makeDraft({
        type: "ad_underperformance",
        rule: `ad_alert:${sample.code}`,
        severity,
        clientId: sample.clientId,
        clientName: sample.clientName,
        campaignId: sample.campaignId || null,
        adId: null,
        scope: sample.campaignId,
        title: mine.length === 1 ? sample.title : `${mine.length} ads: ${sample.title}`,
        summary: `${sample.clientName}: ${mine.length} open ${sample.code.replaceAll("_", " ")} alert${mine.length === 1 ? "" : "s"} on this campaign.`,
        rationale: "Grouped from deduped ad alerts. One open recommendation per campaign and alert code.",
        metric: sample.metric,
        baseline: sample.baseline,
        observed: sample.observed,
        windowStart: sample.windowStart,
        windowEnd: sample.windowEnd,
        sampleSize: mine.reduce((sum, row) => sum + row.sampleSize, 0),
        sourceMetricIds: ids,
        steps: [
          "Review the ads listed in the evidence.",
          "Pause or replace the weak ads in the ad platform.",
          "Nothing on this screen changes those ads.",
        ],
        evidence: {
          metric: sample.metric,
          baseline: sample.baseline,
          observed: sample.observed,
          windowStart: sample.windowStart,
          windowEnd: sample.windowEnd,
          sampleSize: mine.reduce((sum, row) => sum + row.sampleSize, 0),
          sourceMetricIds: ids,
          adIds: ads,
          alertIds: mine.map((row) => row.id),
          code: sample.code,
        },
      }),
    );
  }
  return drafts;
}

export function evaluateDecisionRules(input: RuleInput) {
  const cap = input.frequencyCap && input.frequencyCap > 0 ? input.frequencyCap : FREQUENCY_CAP_DEFAULT;
  return [
    ...ctrDrafts(input.daily ?? [], input.end),
    ...conversionDrafts(input.daily ?? [], input.end),
    ...gapDrafts(input.daily ?? [], input.end),
    ...staleDrafts(input.daily ?? [], input.end),
    ...frequencyDrafts(input.ctvDays ?? [], input.end, cap),
    ...outlierDrafts(input.breakdowns ?? []),
    ...groupedAlertDrafts(input.alerts ?? []),
  ];
}

export function budgetSteps() {
  return [
    "A person changes the budget in the ad platform.",
    "Approving here only records the decision.",
    "This screen does not write a budget or send a change to the ad platform.",
  ];
}

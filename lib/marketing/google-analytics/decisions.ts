/**
 * Analytics decision rules read stored rows only.
 * They never write a budget and never call Google Analytics or an ad platform.
 */

import type { DecisionDraft } from "../decisions/rules";
import { recommendationDedupeKey } from "../decisions/key";
import { addDaysISO } from "../../time";

export const GA_SPEND_MIN = 25;
export const GA_SPEND_SESSIONS_MAX = 2;
export const GA_TRAFFIC_MIN_SESSIONS = 100;
export const GA_TRAFFIC_HIGH_SESSIONS = 500;
export const GA_LANDING_PRIOR_MIN = 50;
export const GA_LANDING_DROP = 0.5;
export const GA_SPEND_DAYS = 7;
export const GA_TRAFFIC_DAYS = 14;
export const GA_LANDING_DAYS = 7;

export type AnalyticsSlice = {
  id: string;
  clientId: string;
  clientName: string;
  date: string;
  campaignId: string | null;
  campaignName: string;
  source: string;
  medium: string;
  landingPage: string;
  sessions: number;
  engagedSessions: number;
  conversions: number;
};

export type SpendSlice = {
  id: string;
  clientId: string;
  clientName: string;
  campaignId: string;
  campaignName: string;
  date: string;
  spend: number;
};

const STEPS = [
  "Review the traffic next to this campaign.",
  "A person decides any budget change in the ad platform.",
  "Approving here only records the decision. Nothing is written to Google Analytics or the ad account.",
];

function inRange(date: string, start: string, end: string) {
  return date >= start && date <= end;
}

function dollars(amount: number) {
  return `$${amount.toFixed(2)}`;
}

function draft(input: Omit<DecisionDraft, "dedupeKey" | "writesAds" | "changesSpend" | "budgetWrite"> & { scope: string }): DecisionDraft {
  const { scope, ...rest } = input;
  return {
    ...rest,
    writesAds: false,
    changesSpend: false,
    budgetWrite: "none",
    dedupeKey: recommendationDedupeKey({
      type: input.type,
      clientId: input.clientId,
      campaignId: scope,
      adId: "",
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

function spendWithoutTraffic(analytics: readonly AnalyticsSlice[], spend: readonly SpendSlice[], end: string) {
  const start = addDaysISO(end, -(GA_SPEND_DAYS - 1));
  const measured = new Set(analytics.filter((row) => inRange(row.date, start, end)).map((row) => row.clientId));
  const drafts: DecisionDraft[] = [];
  for (const [campaignId, rows] of byKey(spend.filter((row) => inRange(row.date, start, end)), (row) => row.campaignId)) {
    const sample = rows[0];
    if (!sample || !measured.has(sample.clientId)) continue;
    const spent = rows.reduce((sum, row) => sum + row.spend, 0);
    if (spent < GA_SPEND_MIN) continue;
    const visits = analytics.filter((row) => row.clientId === sample.clientId && row.campaignId === campaignId && inRange(row.date, start, end));
    const sessions = visits.reduce((sum, row) => sum + row.sessions, 0);
    if (sessions > GA_SPEND_SESSIONS_MAX) continue;
    const ids = [...visits.map((row) => row.id), ...rows.map((row) => row.id)].filter(Boolean);
    drafts.push(
      draft({
        type: "ga_spend_without_traffic",
        rule: "ga_spend_without_traffic",
        severity: spent >= 100 && sessions === 0 ? "high" : "warning",
        clientId: sample.clientId,
        clientName: sample.clientName,
        campaignId,
        adId: null,
        scope: campaignId,
        title: `${sample.clientName}: ${sample.campaignName} spent ${dollars(spent)} with little site traffic`,
        summary: `${sample.campaignName} spent ${dollars(spent)} in ${GA_SPEND_DAYS} days and the mapped site recorded ${sessions} matching sessions.`,
        rationale: "Spend is not showing up as site traffic on the mapped property, or the visit is not tagged with this campaign. This recommends a look. It does not change the budget.",
        metric: "spend",
        baseline: GA_SPEND_MIN.toFixed(2),
        observed: spent.toFixed(2),
        windowStart: start,
        windowEnd: end,
        sampleSize: Math.round(spent),
        sourceMetricIds: ids,
        steps: STEPS,
        evidence: {
          spend: Number(spent.toFixed(2)),
          sessions,
          campaignName: sample.campaignName,
          windowStart: start,
          windowEnd: end,
          sourceMetricIds: ids,
        },
      }),
    );
  }
  return drafts;
}

function trafficWithoutConversions(analytics: readonly AnalyticsSlice[], end: string) {
  const start = addDaysISO(end, -(GA_TRAFFIC_DAYS - 1));
  const drafts: DecisionDraft[] = [];
  for (const [clientId, rows] of byKey(analytics.filter((row) => inRange(row.date, start, end)), (row) => row.clientId)) {
    const sample = rows[0];
    if (!sample) continue;
    const sessions = rows.reduce((sum, row) => sum + row.sessions, 0);
    const engaged = rows.reduce((sum, row) => sum + row.engagedSessions, 0);
    const conversions = rows.reduce((sum, row) => sum + row.conversions, 0);
    if (sessions < GA_TRAFFIC_MIN_SESSIONS || conversions > 0) continue;
    const ids = rows.map((row) => row.id).filter(Boolean);
    drafts.push(
      draft({
        type: "ga_traffic_no_conversions",
        rule: "ga_traffic_no_conversions",
        severity: sessions >= GA_TRAFFIC_HIGH_SESSIONS ? "high" : "warning",
        clientId,
        clientName: sample.clientName,
        campaignId: null,
        adId: null,
        scope: clientId,
        title: `${sample.clientName}: site traffic has no conversions`,
        summary: `${sessions} sessions and ${engaged} engaged sessions in ${GA_TRAFFIC_DAYS} days, with no key events.`,
        rationale: "People are reaching the site and none of those sessions are counting as a key event. This recommends a look at the landing page and the conversion tag.",
        metric: "sessions",
        baseline: String(GA_TRAFFIC_MIN_SESSIONS),
        observed: String(sessions),
        windowStart: start,
        windowEnd: end,
        sampleSize: sessions,
        sourceMetricIds: ids,
        steps: STEPS,
        evidence: {
          sessions,
          engagedSessions: engaged,
          conversions: 0,
          windowStart: start,
          windowEnd: end,
          sourceMetricIds: ids,
        },
      }),
    );
  }
  return drafts;
}

function landingDrops(analytics: readonly AnalyticsSlice[], end: string) {
  const recentStart = addDaysISO(end, -(GA_LANDING_DAYS - 1));
  const priorEnd = addDaysISO(recentStart, -1);
  const priorStart = addDaysISO(priorEnd, -(GA_LANDING_DAYS - 1));
  const drafts: DecisionDraft[] = [];
  const groups = new Map<string, AnalyticsSlice[]>();
  for (const row of analytics) {
    const path = row.landingPage.trim();
    if (!path || path === "(not set)") continue;
    const key = `${row.clientId}\u001f${path}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  for (const rows of groups.values()) {
    const sample = rows[0];
    if (!sample) continue;
    const prior = rows.filter((row) => inRange(row.date, priorStart, priorEnd)).reduce((sum, row) => sum + row.sessions, 0);
    const recentRows = rows.filter((row) => inRange(row.date, recentStart, end));
    const recent = recentRows.reduce((sum, row) => sum + row.sessions, 0);
    if (prior < GA_LANDING_PRIOR_MIN || recent > prior * (1 - GA_LANDING_DROP)) continue;
    const ids = rows.filter((row) => inRange(row.date, priorStart, end)).map((row) => row.id).filter(Boolean);
    const drop = prior === 0 ? 0 : (prior - recent) / prior;
    drafts.push(
      draft({
        type: "ga_landing_drop",
        rule: "ga_landing_drop",
        severity: drop >= 0.75 ? "high" : "warning",
        clientId: sample.clientId,
        clientName: sample.clientName,
        campaignId: sample.campaignId,
        adId: null,
        scope: sample.landingPage.slice(0, 180),
        title: `${sample.clientName}: landing page traffic dropped`,
        summary: `${sample.landingPage} fell from ${prior} sessions to ${recent} sessions.`,
        rationale: "Sessions on this landing page dropped against the previous week. This recommends a look. It does not change a campaign.",
        metric: "sessions",
        baseline: String(prior),
        observed: String(recent),
        windowStart: recentStart,
        windowEnd: end,
        sampleSize: prior,
        sourceMetricIds: ids,
        steps: STEPS,
        evidence: {
          landingPage: sample.landingPage,
          priorSessions: prior,
          sessions: recent,
          windowStart: recentStart,
          windowEnd: end,
          sourceMetricIds: ids,
        },
      }),
    );
  }
  return drafts;
}

export function evaluateAnalyticsDecisions(input: { end: string; analytics?: readonly AnalyticsSlice[]; spend?: readonly SpendSlice[] }) {
  const analytics = input.analytics ?? [];
  const spend = input.spend ?? [];
  return [
    ...spendWithoutTraffic(analytics, spend, input.end),
    ...trafficWithoutConversions(analytics, input.end),
    ...landingDrops(analytics, input.end),
  ];
}

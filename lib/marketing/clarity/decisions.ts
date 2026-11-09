/**
 * Clarity decision rules read stored rows only.
 * They never write a budget and never call Clarity or an ad platform.
 * The paid-landing rule is the only one that reads spend. It stays staff-only.
 */

import type { DecisionDraft } from "../decisions/rules";
import { recommendationDedupeKey } from "../decisions/key";
import { addDaysISO } from "../../time";

export const CLARITY_WINDOW_DAYS = 3;
export const CLARITY_PAID_SPEND_MIN = 50;
export const CLARITY_PAID_MIN_SESSIONS = 200;
export const CLARITY_RAGE_MIN = 10;
export const CLARITY_RAGE_RATE = 8;
export const CLARITY_DEAD_MIN = 15;
export const CLARITY_DEAD_RATE = 10;
export const CLARITY_SCROLL_MIN_SESSIONS = 300;
export const CLARITY_SCROLL_MAX = 15;
export const CLARITY_QUICKBACK_MIN_SESSIONS = 150;
export const CLARITY_QUICKBACK_MIN = 30;
export const CLARITY_QUICKBACK_RATE = 35;

export type ClaritySlice = {
  id: string;
  clientId: string;
  clientName: string;
  date: string;
  url: string;
  source: string;
  medium: string;
  campaignName: string;
  campaignId: string | null;
  sessions: number;
  scrollDepth: number | null;
  rageClicks: number;
  deadClicks: number;
  quickbacks: number;
};

export type ClaritySpendSlice = {
  id: string;
  clientId: string;
  campaignId: string;
  campaignName: string;
  date: string;
  spend: number;
};

const UNNAMED = new Set(["", "(not set)", "(none)", "(direct)", "(organic)", "(referral)", "(cross-network)", "(data not available)"]);

const STEPS = [
  "Open the page in Clarity and watch the sessions on that URL.",
  "A person decides any change in the ad platform.",
  "Approving here only records the decision. Nothing is written to Clarity or the ad account.",
];

function inRange(date: string, start: string, end: string) {
  return date >= start && date <= end;
}

function named(value: string) {
  const trimmed = value.trim();
  return Boolean(trimmed) && !UNNAMED.has(trimmed.toLowerCase());
}

function rate(clicks: number, sessions: number) {
  if (sessions <= 0) return 0;
  return (clicks / sessions) * 100;
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

function paidFrustration(rows: readonly ClaritySlice[], spend: readonly ClaritySpendSlice[], start: string, end: string) {
  const drafts: DecisionDraft[] = [];
  const spentByCampaign = new Map<string, { spent: number; name: string; ids: string[] }>();
  for (const row of spend) {
    if (!inRange(row.date, start, end)) continue;
    const current = spentByCampaign.get(row.campaignId) ?? { spent: 0, name: row.campaignName, ids: [] };
    current.spent += row.spend;
    if (row.id) current.ids.push(row.id);
    spentByCampaign.set(row.campaignId, current);
  }
  const measured = rows.filter((row) => inRange(row.date, start, end) && row.campaignId && named(row.url));
  for (const [key, group] of byKey(measured, (row) => `${row.clientId}\u001f${row.campaignId}\u001f${row.url}`)) {
    const sample = group[0];
    if (!sample?.campaignId) continue;
    const paid = spentByCampaign.get(sample.campaignId);
    if (!paid || paid.spent < CLARITY_PAID_SPEND_MIN) continue;
    const sessions = group.reduce((sum, row) => sum + row.sessions, 0);
    const rage = group.reduce((sum, row) => sum + row.rageClicks, 0);
    const dead = group.reduce((sum, row) => sum + row.deadClicks, 0);
    if (sessions < CLARITY_PAID_MIN_SESSIONS) continue;
    const rageRate = rate(rage, sessions);
    const deadRate = rate(dead, sessions);
    const rageHigh = rage >= CLARITY_RAGE_MIN && rageRate >= CLARITY_RAGE_RATE;
    const deadHigh = dead >= CLARITY_DEAD_MIN && deadRate >= CLARITY_DEAD_RATE;
    if (!rageHigh && !deadHigh) continue;
    const ids = [...group.map((row) => row.id), ...paid.ids].filter(Boolean);
    const severe = paid.spent >= 200 && sessions >= 400 && (rageRate >= 12 || deadRate >= 15);
    drafts.push(
      draft({
        type: "clarity_paid_frustration",
        rule: "clarity_paid_frustration",
        severity: severe ? "high" : "warning",
        clientId: sample.clientId,
        clientName: sample.clientName,
        campaignId: sample.campaignId,
        adId: null,
        scope: key.slice(0, 180),
        title: `${sample.clientName}: paid landing page has high rage or dead clicks`,
        summary: `${sample.url} on ${paid.name} spent ${dollars(paid.spent)} across ${sessions} sessions, with ${rage} rage clicks and ${dead} dead clicks.`,
        rationale: "People who reached this paid URL are rage-clicking or dead-clicking. This recommends a look. It does not change the budget.",
        metric: "spend",
        baseline: CLARITY_PAID_SPEND_MIN.toFixed(2),
        observed: paid.spent.toFixed(2),
        windowStart: start,
        windowEnd: end,
        sampleSize: sessions,
        sourceMetricIds: ids,
        steps: STEPS,
        evidence: {
          spend: Number(paid.spent.toFixed(2)),
          sessions,
          rageClicks: rage,
          deadClicks: dead,
          url: sample.url,
          campaignName: paid.name,
          windowStart: start,
          windowEnd: end,
          sourceMetricIds: ids,
        },
      }),
    );
  }
  return drafts;
}

function lowScroll(rows: readonly ClaritySlice[], start: string, end: string) {
  const drafts: DecisionDraft[] = [];
  const measured = rows.filter((row) => inRange(row.date, start, end) && named(row.url) && named(row.campaignName));
  for (const group of byKey(measured, (row) => `${row.clientId}\u001f${row.campaignName}\u001f${row.url}`).values()) {
    const sample = group[0];
    if (!sample) continue;
    const sessions = group.reduce((sum, row) => sum + row.sessions, 0);
    let weight = 0;
    let depth = 0;
    for (const row of group) {
      if (row.scrollDepth === null) continue;
      weight += row.sessions;
      depth += row.scrollDepth * row.sessions;
    }
    if (sessions < CLARITY_SCROLL_MIN_SESSIONS || weight < CLARITY_SCROLL_MIN_SESSIONS) continue;
    const average = weight ? depth / weight : null;
    if (average === null || average > CLARITY_SCROLL_MAX) continue;
    const ids = group.map((row) => row.id).filter(Boolean);
    drafts.push(
      draft({
        type: "clarity_low_scroll",
        rule: "clarity_low_scroll",
        severity: sessions >= 500 && average <= 10 ? "high" : "warning",
        clientId: sample.clientId,
        clientName: sample.clientName,
        campaignId: sample.campaignId,
        adId: null,
        scope: `${sample.campaignName}\u001f${sample.url}`.slice(0, 180),
        title: `${sample.clientName}: campaign page has low scroll depth`,
        summary: `${sample.url} on ${sample.campaignName} had ${sessions} sessions and scroll depth of ${average.toFixed(0)}%.`,
        rationale: "A busy campaign page is not being scrolled. This recommends a look at the page. It does not change a campaign.",
        metric: "scrollDepth",
        baseline: String(CLARITY_SCROLL_MAX),
        observed: average.toFixed(1),
        windowStart: start,
        windowEnd: end,
        sampleSize: sessions,
        sourceMetricIds: ids,
        steps: STEPS,
        evidence: {
          sessions,
          scrollDepth: Number(average.toFixed(1)),
          url: sample.url,
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

function quickbacks(rows: readonly ClaritySlice[], start: string, end: string) {
  const drafts: DecisionDraft[] = [];
  const measured = rows.filter((row) => inRange(row.date, start, end) && named(row.url) && named(row.campaignName));
  for (const group of byKey(measured, (row) => `${row.clientId}\u001f${row.url}`).values()) {
    const sample = group[0];
    if (!sample) continue;
    const sessions = group.reduce((sum, row) => sum + row.sessions, 0);
    const backs = group.reduce((sum, row) => sum + row.quickbacks, 0);
    const quickRate = rate(backs, sessions);
    if (sessions < CLARITY_QUICKBACK_MIN_SESSIONS || backs < CLARITY_QUICKBACK_MIN || quickRate < CLARITY_QUICKBACK_RATE) continue;
    const ids = group.map((row) => row.id).filter(Boolean);
    drafts.push(
      draft({
        type: "clarity_quickback",
        rule: "clarity_quickback",
        severity: sessions >= 250 && quickRate >= 45 ? "high" : "warning",
        clientId: sample.clientId,
        clientName: sample.clientName,
        campaignId: sample.campaignId,
        adId: null,
        scope: sample.url.slice(0, 180),
        title: `${sample.clientName}: ad page has a high quickback rate`,
        summary: `${sample.url} had ${backs} quick backs across ${sessions} sessions (${quickRate.toFixed(0)}%).`,
        rationale: "People are leaving this ad URL almost immediately. This recommends a look at the page. It does not change a campaign.",
        metric: "quickbacks",
        baseline: String(CLARITY_QUICKBACK_RATE),
        observed: quickRate.toFixed(1),
        windowStart: start,
        windowEnd: end,
        sampleSize: sessions,
        sourceMetricIds: ids,
        steps: STEPS,
        evidence: {
          sessions,
          quickbacks: backs,
          url: sample.url,
          windowStart: start,
          windowEnd: end,
          sourceMetricIds: ids,
        },
      }),
    );
  }
  return drafts;
}

export function evaluateClarityDecisions(input: { end: string; clarity?: readonly ClaritySlice[]; spend?: readonly ClaritySpendSlice[] }) {
  const start = addDaysISO(input.end, -(CLARITY_WINDOW_DAYS - 1));
  const rows = input.clarity ?? [];
  const spend = input.spend ?? [];
  return [...paidFrustration(rows, spend, start, input.end), ...lowScroll(rows, start, input.end), ...quickbacks(rows, start, input.end)];
}

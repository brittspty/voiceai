import type { RealStatus } from "../real-view";
import { readableDecisionTitle, softenSummary } from "./labels";

const COST_METRICS = new Set([
  "spend",
  "cpa",
  "cpl",
  "cpc",
  "cpm",
  "cpx",
  "cpql",
  "roas",
  "budget",
  "bid",
  "roi",
  "cost",
  "pacing",
]);
const COST_TYPES = new Set(["budget_change", "roi", "pacing"]);
const COST_KEY = /^(spend|cpa|cpl|cpc|cpm|cpx|cpql|roas|budget|bid|cost|roi|currentbudgetamount|proposedbudgetamount|proposedcurrency|conversionvalue)$/i;

export type DecisionCard = {
  id: string;
  type: string;
  rule: string;
  status: string;
  severity: string;
  clientId: string;
  clientName: string;
  campaignId: string | null;
  campaignName: string;
  campaignStatus: string;
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
  recency: string;
  snoozedUntil: string | null;
  archivedAt: string | null;
  steps: string[];
};

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, warning: 2, info: 3 };
export const CLOSED_DECISION_STATUSES = new Set(["accepted", "resolved", "dismissed", "declined"]);
const MONEY_WORD = /\$[\d,]+(?:\.\d+)?|\b(?:spend|cost|cpa|cpl|roas|budget)\b/gi;

function scrubText(value: string) {
  return value.replace(MONEY_WORD, "").replace(/\s{2,}/g, " ").replace(/\s+([,.;:])/g, "$1").trim();
}

function observedCtr(card: { metric: string; observed: string }) {
  if (card.metric !== "ctr") return null;
  const raw = Number(card.observed);
  if (!Number.isFinite(raw)) return null;
  return raw > 1 ? raw / 100 : raw;
}

export function isCostDecision(card: { type: string; metric: string }) {
  return COST_TYPES.has(card.type) || COST_METRICS.has(card.metric);
}

export function isRoasDecision(card: { metric: string }) {
  return card.metric === "roas";
}

function stripValue(value: unknown, seesCost: boolean, hasLeadValue: boolean): unknown {
  if (Array.isArray(value)) return value.map((item) => stripValue(item, seesCost, hasLeadValue));
  if (!value || typeof value !== "object") return value;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (!seesCost && COST_KEY.test(key)) continue;
    if (!hasLeadValue && key.toLowerCase() === "roas") continue;
    next[key] = stripValue(child, seesCost, hasLeadValue);
  }
  return next;
}

/** Cost cards stay with staff who can see cost. ROAS stays hidden until a lead value is set. */
export function presentDecisions<T extends DecisionCard>(
  cards: readonly T[],
  input: { seesCost: boolean; hasLeadValue: boolean },
): T[] {
  const shown: T[] = [];
  for (const card of cards) {
    if (!input.seesCost && isCostDecision(card)) continue;
    if (!input.hasLeadValue && isRoasDecision(card)) continue;
    const evidence = stripValue(card.evidence, input.seesCost, input.hasLeadValue);
    const title = readableDecisionTitle(card.title);
    const summary = softenSummary(card.summary, observedCtr(card));
    shown.push({
      ...card,
      title: input.seesCost ? title : scrubText(title),
      summary: input.seesCost ? summary : scrubText(summary),
      rationale: input.seesCost ? card.rationale : scrubText(card.rationale),
      baseline: input.seesCost ? card.baseline : scrubText(card.baseline),
      observed: input.seesCost ? card.observed : scrubText(card.observed),
      evidence: (evidence && typeof evidence === "object" ? evidence : {}) as Record<string, unknown>,
    });
  }
  return shown;
}

export function viewerLine(canAct: boolean, email: string) {
  return canAct ? `Signed in as ${email}` : `View only — signed in as ${email}`;
}

export function visibleDecisionActions(status: string, canAct: boolean) {
  if (!canAct) return [] as string[];
  const open = status === "draft" || status === "verified";
  const actions: string[] = [];
  if (open) actions.push("Approve", "Dismiss", "Snooze");
  if (open || status === "accepted") actions.push("Mark resolved");
  return actions;
}

export function filterDecisionRows<T extends DecisionCard>(
  rows: readonly T[],
  input: { clientId: string | null; dates: readonly string[]; status: RealStatus; now: string; bucket?: "open" | "closed" },
) {
  const start = input.dates[0] || "";
  const end = input.dates[input.dates.length - 1] || "";
  const bucket = input.bucket ?? "open";
  return rows.filter((row) => {
    if (row.archivedAt) return false;
    const today = input.now.slice(0, 10);
    if (bucket === "closed") {
      if (!CLOSED_DECISION_STATUSES.has(row.status)) return false;
    } else {
      if (row.status !== "draft" && row.status !== "verified") return false;
      if (row.snoozedUntil && row.snoozedUntil >= today) return false;
    }
    if (input.clientId && row.clientId !== input.clientId) return false;
    if (input.status) {
      const campaignStatus = row.campaignStatus || "active";
      if (campaignStatus !== input.status) return false;
    }
    if (start && end) {
      const rowStart = row.windowStart || row.recency.slice(0, 10);
      const rowEnd = row.windowEnd || rowStart;
      if (!rowStart || rowStart > end || rowEnd < start) return false;
    }
    return true;
  });
}

export type DecisionGroup = {
  clientId: string;
  clientName: string;
  items: DecisionCard[];
};

/** Groups follow the severity of their first item, then how recent that item is. */
export function groupDecisions(cards: readonly DecisionCard[]): DecisionGroup[] {
  const sorted = [...cards].sort((a, b) => {
    const rank = (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
    if (rank) return rank;
    return b.recency.localeCompare(a.recency) || a.title.localeCompare(b.title);
  });
  const groups = new Map<string, DecisionGroup>();
  for (const card of sorted) {
    const key = card.clientId || "unassigned";
    const group = groups.get(key) ?? { clientId: key, clientName: card.clientName || "Unassigned", items: [] };
    group.items.push(card);
    groups.set(key, group);
  }
  return [...groups.values()];
}

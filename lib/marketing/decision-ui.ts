import { PACING_FIXED_LINE } from "./pacing";

export const BUDGET_FIXED_LINE =
  "Budgets are set by people only. Approving records your OK and gives you the steps. The platform will not change this budget.";

const BANNED = [/we'll change/i, /auto-adjust/i, /the bot will update/i, /\bapply\b/i];

export type DecisionInput = {
  id: string;
  type: string;
  status: string;
  title: string;
  summary: string;
  rationale: string;
  metric: string;
  baseline: string;
  observed: string;
  windowStart: string;
  windowEnd: string;
  sampleSize: number;
  sourceCount: number;
  createdAt?: string;
  decidedAt?: string | null;
  decisionNote?: string | null;
  confidence?: number | null;
  assigneeUserId?: string | null;
  action?: string | null;
  currentBudgetAmount?: number | null;
  proposedBudgetAmount?: number | null;
  proposedCurrency?: string | null;
  proposedBudgetPeriod?: string | null;
  verifierNote?: string | null;
  setByName?: string | null;
};

export function confidenceLabel(sampleSize: number) {
  const score = Math.max(40, Math.min(96, Math.round(50 + Math.log10(Math.max(sampleSize, 10)) * 18)));
  const band = score >= 85 ? "High" : score >= 60 ? "Medium" : "Low";
  return `${band} · ${score}%`;
}

export function cardExpiry(input: DecisionInput, now: Date) {
  const start = Date.parse(input.createdAt || now.toISOString());
  const urgent = input.type === "traffic";
  const hours = urgent ? 2 : 24;
  const ends = start + hours * 60 * 60 * 1000;
  return { ends, expired: now.getTime() > ends, urgent };
}

function usd(amount: number) {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: Number.isInteger(amount) ? 0 : 2 });
}

export function budgetCardCopy(input: DecisionInput) {
  const current = input.currentBudgetAmount ?? 0;
  const next = input.proposedBudgetAmount ?? current;
  const delta = next - current;
  const pct = current ? Math.round((delta / current) * 100) : 0;
  const unit = input.proposedBudgetPeriod === "lifetime" ? " lifetime" : "/day";
  const sign = delta >= 0 ? "+" : "−";
  return {
    tag: "Budget change · You make this change",
    headline: input.title,
    why: input.summary,
    current: `${usd(current)}${unit}`,
    recommended: `${usd(next)}${unit}`,
    change: `${sign}${usd(Math.abs(delta))} (${delta >= 0 ? "+" : ""}${pct}%)`,
    setBy: input.setByName ? `set by ${input.setByName}` : input.currentBudgetAmount != null ? "" : "No one has set this yet",
    fixed: BUDGET_FIXED_LINE,
  };
}

export function expiryLabel(ends: number, now: number) {
  const left = ends - now;
  if (left <= 0) return "Expired";
  const hours = Math.floor(left / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  return `expires in ${hours}h ${minutes}m`;
}

export function budgetNeedsSuperAdmin(proposed: number | null | undefined, cap: number) {
  return proposed != null && proposed > cap;
}

export function windowLabel(start?: string, end?: string) {
  if (!start || !end) return "";
  return `${start} to ${end}`;
}

export function plainCardLine(input: Pick<DecisionInput, "metric" | "title" | "summary" | "baseline" | "observed">) {
  const base = Number(input.baseline);
  const seen = Number(input.observed);
  const fellByHalf = Number.isFinite(base) && Number.isFinite(seen) && base > 0 && seen > 0 && seen <= base * 0.6;
  if (input.metric === "ctr" || /click/i.test(input.title)) {
    return fellByHalf ? "Fewer clicks than your other ads. Clicks fell by about half." : "Fewer clicks than your other ads.";
  }
  if (input.metric === "cpc" || input.metric === "cpm" || input.metric === "cpa" || input.metric === "cpl") {
    return "This ad costs more than your other ads.";
  }
  return input.summary.replace(/vs siblings/gi, "than your other ads").replace(/half baseline/gi, "about half");
}

export function decisionVisibleText(input: DecisionInput) {
  if (input.type === "budget_change") {
    const copy = budgetCardCopy(input);
    return [copy.tag, copy.headline, copy.why, copy.fixed, "Approve and get steps", "Decline", "Later"].join(" ");
  }
  if (input.type === "pacing") {
    const copy = pacingCardCopy(input);
    return [copy.tag, copy.headline, copy.why, copy.fixed, "Recommendation only", "Approve and get steps", "Decline", "Later"].join(" ");
  }
  if (input.type === "creative_fatigue") {
    const copy = fatigueCardCopy(input);
    return [copy.tag, copy.headline, copy.fix, copy.current, copy.proposed, copy.fixed, "Approve new version", "Decline", "Later"].join(" ");
  }
  if (input.type === "ad_fatigue" || input.type === "stackadapt" || input.type === "business_profile") {
    return [input.title, input.summary, input.rationale, "Yes", "No"].join(" ");
  }
  return [input.title, input.summary, "Approve", "Decline", "Later", "Show evidence"].join(" ");
}

export function budgetCopyIsClean(text: string) {
  return !BANNED.some((pattern) => pattern.test(text));
}

export function canApproveCard(input: DecisionInput, now: Date) {
  if (input.status !== "verified") return false;
  return !cardExpiry(input, now).expired;
}

const COST_DECISION_TYPES = new Set(["budget_change", "roi", "pacing"]);
const COST_DECISION_METRICS = new Set(["cpc", "cpm", "cpa", "cpl", "budget", "roi", "spend", "cost", "pacing", "roas"]);

export function pacingCardCopy(input: DecisionInput) {
  const steps = input.rationale
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\d+\./.test(line))
    .map((line) => line.replace(/^\d+\.\s*/, ""));
  return {
    tag: "Recommendation only · You make this change",
    headline: input.title,
    why: input.summary,
    fixed: PACING_FIXED_LINE,
    steps,
  };
}

export function fatigueCardCopy(input: DecisionInput) {
  const lines = input.rationale.split("\n").map((line) => line.trim()).filter(Boolean);
  const current = lines.find((line) => line.startsWith("Current:"))?.slice("Current:".length).trim();
  const proposed = lines.find((line) => line.startsWith("Proposed:"))?.slice("Proposed:".length).trim();
  const missing = lines.some((line) => line === "Preview not available");
  return {
    tag: "Creative tired · AM approves",
    headline: input.title,
    fix: input.summary || "Approve a new version to test against it.",
    current: current || "Preview not available",
    proposed: missing && !proposed ? "Preview not available" : proposed || "Preview not available",
    fixed: "Approving queues a draft for a person to upload. Nothing goes live on its own.",
  };
}

export function decisionIsOpen(card: DecisionInput, now: Date) {
  if (card.status === "verified" && canApproveCard(card, now)) return true;
  if (card.status === "accepted" && (card.type === "pacing" || card.type === "budget_change") && card.decisionNote !== "done") return true;
  if (card.status === "accepted" && card.type === "creative_fatigue" && card.decidedAt) {
    return now.getTime() - Date.parse(card.decidedAt) < 30_000;
  }
  return false;
}

const RECOMMEND_ONLY = new Set(["ad_fatigue", "stackadapt", "business_profile"]);

export function inboxMeta(evidence: unknown) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return { assigneeUserId: null as string | null, confidence: null as number | null, action: null as string | null };
  }
  const row = evidence as { assigneeUserId?: unknown; confidence?: unknown; action?: unknown };
  const confidence = typeof row.confidence === "number" && Number.isFinite(row.confidence) ? row.confidence : null;
  return {
    assigneeUserId: typeof row.assigneeUserId === "string" && row.assigneeUserId ? row.assigneeUserId : null,
    confidence,
    action: typeof row.action === "string" ? row.action : null,
  };
}

export function visibleDecisionCards<T extends { type: string; metric: string; assigneeUserId?: string | null }>(
  cards: T[],
  input: {
    seesCost: boolean;
    monitor: boolean;
    fatigue: boolean;
    pacing: boolean;
    adFatigue?: boolean;
    stackAdapt?: boolean;
    gbp?: boolean;
    userId?: string | null;
    isSuperAdmin?: boolean;
  },
) {
  return cards.filter((card) => {
    if (RECOMMEND_ONLY.has(card.type)) {
      const enabled =
        (card.type === "ad_fatigue" && input.adFatigue) ||
        (card.type === "stackadapt" && input.stackAdapt) ||
        (card.type === "business_profile" && input.gbp);
      if (!enabled) return false;
      if (!input.seesCost && COST_DECISION_METRICS.has(card.metric)) return false;
      if (input.isSuperAdmin) return true;
      return Boolean(input.userId && card.assigneeUserId && card.assigneeUserId === input.userId);
    }
    if (card.type === "creative_fatigue") {
      if (!input.fatigue) return false;
      if (!input.seesCost && COST_DECISION_METRICS.has(card.metric)) return false;
      return true;
    }
    if (card.type === "pacing") return input.pacing && input.seesCost;
    if (!input.monitor) return false;
    if (!input.seesCost && (COST_DECISION_TYPES.has(card.type) || COST_DECISION_METRICS.has(card.metric))) return false;
    return true;
  });
}

export function batchApproveAllowed(cards: { type: string; tier: string }[]) {
  if (!cards.length) return { ok: false, reason: "Select at least one decision." };
  if (cards.some((card) => card.type === "budget_change" || card.type === "pacing" || card.type === "creative_fatigue" || RECOMMEND_ONLY.has(card.type))) {
    return { ok: false, reason: "Budget cards are not included in a batch." };
  }
  const type = cards[0]?.type;
  const tier = cards[0]?.tier;
  if (cards.some((card) => card.type !== type || card.tier !== tier)) {
    return { ok: false, reason: "Batch approve needs the same type and the same tier." };
  }
  return { ok: true, reason: "" };
}

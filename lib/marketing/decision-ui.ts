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
  return [input.title, input.summary, "Approve", "Decline", "Later", "Show evidence"].join(" ");
}

export function budgetCopyIsClean(text: string) {
  return !BANNED.some((pattern) => pattern.test(text));
}

export function canApproveCard(input: DecisionInput, now: Date) {
  if (input.status !== "verified") return false;
  return !cardExpiry(input, now).expired;
}

export function batchApproveAllowed(cards: { type: string; tier: string }[]) {
  if (!cards.length) return { ok: false, reason: "Select at least one decision." };
  if (cards.some((card) => card.type === "budget_change")) return { ok: false, reason: "Budget cards are not included in a batch." };
  const type = cards[0]?.type;
  const tier = cards[0]?.tier;
  if (cards.some((card) => card.type !== type || card.tier !== tier)) {
    return { ok: false, reason: "Batch approve needs the same type and the same tier." };
  }
  return { ok: true, reason: "" };
}

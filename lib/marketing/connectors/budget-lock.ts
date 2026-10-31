/**
 * No code path may send a budget, bid, or spend cap to Meta or Google.
 * Workers and other bots may only store recommendations. A person changes
 * the number in the ad account. This app never sends that change.
 */

export const BUDGET_MUTATION_ENDPOINTS = [
  "campaignBudgets:mutate",
  "accountBudgetProposals:mutate",
  "biddingStrategies:mutate",
  "campaignBidModifiers:mutate",
  "adGroupBidModifiers:mutate",
] as const;

export const BUDGET_MUTATION_FIELDS = [
  "daily_budget",
  "lifetime_budget",
  "bid_amount",
  "bid_strategy",
  "bid_constraints",
  "spend_cap",
  "daily_spend_cap",
  "lifetime_spend_cap",
  "amount_micros",
  "total_amount_micros",
  "cpc_bid_micros",
  "cpm_bid_micros",
  "cpv_bid_micros",
  "target_cpa_micros",
  "target_roas",
  "spending_limit_micros",
  "campaign_budget",
  "bidding_strategy",
  "amountMicros",
  "totalAmountMicros",
  "cpcBidMicros",
  "cpmBidMicros",
  "cpvBidMicros",
  "targetCpaMicros",
  "targetRoas",
  "spendingLimitMicros",
  "campaignBudget",
  "biddingStrategy",
  "bidConstraints",
  "campaignBudgetRecommendation",
] as const;

const FIELD_CANON = new Set(BUDGET_MUTATION_FIELDS.map((field) => canon(field)));

/** Read payloads may name these keys. Their values are not writes. */
const READ_VALUE_KEYS = new Set(["fields", "query", "filtering", "timerange", "actionattributionwindows"]);

export class AdBudgetWriteBlockedError extends Error {
  constructor(detail: string) {
    super(`Blocked a budget, bid, or spend cap write to an ad platform (${detail}). Bots may only create recommendations.`);
    this.name = "AdBudgetWriteBlockedError";
  }
}

export type AdBudgetWrite = {
  method?: string;
  url?: string;
  body?: unknown;
  params?: unknown;
};

function canon(value: string) {
  return value.replace(/[_\-\s.]/g, "").toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pairs(value: unknown): [string, unknown][] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return pairs(JSON.parse(trimmed) as unknown);
      } catch {
        return [];
      }
    }
    if (trimmed.includes("=")) return [...new URLSearchParams(trimmed).entries()];
    return [];
  }
  if (typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams) return [...value.entries()];
  if (Array.isArray(value)) return value.flatMap((item) => pairs(item));
  if (isRecord(value)) return Object.entries(value);
  return [];
}

function maskHasField(value: string) {
  return value.split(",").some((part) => {
    const token = canon(part);
    if (!token || token === "status") return false;
    for (const field of FIELD_CANON) {
      if (token === field || token.includes(field)) return true;
    }
    return false;
  });
}

function walk(value: unknown, hits: string[]) {
  for (const [key, child] of pairs(value)) {
    const normalized = canon(key);
    if (FIELD_CANON.has(normalized)) {
      hits.push(key);
      continue;
    }
    if (normalized === "updatemask" && typeof child === "string" && maskHasField(child)) {
      hits.push(child);
      continue;
    }
    if (READ_VALUE_KEYS.has(normalized)) continue;
    if (child && typeof child === "object") walk(child, hits);
  }
}

/** Returns the blocked endpoint or field, or null when the call is not a budget write. */
export function adBudgetWriteIssue(input: AdBudgetWrite) {
  const url = input.url || "";
  for (const endpoint of BUDGET_MUTATION_ENDPOINTS) {
    if (url.includes(endpoint)) return endpoint;
  }
  const hits: string[] = [];
  if (url) {
    try {
      walk(Object.fromEntries(new URL(url).searchParams.entries()), hits);
    } catch {
      // A relative or invalid URL has no search params to inspect.
    }
  }
  walk(input.params, hits);
  walk(input.body, hits);
  return hits[0] ?? null;
}

export function assertNoAdBudgetWrite(input: AdBudgetWrite) {
  const issue = adBudgetWriteIssue(input);
  if (issue) throw new AdBudgetWriteBlockedError(issue);
}

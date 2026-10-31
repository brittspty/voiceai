/**
 * No automated path may send a budget, bid, or spend cap to an ad platform.
 * Workers and other bots may only store recommendations.
 * Meta and Google numbers are changed by a person in the ad account.
 * ChatGPT Ads budget and bid fields, and going live, are refused unless the
 * human staff route passes `CHATGPT_ADS_STAFF_GRANT` for api.ads.openai.com.
 * Creating an object with status active stays refused. Launch is the activate action.
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
  "lifetime_spend_limit_micros",
  "max_bid_micros",
  "lifetimeSpendLimitMicros",
  "maxBidMicros",
  "bid_multiplier_micros",
  "bidMultiplierMicros",
] as const;

/** Human form fields for ChatGPT Ads. The staff grant skips only these, and only on that host. */
export const CHATGPT_ADS_BUDGET_FIELDS = [
  "lifetime_spend_limit_micros",
  "max_bid_micros",
  "lifetimeSpendLimitMicros",
  "maxBidMicros",
  "bid_multiplier_micros",
  "bidMultiplierMicros",
] as const;

/** Only the human staff route may pass this into a ChatGPT Ads write. */
export const CHATGPT_ADS_STAFF_GRANT = Symbol.for("jarvis.chatgptAds.staffHumanGrant");

const CHATGPT_ADS_HOST = "api.ads.openai.com";
const CHATGPT_BUDGET_CANON = new Set(CHATGPT_ADS_BUDGET_FIELDS.map((field) => canon(field)));

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
  /** Present only when the human staff route is sending a ChatGPT Ads create or launch. */
  staffGrant?: symbol;
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

function chatgptAdsHost(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === CHATGPT_ADS_HOST;
  } catch {
    return false;
  }
}

function activatePath(url: string) {
  try {
    return /\/activate$/.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function isWriteMethod(method: string | undefined) {
  const verb = (method || "GET").toUpperCase();
  return verb !== "GET" && verb !== "HEAD";
}

function isActiveStatus(value: unknown) {
  if (typeof value !== "string") return false;
  const token = value.trim().toLowerCase();
  return token === "active" || token === "enabled" || token === "live";
}

function walk(value: unknown, hits: string[], skip: Set<string>, blockActive: boolean) {
  for (const [key, child] of pairs(value)) {
    const normalized = canon(key);
    if (FIELD_CANON.has(normalized)) {
      if (!skip.has(normalized)) hits.push(key);
      continue;
    }
    if (blockActive && normalized === "status" && isActiveStatus(child)) {
      hits.push("launch");
      continue;
    }
    if (normalized === "updatemask" && typeof child === "string" && maskHasField(child)) {
      hits.push(child);
      continue;
    }
    if (READ_VALUE_KEYS.has(normalized)) continue;
    if (child && typeof child === "object") walk(child, hits, skip, blockActive);
  }
}

/** Returns the blocked endpoint or field, or null when the call is not a budget write. */
export function adBudgetWriteIssue(input: AdBudgetWrite) {
  const url = input.url || "";
  for (const endpoint of BUDGET_MUTATION_ENDPOINTS) {
    if (url.includes(endpoint)) return endpoint;
  }
  const onChatgptAds = chatgptAdsHost(url);
  const staffOk = input.staffGrant === CHATGPT_ADS_STAFF_GRANT && onChatgptAds;
  const skip = staffOk ? CHATGPT_BUDGET_CANON : new Set<string>();
  const blockActive = isWriteMethod(input.method) && onChatgptAds;
  if (blockActive && activatePath(url) && !staffOk) return "launch";
  const hits: string[] = [];
  if (url) {
    try {
      walk(Object.fromEntries(new URL(url).searchParams.entries()), hits, skip, blockActive);
    } catch {
      // A relative or invalid URL has no search params to inspect.
    }
  }
  walk(input.params, hits, skip, blockActive);
  walk(input.body, hits, skip, blockActive);
  return hits[0] ?? null;
}

/** Staff writes still go through the lock. A missing grant is refused before the body is judged. */
export function assertStaffChatgptWrite(input: AdBudgetWrite) {
  if (input.staffGrant !== CHATGPT_ADS_STAFF_GRANT || !chatgptAdsHost(input.url || "")) {
    throw new AdBudgetWriteBlockedError("staff route");
  }
  assertNoAdBudgetWrite(input);
}

export function assertNoAdBudgetWrite(input: AdBudgetWrite) {
  const issue = adBudgetWriteIssue(input);
  if (issue) throw new AdBudgetWriteBlockedError(issue);
}

import { projectWithoutSpend } from "../spend-access";

const COST_KEY = /(spend|budget|cpc|cpm|cpa|cpl|cpql|roas|cost|revenue|conversionvalue|currencyamount|bid)/i;

export type CostAudience = "staff" | "client" | "share";

export function isCostKey(key: string) {
  return COST_KEY.test(key.replace(/[_-]/g, ""));
}

export function collectsCostKeys(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectsCostKeys(item, keys);
    return keys;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (isCostKey(key)) keys.push(key);
      collectsCostKeys(child, keys);
    }
  }
  return keys;
}

/** Staff keeps every field. Everyone else gets the safe-field allowlist, so a new money field stays hidden. */
export function stripForAudience<T>(value: T, audience: CostAudience): T {
  if (audience === "staff") return value;
  return projectWithoutSpend(value);
}

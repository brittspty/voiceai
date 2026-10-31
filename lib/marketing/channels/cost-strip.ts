const COST_KEY = /(spend|budget|cpc|cpm|cpa|cpl|cpql|roas|cost|revenue|conversionvalue|currencyamount)/i;

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

/** Removes spend, budget, cost, and ROAS for client roles and share links. Staff keeps them. */
export function stripForAudience<T>(value: T, audience: CostAudience): T {
  if (audience === "staff") return value;
  return stripValue(value) as T;
}

function stripValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripValue);
  if (!value || typeof value !== "object") return value;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (isCostKey(key)) continue;
    next[key] = stripValue(child);
  }
  return next;
}

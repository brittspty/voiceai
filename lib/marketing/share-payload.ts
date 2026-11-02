import { omitForbiddenClientFields, REPORT_COST_TEXT } from "./client-view";
import { stripForAudience, type CostAudience } from "./channels/cost-strip";

function scrubShareText(value: unknown): unknown {
  if (typeof value === "string") return REPORT_COST_TEXT.test(value) ? undefined : value;
  if (Array.isArray(value)) return value.map(scrubShareText).filter((item) => item !== undefined);
  if (value instanceof Date) return value;
  if (!value || typeof value !== "object") return value;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const cleaned = scrubShareText(child);
    if (cleaned === undefined) continue;
    next[key] = cleaned;
  }
  return next;
}

/** Client and share payloads lose spend, cost, CPL, CPQL, CPA, ROAS, and budget. */
export function presentForAudience<T>(value: T, audience: CostAudience): T {
  if (audience === "staff") return value;
  return scrubShareText(omitForbiddenClientFields(stripForAudience(value, audience))) as T;
}

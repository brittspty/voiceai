import { omitForbiddenClientFields } from "./client-view";
import { stripForAudience, type CostAudience } from "./channels/cost-strip";

export type P1Reader = "staff" | "client" | "share";

const CLIENT_ROLES = new Set(["viewer", "client_viewer", "all_clients_viewer", "demo_viewer"]);
const HIDDEN_KEY = /^(vendor|vendorname|vendors|matchrate|matchrates|platformmatch|platforms)$/i;

/** Staff-only routes. Client roles are 403. A missing role is 401. */
export function staffOnlyStatus(role: string | null | undefined): 401 | 403 | 200 {
  if (!role) return 401;
  if (CLIENT_ROLES.has(role)) return 403;
  return 200;
}

export function readerFor(access: { seesCost: boolean; kind: string }): "staff" | "client" {
  if (access.kind === "client_viewer" || access.kind === "client_owner" || access.kind === "none" || !access.seesCost) return "client";
  return "staff";
}

function hideValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(hideValue);
  if (!value || typeof value !== "object") return value;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (HIDDEN_KEY.test(key.replace(/[_-]/g, ""))) continue;
    next[key] = hideValue(child);
  }
  return next;
}

/** Drops vendor names and match rates for client and share readers. */
export function hideVendorFields<T>(value: T, reader: P1Reader): T {
  if (reader === "staff") return value;
  return hideValue(value) as T;
}

/** Staff keeps cost fields. Client and share payloads lose them. */
export function forReader<T>(value: T, reader: P1Reader): T {
  const hidden = hideVendorFields(value, reader);
  if (reader === "staff") return hidden;
  const audience: CostAudience = reader === "share" ? "share" : "client";
  return omitForbiddenClientFields(stripForAudience(hidden, audience));
}

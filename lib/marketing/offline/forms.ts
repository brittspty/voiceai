import { isMetaEventName } from "./types";

const MAX_CENTS = 100_000_000;

export function parseDollarsToCents(raw: string): number | null | "invalid" {
  const trimmed = raw.trim().replace(/[$,]/g, "");
  if (!trimmed) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return "invalid";
  const cents = Math.round(Number(trimmed) * 100);
  if (!Number.isFinite(cents) || cents > MAX_CENTS) return "invalid";
  return cents;
}

export function cleanLabel(raw: string, max = 120) {
  return raw.trim().replace(/\s+/g, " ").slice(0, max);
}

export function cleanMetaEvent(raw: string) {
  const value = raw.trim();
  return isMetaEventName(value) ? value : null;
}

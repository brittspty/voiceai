import type { ReportCompare } from "../types";

/** `yoy` is honored only while Reports P1 is on. Otherwise it stays the prior period. */
export function resolveReportCompare(raw: string, enabled: boolean): ReportCompare {
  if (raw === "none") return "none";
  if (raw === "yoy" && enabled) return "yoy";
  return "prior";
}

/** EXAMPLE DATA stand-in for the same span one year earlier. */
export function yearAgoValue(value: number, index: number) {
  return Math.max(0, Math.round(value * 0.71 + (index % 4)));
}

export function compareNoun(compare: ReportCompare) {
  if (compare === "yoy") return "same period last year";
  if (compare === "none") return "none";
  return "prior period";
}

/** Staff label when a money figure was not reported. Clients never receive the field. */
export const STAFF_MONEY_MISSING = "n/a";

export const STAFF_MONEY_MISSING_TIP =
  "No spend reported for this period yet, or this channel's spend unit isn't set.";

export const SPEND_TOTAL_NOTE = "Total excludes channels with no spend reported.";

/** Staff display. null, undefined, and NaN stay n/a. Never coerced to $0. */
export function money(amount: number | null | undefined, currency = "USD") {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return STAFF_MONEY_MISSING;
  try {
    return amount.toLocaleString("en-US", { style: "currency", currency });
  } catch {
    return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
  }
}

/** Sum only reported numbers. A null row is skipped, not treated as zero. */
export function sumReportedMoney(values: Array<number | null | undefined>) {
  let total = 0;
  let any = false;
  let skipped = false;
  for (const value of values) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      skipped = true;
      continue;
    }
    any = true;
    total += value;
  }
  return { total: any ? total : null, skipped };
}

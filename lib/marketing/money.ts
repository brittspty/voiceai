const ZERO_DECIMAL = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);
const THREE_DECIMAL = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);

export function currencyExponent(currency: string) {
  const code = currency.trim().toUpperCase();
  if (THREE_DECIMAL.has(code)) return 3;
  if (ZERO_DECIMAL.has(code)) return 0;
  return 2;
}

/** Meta budgets arrive in minor units. Insights spend is already major units. */
export function minorToMajor(minor: string | number | null | undefined, currency: string) {
  if (minor === null || minor === undefined || minor === "") return null;
  const amount = typeof minor === "number" ? minor : Number(minor);
  if (!Number.isFinite(amount)) return null;
  const major = amount / 10 ** currencyExponent(currency);
  return major.toFixed(4);
}

export function decimalString(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return "0.0000";
  return amount.toFixed(4);
}

export function intString(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount < 0) return "0";
  return String(Math.round(amount));
}

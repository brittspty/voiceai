export function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export function normalizePhone(input: string) {
  const trimmed = input.trim();
  const digits = digitsOnly(trimmed);
  if (!digits) return "";
  if (trimmed.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

export function maskPhone(phone: string) {
  const digits = digitsOnly(phone);
  const last4 = (digits.slice(-4) || "0000").padStart(4, "0");
  return `(\u00b7\u00b7\u00b7) \u00b7\u00b7\u00b7-${last4}`;
}

export function samePhone(a: string, b: string) {
  return digitsOnly(a) === digitsOnly(b);
}

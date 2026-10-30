import { createHash } from "node:crypto";
import { normalizePhone } from "../../phone";

export function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Meta: trim, lowercase, SHA-256. Dots in the local part stay. */
export function hashEmailForMeta(email: string) {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at < 1 || at === normalized.length - 1) return "";
  return sha256Hex(normalized);
}

/** Meta: E.164 first so a 10-digit US number includes country code 1, then drop the plus. */
export function hashPhoneForMeta(phone: string) {
  const e164 = normalizePhone(phone);
  const digits = e164.replace(/\D/g, "");
  if (!e164.startsWith("+") || digits.length < 8 || digits.length > 15) return "";
  return sha256Hex(digits);
}

/** Google: trim, lowercase, and Gmail dots / plus-tags removed, then SHA-256. */
export function hashEmailForGoogle(email: string) {
  let normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at < 1 || at === normalized.length - 1) return "";
  let local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.split("+")[0]?.replace(/\./g, "") ?? "";
    normalized = `${local}@gmail.com`;
  }
  if (!local) return "";
  return sha256Hex(normalized);
}

/** Google: E.164 with the leading plus, then SHA-256. */
export function hashPhoneForGoogle(phone: string) {
  const e164 = normalizePhone(phone);
  const digits = e164.replace(/\D/g, "");
  if (!e164.startsWith("+") || digits.length < 8 || digits.length > 15) return "";
  return sha256Hex(e164);
}

export function hashContact(email: string | null | undefined, phone: string | null | undefined) {
  const safeEmail = email?.trim() ?? "";
  const safePhone = phone?.trim() ?? "";
  return {
    emailHashMeta: safeEmail ? hashEmailForMeta(safeEmail) : "",
    emailHashGoogle: safeEmail ? hashEmailForGoogle(safeEmail) : "",
    phoneHashMeta: safePhone ? hashPhoneForMeta(safePhone) : "",
    phoneHashGoogle: safePhone ? hashPhoneForGoogle(safePhone) : "",
  };
}

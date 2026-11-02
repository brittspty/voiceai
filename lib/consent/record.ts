import { hashEmailForMeta, hashPhoneForMeta } from "../marketing/offline/hash";
import { hashIp } from "../marketing/ctv/quality";
import { normalizePhone } from "../phone";
import { CONSENT_WORDING_VERSION, exactWordingText, wordingHash } from "./copy";
import type { ChoiceAction, ChoiceLevel } from "./levels";

export type StoredChoice = {
  id?: string;
  createdAt: string;
  level: ChoiceLevel;
  action: ChoiceAction;
};

export type ContactMatchInput = {
  email?: string | null;
  phone?: string | null;
  ghlContactId?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
};

const ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;
const CLIENT_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function clientKeyIssue(key: string) {
  return CLIENT_PATTERN.test(key.trim()) ? null : "Unknown client.";
}

export function visitorIdIssue(value: string) {
  return ID_PATTERN.test(value.trim()) ? null : "A visitor id is required.";
}

export function normalizePageUrl(raw: string) {
  const url = new URL(raw);
  url.hash = "";
  url.username = "";
  url.password = "";
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) url.pathname = url.pathname.slice(0, -1);
  return url.toString();
}

export function pageUrlIssue(raw: unknown) {
  if (typeof raw !== "string" || raw.length < 8 || raw.length > 500) return "Enter a page URL.";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "Enter a page URL.";
    return null;
  } catch {
    return "Enter a page URL.";
  }
}

function clip(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return "";
  return trimmed;
}

/**
 * Consent rows are kept indefinitely. There is no retention date and no purge job.
 * The log stays append-only: insert a choice, and let the latest row win.
 */
export const CONSENT_RECORD_RETENTION = "indefinite" as const;

function formEmail(email: string | null | undefined) {
  const normalized = (email || "").trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at < 1 || at === normalized.length - 1) return "";
  return normalized;
}

function formPhone(phone: string | null | undefined) {
  const e164 = normalizePhone(phone || "");
  const digits = e164.replace(/\D/g, "");
  if (!e164.startsWith("+") || digits.length < 8 || digits.length > 15) return "";
  return digits;
}

/**
 * Every tie Jason asked for on Nov 2, 2026: the form email and phone, the hashed email and phone,
 * click ids, and the CRM id. A contact matches when any one key overlaps.
 */
export function matchKeysFromContact(contact: ContactMatchInput) {
  const keys: string[] = [];
  const email = formEmail(contact.email);
  if (email) keys.push(`form:email:${email}`);
  const phone = formPhone(contact.phone);
  if (phone) keys.push(`form:phone:${phone}`);
  const emailHash = contact.email ? hashEmailForMeta(contact.email) : "";
  if (emailHash) keys.push(`email:${emailHash}`);
  const phoneHash = contact.phone ? hashPhoneForMeta(contact.phone) : "";
  if (phoneHash) keys.push(`phone:${phoneHash}`);
  const ghl = clip(contact.ghlContactId, 80);
  if (ghl) keys.push(`ghl:${ghl}`);
  const clicks: [string, string | null | undefined][] = [
    ["gclid", contact.gclid],
    ["fbclid", contact.fbclid],
    ["gbraid", contact.gbraid],
    ["wbraid", contact.wbraid],
  ];
  for (const [name, value] of clicks) {
    const trimmed = clip(value, 200);
    if (trimmed) keys.push(`${name}:${trimmed}`);
  }
  return keys;
}

export function keysOverlap(left: readonly string[], right: readonly string[]) {
  if (!left.length || !right.length) return false;
  const known = new Set(left);
  return right.some((key) => known.has(key));
}

export function latestMatchingConsent<T extends StoredChoice & { matchKeys: readonly string[] }>(
  contactKeys: readonly string[],
  records: readonly T[],
): T | null {
  return latestRecord(records.filter((row) => keysOverlap(contactKeys, row.matchKeys)));
}

export function summarizeUserAgent(ua: string) {
  const raw = ua.replace(/\s+/g, " ").trim();
  if (!raw) return "Unknown browser";
  const browser = /Edg\//.test(raw) ? "Edge" : /Chrome\//.test(raw) ? "Chrome" : /Firefox\//.test(raw) ? "Firefox" : /Safari\//.test(raw) ? "Safari" : "Browser";
  const os = /Windows/.test(raw) ? "Windows" : /Mac OS X/.test(raw) ? "Mac" : /Android/.test(raw) ? "Android" : /iPhone|iPad/.test(raw) ? "iOS" : /Linux/.test(raw) ? "Linux" : "Unknown OS";
  return `${browser} on ${os}`.slice(0, 80);
}

/** SHA-256 of the address. The raw address is not stored. */
export function privacyIp(ip: string) {
  const value = ip.trim();
  if (!value || value === "unknown") return "";
  return hashIp(value);
}

export function latestRecord<T extends StoredChoice>(rows: T[]): T | null {
  if (!rows.length) return null;
  return [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || (a.id || "").localeCompare(b.id || "")).at(-1) ?? null;
}

/** Withdrawal and reject both leave no usable consent. A later grant or change replaces them. */
export function effectiveLevel(row: StoredChoice | null): ChoiceLevel | null {
  if (!row) return null;
  if (row.action === "withdraw") return "reject";
  return row.level;
}

export function wordingProof() {
  return {
    wordingVersionId: CONSENT_WORDING_VERSION,
    wordingHash: wordingHash(),
    wordingText: exactWordingText(),
  };
}

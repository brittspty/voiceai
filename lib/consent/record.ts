import { hashEmailForMeta, hashPhoneForMeta } from "../marketing/offline/hash";
import { hashIp } from "../marketing/ctv/quality";
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

/** Hashed email and phone, plus the click and CRM ids this app already stores on a contact. Raw email and phone are not returned. */
export function matchKeysFromContact(contact: ContactMatchInput) {
  const keys: string[] = [];
  const email = contact.email ? hashEmailForMeta(contact.email) : "";
  if (email) keys.push(`email:${email}`);
  const phone = contact.phone ? hashPhoneForMeta(contact.phone) : "";
  if (phone) keys.push(`phone:${phone}`);
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

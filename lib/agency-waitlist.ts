import { syncAgencyWaitlist, type AgencyWaitlistSyncOptions } from "./agency-waitlist-sync";
import { prisma } from "./db";
import { normalizeWorkEmail, WORK_EMAIL_ERROR } from "./magic-link";
import { publicHomepageEnabled, type Env } from "./public-routing";

/** Self-reported ranges. Not results, prices, or claims. */
export const CLIENT_COUNT_OPTIONS = ["1-5", "6-20", "21-50", "More than 50"] as const;
export const MONTHLY_SPEND_OPTIONS = ["Under 25,000", "25,000-100,000", "100,000-500,000", "More than 500,000"] as const;

export const WAITLIST_LIMIT = 8;
export const WAITLIST_WINDOW_MS = 15 * 60 * 1000;
export const WAITLIST_RATE = "Too many attempts. Wait a few minutes and try again.";
export const WAITLIST_REQUIRED = "Enter your name, a work email, and your agency name.";
export const WAITLIST_WEBSITE = "Enter a website like agency.com, or leave it blank.";
export const WAITLIST_RANGE = "Choose a listed range, or leave it blank.";
export const WAITLIST_LONG = "That entry is too long.";

const SAVED = "/?waitlist=saved#agency-waitlist";
const INVALID = "/?waitlist=invalid#agency-waitlist";
const LIMITED = "/?waitlist=limited#agency-waitlist";

export type WaitlistInput = {
  name?: string;
  email?: string;
  agency?: string;
  agencyName?: string;
  website?: string;
  clients?: string;
  clientCount?: string;
  spend?: string;
  monthlySpend?: string;
  message?: string;
  company_fax?: string;
};

export type WaitlistDraft = {
  name: string;
  email: string;
  agencyName: string;
  website: string;
  clientCount: string;
  monthlySpend: string;
  message: string;
};

export type WaitlistStore = {
  create(data: WaitlistDraft): Promise<{ id: string }>;
};

export type WaitlistResult =
  | { status: 404 }
  | { status: 400; error: string }
  | { status: 429; error: string }
  | { status: 500; error: string }
  | { status: 200; id?: string }
  | { status: 303; location: typeof SAVED | typeof INVALID | typeof LIMITED };

const defaultStore: WaitlistStore = {
  create(data) {
    return prisma.agencyWaitlist.create({ data, select: { id: true } });
  },
};

const buckets = new Map<string, { n: number; at: number }>();

export function resetWaitlistLimits() {
  buckets.clear();
}

export function requestIp(header: string | null | undefined) {
  const first = (header || "").split(",")[0]?.trim();
  return first || "local";
}

export function consumeWaitlistLimit(
  store: Map<string, { n: number; at: number }>,
  key: string,
  now: number,
  limit = WAITLIST_LIMIT,
  windowMs = WAITLIST_WINDOW_MS,
) {
  const current = store.get(key);
  const fresh = !current || now - current.at >= windowMs;
  const bucket = fresh ? { n: 1, at: now } : { n: current.n + 1, at: current.at };
  store.set(key, bucket);
  return bucket.n > limit;
}

function text(value: string | undefined) {
  return (value || "").trim();
}

export function cleanWebsite(raw: string) {
  const value = raw.trim();
  if (!value) return "";
  if (value.length > 200 || /[\s<>]/.test(value)) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:/i.test(value)) return null;
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".") || url.hostname.includes("..")) return null;
    return value;
  } catch {
    return null;
  }
}

function cleanChoice(raw: string, allowed: readonly string[]) {
  const value = raw.trim();
  if (!value) return "";
  return allowed.includes(value) ? value : null;
}

export function waitlistDraft(input: WaitlistInput): { ok: true; value: WaitlistDraft } | { ok: false; error: string } {
  const name = text(input.name);
  const agencyName = text(input.agency ?? input.agencyName);
  const message = text(input.message);
  if (!name || !agencyName) return { ok: false, error: WAITLIST_REQUIRED };
  const email = normalizeWorkEmail(input.email || "");
  if (!email) return { ok: false, error: WORK_EMAIL_ERROR };
  if (name.length > 120 || email.length > 200 || agencyName.length > 160 || message.length > 4000) {
    return { ok: false, error: WAITLIST_LONG };
  }
  const website = cleanWebsite(text(input.website));
  if (website === null) return { ok: false, error: WAITLIST_WEBSITE };
  const clientCount = cleanChoice(text(input.clients ?? input.clientCount), CLIENT_COUNT_OPTIONS);
  const monthlySpend = cleanChoice(text(input.spend ?? input.monthlySpend), MONTHLY_SPEND_OPTIONS);
  if (clientCount === null || monthlySpend === null) return { ok: false, error: WAITLIST_RANGE };
  return { ok: true, value: { name, email, agencyName, website, clientCount, monthlySpend, message } };
}

async function deliverWaitlist(row: WaitlistDraft & { id: string }, env: Env, sync: Omit<AgencyWaitlistSyncOptions, "env"> | undefined) {
  try {
    await syncAgencyWaitlist(row, { env, ...sync });
  } catch (error) {
    console.error("[agency-waitlist] sync failed", error instanceof Error ? error.name : "error");
  }
}

/** Writes one row first. GoHighLevel and the alert run after that and cannot fail the visitor. */
export async function acceptAgencyWaitlist(input: {
  fields: WaitlistInput;
  form?: boolean;
  env?: Env;
  store?: WaitlistStore;
  originAllowed?: boolean;
  now?: number;
  ip?: string;
  limits?: Map<string, { n: number; at: number }>;
  sync?: Omit<AgencyWaitlistSyncOptions, "env">;
}): Promise<WaitlistResult> {
  const env = input.env ?? process.env;
  if (!publicHomepageEnabled(env)) return { status: 404 };
  if (input.originAllowed === false) return { status: 400, error: "That request was refused." };
  const now = input.now ?? Date.now();
  const limits = input.limits ?? buckets;
  const ip = input.ip || "local";
  const emailKey = text(input.fields.email).toLowerCase();
  const limited = consumeWaitlistLimit(limits, `ip:${ip}`, now) || (emailKey ? consumeWaitlistLimit(limits, `email:${emailKey}`, now) : false);
  if (limited) {
    if (input.form) return { status: 303, location: LIMITED };
    return { status: 429, error: WAITLIST_RATE };
  }
  if (text(input.fields.company_fax)) {
    if (input.form) return { status: 303, location: SAVED };
    return { status: 400, error: "invalid" };
  }
  const draft = waitlistDraft(input.fields);
  if (!draft.ok) {
    if (input.form) return { status: 303, location: INVALID };
    return { status: 400, error: draft.error };
  }
  const saved = await (input.store ?? defaultStore).create(draft.value);
  await deliverWaitlist({ id: saved.id, ...draft.value }, env, input.sync);
  if (input.form) return { status: 303, location: SAVED };
  return { status: 200, id: saved.id };
}

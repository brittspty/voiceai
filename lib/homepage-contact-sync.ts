import { ghlFetch } from "./adapters";
import { prisma } from "./db";
import { sendDigestEmail } from "./mail";
import type { Env } from "./public-routing";

export const GHL_UPSERT_URL = "https://services.leadconnectorhq.com/contacts/upsert";
export const GHL_API_VERSION = "2021-07-28";
export const GHL_SOURCE = "jai.specificityinc.com Book a demo";
export const GHL_TAGS = ["jai-demo", "website"] as const;
export const SYNC_TIMEOUT_MS = 5_000;

export type HomepageContactLead = {
  id: string;
  name: string;
  email: string;
  company: string;
  message: string;
};

export type HomepageContactSyncPatch = {
  ghlContactId?: string | null;
  ghlSyncedAt?: Date | null;
  ghlError?: string | null;
  alertSentAt?: Date | null;
};

export type SyncLog = {
  warn(message: string): void;
  error(message: string): void;
};

export type HomepageContactSyncResult = {
  ghlAttempted: boolean;
  ghlContactId: string | null;
  ghlError: string | null;
  alertSent: boolean;
  alertSkipped: boolean;
};

export type HomepageContactSyncOptions = {
  env?: Env;
  fetchImpl?: typeof fetch;
  update?: (id: string, data: HomepageContactSyncPatch) => Promise<void>;
  log?: SyncLog;
  now?: () => Date;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Backfill sets this false so old rows are not emailed again. */
  alert?: boolean;
};

const defaultLog: SyncLog = {
  warn(message) {
    console.warn(message);
  },
  error(message) {
    console.error(message);
  },
};

export function splitContactName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

/** Comma-separated DEMO_ALERT_TO. Blank pieces and duplicates are dropped. */
export function demoAlertRecipients(raw: string | undefined) {
  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const part of (raw || "").split(",")) {
    const email = part.trim().toLowerCase();
    if (!email.includes("@") || email.startsWith("@") || email.endsWith("@") || email.includes(" ") || seen.has(email)) continue;
    seen.add(email);
    recipients.push(email);
  }
  return recipients;
}

export function demoAlertMessage(row: Pick<HomepageContactLead, "name" | "email" | "company" | "message">) {
  return {
    subject: `New demo request from ${row.name}`,
    text: [
      `Name: ${row.name}`,
      `Email: ${row.email}`,
      `Company: ${row.company || "—"}`,
      "",
      "Message:",
      row.message,
      "",
      `Source: ${GHL_SOURCE}`,
    ].join("\n"),
  };
}

/** Book a demo uses the existing GoHighLevel key. GHL_API_TOKEN overrides it when set. */
export function homepageGhlKey(env: Env) {
  return env.GHL_API_TOKEN?.trim() || env.GHL_API_KEY?.trim() || "";
}

function ghlConfigured(env: Env) {
  return Boolean(homepageGhlKey(env) && env.GHL_LOCATION_ID?.trim());
}

function redact(text: string, secrets: string[]) {
  let out = text.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  for (const secret of secrets) {
    const value = secret.trim();
    if (value.length < 8) continue;
    out = out.split(value).join("[redacted]");
  }
  return out.slice(0, 500);
}

function isTimeout(error: unknown) {
  if (!error || typeof error !== "object" || !("name" in error)) return false;
  const name = String(error.name);
  return name === "TimeoutError" || name === "AbortError";
}

function failureText(error: unknown, secrets: string[]) {
  if (isTimeout(error)) return "timed out";
  const message = error instanceof Error ? error.message : "request failed";
  return redact(message, secrets);
}

function deadline(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException("The operation timed out", "TimeoutError"));
  }, ms);
  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timer);
    },
  };
}

function contactIdOf(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const nested = record.contact;
  if (nested && typeof nested === "object") {
    const id = (nested as Record<string, unknown>).id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  if (typeof record.id === "string" && record.id.trim()) return record.id.trim();
  if (typeof record.contactId === "string" && record.contactId.trim()) return record.contactId.trim();
  return null;
}

// Upsert matches an existing contact on email. Phone is omitted so email is the only match key.
function upsertPayload(row: HomepageContactLead, locationId: string) {
  const { firstName, lastName } = splitContactName(row.name);
  const body: Record<string, unknown> = {
    locationId,
    email: row.email,
    firstName,
    name: row.name,
    tags: [...GHL_TAGS],
    source: GHL_SOURCE,
  };
  if (lastName) body.lastName = lastName;
  if (row.company) body.companyName = row.company;
  return body;
}

async function defaultUpdate(id: string, data: HomepageContactSyncPatch) {
  await prisma.homepageContact.update({ where: { id }, data });
}

type GhlStep = { attempted: boolean; contactId: string | null; error: string | null };
type MailStep = { sent: boolean; skipped: boolean };

async function upsertContact(input: {
  row: HomepageContactLead;
  env: Env;
  fetchImpl: typeof fetch;
  signal: AbortSignal;
  secrets: string[];
  log: SyncLog;
}): Promise<GhlStep> {
  const apiKey = homepageGhlKey(input.env);
  const locationId = input.env.GHL_LOCATION_ID?.trim() || "";
  if (!apiKey || !locationId) {
    input.log.warn("[homepage-contact] GoHighLevel upsert skipped: GHL_API_KEY or GHL_LOCATION_ID is unset");
    return { attempted: false, contactId: null, error: null };
  }
  let contactId: string | null = null;
  try {
    const upsert = await ghlFetch("/contacts/upsert", {
      method: "POST",
      signal: input.signal,
      body: JSON.stringify(upsertPayload(input.row, locationId)),
    }, { fetchImpl: input.fetchImpl, apiKey });
    contactId = contactIdOf(upsert);
    if (!contactId) {
      const error = "GoHighLevel upsert returned no contact id";
      input.log.error(`[homepage-contact] ${error} for row ${input.row.id}`);
      return { attempted: true, contactId: null, error };
    }
    if (input.signal.aborted) {
      const error = "GoHighLevel note timed out";
      input.log.error(`[homepage-contact] ${error} for row ${input.row.id}`);
      return { attempted: true, contactId, error };
    }
    await ghlFetch(`/contacts/${encodeURIComponent(contactId)}/notes`, {
      method: "POST",
      signal: input.signal,
      body: JSON.stringify({ body: input.row.message }),
    }, { fetchImpl: input.fetchImpl, apiKey });
    return { attempted: true, contactId, error: null };
  } catch (error) {
    const status = error instanceof Error ? /^GoHighLevel (\d{3})/.exec(error.message)?.[1] : undefined;
    if (status) {
      const summary = contactId ? `GoHighLevel note failed (${status})` : `GoHighLevel upsert failed (${status})`;
      input.log.error(`[homepage-contact] ${summary} for row ${input.row.id}`);
      return { attempted: true, contactId, error: summary };
    }
    const detail = failureText(error, input.secrets);
    const summary = detail === "timed out"
      ? contactId ? "GoHighLevel note timed out" : "GoHighLevel request timed out"
      : `GoHighLevel request failed: ${detail}`;
    input.log.error(`[homepage-contact] ${summary} for row ${input.row.id}`);
    return { attempted: true, contactId, error: summary };
  }
}

async function sendAlert(input: {
  row: HomepageContactLead;
  env: Env;
  fetchImpl: typeof fetch;
  signal: AbortSignal;
  secrets: string[];
  log: SyncLog;
  alert: boolean;
}): Promise<MailStep> {
  if (!input.alert) return { sent: false, skipped: true };
  const recipients = demoAlertRecipients(input.env.DEMO_ALERT_TO);
  if (recipients.length === 0) {
    input.log.warn("[homepage-contact] demo alert skipped: DEMO_ALERT_TO is unset");
    return { sent: false, skipped: true };
  }
  if (!input.env.RESEND_API_KEY?.trim() || !input.env.MAIL_FROM?.trim()) {
    input.log.warn("[homepage-contact] demo alert skipped: RESEND_API_KEY or MAIL_FROM is unset");
    return { sent: false, skipped: true };
  }
  const message = demoAlertMessage(input.row);
  try {
    const result = await sendDigestEmail({
      to: recipients,
      subject: message.subject,
      text: message.text,
      env: input.env,
      signal: input.signal,
      fetchImpl: input.fetchImpl,
    });
    if (!result.sent) {
      const status = "status" in result && result.status ? ` (${result.status})` : "";
      input.log.error(`[homepage-contact] demo alert failed${status} for row ${input.row.id}`);
      return { sent: false, skipped: false };
    }
    return { sent: true, skipped: false };
  } catch (error) {
    const detail = failureText(error, input.secrets);
    const summary = detail === "timed out" ? "demo alert timed out" : `demo alert failed: ${detail}`;
    input.log.error(`[homepage-contact] ${summary} for row ${input.row.id}`);
    return { sent: false, skipped: false };
  }
}

/**
 * Upserts the GoHighLevel contact and sends the alert after the row exists.
 * Never throws. Missing configuration is a warning and is skipped.
 * External calls share one ~5s deadline so the visitor response is not held open.
 */
export async function syncHomepageContact(row: HomepageContactLead, options: HomepageContactSyncOptions = {}): Promise<HomepageContactSyncResult> {
  const env = options.env ?? process.env;
  const log = options.log ?? defaultLog;
  const fetchImpl = options.fetchImpl ?? fetch;
  const update = options.update ?? defaultUpdate;
  const now = options.now ?? (() => new Date());
  const secrets = [env.GHL_API_TOKEN || "", env.GHL_API_KEY || "", env.RESEND_API_KEY || "", env.MAIL_FROM || ""];
  const owned = options.signal ? null : deadline(options.timeoutMs ?? SYNC_TIMEOUT_MS);
  const signal = options.signal ?? owned?.signal ?? AbortSignal.timeout(SYNC_TIMEOUT_MS);
  const empty: HomepageContactSyncResult = {
    ghlAttempted: false,
    ghlContactId: null,
    ghlError: null,
    alertSent: false,
    alertSkipped: true,
  };
  try {
    const [ghl, mail] = await Promise.all([
      upsertContact({ row, env, fetchImpl, signal, secrets, log }),
      sendAlert({ row, env, fetchImpl, signal, secrets, log, alert: options.alert !== false }),
    ]);
    const patch: HomepageContactSyncPatch = {};
    if (ghl.attempted) {
      patch.ghlContactId = ghl.contactId;
      patch.ghlSyncedAt = ghl.contactId ? now() : null;
      patch.ghlError = ghl.error;
    }
    if (mail.sent) patch.alertSentAt = now();
    if (Object.keys(patch).length > 0) {
      try {
        await update(row.id, patch);
      } catch (error) {
        log.error(`[homepage-contact] could not record sync status for row ${row.id}: ${failureText(error, secrets)}`);
      }
    }
    return {
      ghlAttempted: ghl.attempted,
      ghlContactId: ghl.contactId,
      ghlError: ghl.error,
      alertSent: mail.sent,
      alertSkipped: mail.skipped,
    };
  } catch (error) {
    log.error(`[homepage-contact] sync failed for row ${row.id}: ${failureText(error, secrets)}`);
    return empty;
  } finally {
    owned?.clear();
  }
}

async function defaultLoad(limit: number): Promise<HomepageContactLead[]> {
  return prisma.homepageContact.findMany({
    where: { ghlContactId: null },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true, name: true, email: true, company: true, message: true },
  });
}

function clampLimit(value: number | undefined) {
  if (value == null || !Number.isFinite(value)) return 100;
  return Math.min(500, Math.max(1, Math.floor(value)));
}

/** Rows with no GoHighLevel contact. Dry run (apply false) does not call the API. */
export async function backfillHomepageContacts(options: HomepageContactSyncOptions & {
  apply?: boolean;
  limit?: number;
  load?: (limit: number) => Promise<HomepageContactLead[]>;
} = {}) {
  const limit = clampLimit(options.limit);
  const log = options.log ?? defaultLog;
  const env = options.env ?? process.env;
  const load = options.load ?? defaultLoad;
  const rows = await load(limit);
  if (!options.apply) return { apply: false as const, candidates: rows.length, synced: 0, failed: 0 };
  if (!ghlConfigured(env)) {
    log.warn("[homepage-contact] backfill skipped: GHL_API_KEY or GHL_LOCATION_ID is unset");
    return { apply: true as const, candidates: rows.length, synced: 0, failed: 0 };
  }
  let synced = 0;
  let failed = 0;
  for (const row of rows) {
    const result = await syncHomepageContact(row, { ...options, env, alert: false });
    if (result.ghlContactId && !result.ghlError) synced += 1;
    else failed += 1;
  }
  return { apply: true as const, candidates: rows.length, synced, failed };
}

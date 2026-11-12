import { ghlFetch } from "./adapters";
import { prisma } from "./db";
import { demoAlertRecipients, homepageGhlKey, splitContactName, SYNC_TIMEOUT_MS, type SyncLog } from "./homepage-contact-sync";
import { sendDigestEmail } from "./mail";
import type { Env } from "./public-routing";

export const WAITLIST_GHL_SOURCE = "jai.specificityinc.com Agency waitlist";
export const WAITLIST_GHL_TAGS = ["jai-agency-waitlist", "website"] as const;
export const WAITLIST_ALERT_SUBJECT = "New jAI agency waitlist signup";

export type AgencyWaitlistLead = {
  id: string;
  name: string;
  email: string;
  agencyName: string;
  website: string;
  clientCount: string;
  monthlySpend: string;
  message: string;
};

export type AgencyWaitlistSyncPatch = {
  ghlContactId?: string | null;
  ghlSyncedAt?: Date | null;
  ghlError?: string | null;
  alertSentAt?: Date | null;
};

export type AgencyWaitlistSyncResult = {
  ghlAttempted: boolean;
  ghlContactId: string | null;
  ghlError: string | null;
  alertSent: boolean;
  alertSkipped: boolean;
};

export type AgencyWaitlistSyncOptions = {
  env?: Env;
  fetchImpl?: typeof fetch;
  update?: (id: string, data: AgencyWaitlistSyncPatch) => Promise<void>;
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

export function waitlistNote(row: Pick<AgencyWaitlistLead, "clientCount" | "monthlySpend" | "message">) {
  const lines: string[] = [];
  if (row.clientCount) lines.push(`Clients: ${row.clientCount}`);
  if (row.monthlySpend) lines.push(`Monthly ad spend: ${row.monthlySpend}`);
  if (row.message) {
    if (lines.length) lines.push("");
    lines.push("Message:");
    lines.push(row.message);
  }
  return lines.join("\n");
}

function shown(value: string) {
  return value.trim() || "not provided";
}

export function waitlistAlertMessage(row: AgencyWaitlistLead) {
  return {
    subject: WAITLIST_ALERT_SUBJECT,
    text: [
      `Name: ${row.name}`,
      `Email: ${row.email}`,
      `Agency: ${row.agencyName}`,
      `Website: ${shown(row.website)}`,
      `Clients: ${shown(row.clientCount)}`,
      `Monthly ad spend: ${shown(row.monthlySpend)}`,
      "",
      "Message:",
      shown(row.message),
      "",
      `Source: ${WAITLIST_GHL_SOURCE}`,
    ].join("\n"),
  };
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

function upsertPayload(row: AgencyWaitlistLead, locationId: string) {
  const { firstName, lastName } = splitContactName(row.name);
  const body: Record<string, unknown> = {
    locationId,
    email: row.email,
    firstName,
    name: row.name,
    companyName: row.agencyName,
    tags: [...WAITLIST_GHL_TAGS],
    source: WAITLIST_GHL_SOURCE,
  };
  if (lastName) body.lastName = lastName;
  if (row.website.trim()) body.website = row.website.trim();
  return body;
}

async function defaultUpdate(id: string, data: AgencyWaitlistSyncPatch) {
  await prisma.agencyWaitlist.update({ where: { id }, data });
}

type GhlStep = { attempted: boolean; contactId: string | null; error: string | null };
type MailStep = { sent: boolean; skipped: boolean };

async function upsertContact(input: {
  row: AgencyWaitlistLead;
  env: Env;
  fetchImpl: typeof fetch;
  signal: AbortSignal;
  secrets: string[];
  log: SyncLog;
}): Promise<GhlStep> {
  const apiKey = homepageGhlKey(input.env);
  const locationId = input.env.GHL_LOCATION_ID?.trim() || "";
  if (!apiKey || !locationId) {
    input.log.warn("[agency-waitlist] GoHighLevel upsert skipped: GHL_API_KEY or GHL_LOCATION_ID is unset");
    return { attempted: false, contactId: null, error: null };
  }
  let contactId: string | null = null;
  const note = waitlistNote(input.row);
  try {
    const upsert = await ghlFetch("/contacts/upsert", {
      method: "POST",
      signal: input.signal,
      body: JSON.stringify(upsertPayload(input.row, locationId)),
    }, { fetchImpl: input.fetchImpl, apiKey });
    contactId = contactIdOf(upsert);
    if (!contactId) {
      const error = "GoHighLevel upsert returned no contact id";
      input.log.error(`[agency-waitlist] ${error} for row ${input.row.id}`);
      return { attempted: true, contactId: null, error };
    }
    if (!note) return { attempted: true, contactId, error: null };
    if (input.signal.aborted) {
      const error = "GoHighLevel note timed out";
      input.log.error(`[agency-waitlist] ${error} for row ${input.row.id}`);
      return { attempted: true, contactId, error };
    }
    await ghlFetch(`/contacts/${encodeURIComponent(contactId)}/notes`, {
      method: "POST",
      signal: input.signal,
      body: JSON.stringify({ body: note }),
    }, { fetchImpl: input.fetchImpl, apiKey });
    return { attempted: true, contactId, error: null };
  } catch (error) {
    const status = error instanceof Error ? /^GoHighLevel (\d{3})/.exec(error.message)?.[1] : undefined;
    if (status) {
      const summary = contactId ? `GoHighLevel note failed (${status})` : `GoHighLevel upsert failed (${status})`;
      input.log.error(`[agency-waitlist] ${summary} for row ${input.row.id}`);
      return { attempted: true, contactId, error: summary };
    }
    const detail = failureText(error, input.secrets);
    const summary = detail === "timed out"
      ? contactId ? "GoHighLevel note timed out" : "GoHighLevel request timed out"
      : `GoHighLevel request failed: ${detail}`;
    input.log.error(`[agency-waitlist] ${summary} for row ${input.row.id}`);
    return { attempted: true, contactId, error: summary };
  }
}

async function sendAlert(input: {
  row: AgencyWaitlistLead;
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
    input.log.warn("[agency-waitlist] alert skipped: DEMO_ALERT_TO is unset");
    return { sent: false, skipped: true };
  }
  if (!input.env.RESEND_API_KEY?.trim() || !input.env.MAIL_FROM?.trim()) {
    input.log.warn("[agency-waitlist] alert skipped: RESEND_API_KEY or MAIL_FROM is unset");
    return { sent: false, skipped: true };
  }
  const message = waitlistAlertMessage(input.row);
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
      input.log.error(`[agency-waitlist] alert failed${status} for row ${input.row.id}`);
      return { sent: false, skipped: false };
    }
    return { sent: true, skipped: false };
  } catch (error) {
    const detail = failureText(error, input.secrets);
    const summary = detail === "timed out" ? "alert timed out" : `alert failed: ${detail}`;
    input.log.error(`[agency-waitlist] ${summary} for row ${input.row.id}`);
    return { sent: false, skipped: false };
  }
}

/**
 * Upserts the GoHighLevel contact and sends the alert after the row exists.
 * Never throws. Missing configuration is a warning and is skipped.
 * External calls share one ~5s deadline so the visitor response is not held open.
 */
export async function syncAgencyWaitlist(row: AgencyWaitlistLead, options: AgencyWaitlistSyncOptions = {}): Promise<AgencyWaitlistSyncResult> {
  const env = options.env ?? process.env;
  const log = options.log ?? defaultLog;
  const fetchImpl = options.fetchImpl ?? fetch;
  const update = options.update ?? defaultUpdate;
  const now = options.now ?? (() => new Date());
  const secrets = [env.GHL_API_TOKEN || "", env.GHL_API_KEY || "", env.RESEND_API_KEY || "", env.MAIL_FROM || ""];
  const owned = options.signal ? null : deadline(options.timeoutMs ?? SYNC_TIMEOUT_MS);
  const signal = options.signal ?? owned?.signal ?? AbortSignal.timeout(SYNC_TIMEOUT_MS);
  const empty: AgencyWaitlistSyncResult = {
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
    const patch: AgencyWaitlistSyncPatch = {};
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
        log.error(`[agency-waitlist] could not record sync status for row ${row.id}: ${failureText(error, secrets)}`);
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
    log.error(`[agency-waitlist] sync failed for row ${row.id}: ${failureText(error, secrets)}`);
    return empty;
  } finally {
    owned?.clear();
  }
}

async function defaultLoad(limit: number): Promise<AgencyWaitlistLead[]> {
  return prisma.agencyWaitlist.findMany({
    where: { ghlContactId: null },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      name: true,
      email: true,
      agencyName: true,
      website: true,
      clientCount: true,
      monthlySpend: true,
      message: true,
    },
  });
}

function clampLimit(value: number | undefined) {
  if (value == null || !Number.isFinite(value)) return 100;
  return Math.min(500, Math.max(1, Math.floor(value)));
}

/** Rows with no GoHighLevel contact. Dry run (apply false) does not call the API and does not send mail. */
export async function backfillAgencyWaitlist(options: AgencyWaitlistSyncOptions & {
  apply?: boolean;
  limit?: number;
  load?: (limit: number) => Promise<AgencyWaitlistLead[]>;
} = {}) {
  const limit = clampLimit(options.limit);
  const log = options.log ?? defaultLog;
  const env = options.env ?? process.env;
  const load = options.load ?? defaultLoad;
  const rows = await load(limit);
  if (!options.apply) return { apply: false as const, candidates: rows.length, synced: 0, failed: 0 };
  if (!ghlConfigured(env)) {
    log.warn("[agency-waitlist] backfill skipped: GHL_API_KEY or GHL_LOCATION_ID is unset");
    return { apply: true as const, candidates: rows.length, synced: 0, failed: 0 };
  }
  let synced = 0;
  let failed = 0;
  for (const row of rows) {
    const result = await syncAgencyWaitlist(row, { ...options, env, alert: false });
    if (result.ghlContactId && !result.ghlError) synced += 1;
    else failed += 1;
  }
  return { apply: true as const, candidates: rows.length, synced, failed };
}

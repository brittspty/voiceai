/**
 * Traxy read client. GET https://api.traxy.ai/api/v1 only.
 * One API key is one workspace. organizationId and workspaceId are refused.
 * Contact fields stay null unless the key has leads:contact_read. This client does not call a reveal or write route.
 */

import type { TraxyFilters } from "./scope";
import { ProspectApiError, ProspectWriteBlockedError, asRecord, httpsUrl, redactProspectSecrets, sanitizeRaw, type FetchLike } from "./guard";

export const TRAXY_ORIGIN = "https://api.traxy.ai";
export const TRAXY_PAGE_LIMIT = 100;
export const TRAXY_MAX_PAGES = 20;

const LIST_PATH = "/api/v1/customer/leads";
const COUNTS_PATH = "/api/v1/customer/leads/counts";
const ONE_PATH = /^\/api\/v1\/customer\/leads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BLOCKED_QUERY = new Set(["organizationid", "workspaceid", "organization_id", "workspace_id"]);

export type MappedPerson = {
  externalId: string;
  displayName: string;
  headline: string;
  company: string;
  location: string;
  emails: string[];
  phones: string[];
  profileUrl: string;
  icpMatchPercent: number | null;
  intentScore: number | null;
  tier: string;
  signal: string;
  seenAt: string | null;
  raw: Record<string, unknown>;
};

export function assertTraxyRead(input: { method: string; url: string }) {
  if (input.method.toUpperCase() !== "GET") {
    throw new ProspectWriteBlockedError("Traxy is read-only. Only GET is allowed.");
  }
  const url = httpsUrl(input.url, "api.traxy.ai");
  const path = url.pathname.replace(/\/$/, "");
  const allowed = path === LIST_PATH || path === COUNTS_PATH || ONE_PATH.test(path);
  if (!allowed || /webhook|campaign|sequence|enrich|reveal|done|subscribe/i.test(path)) {
    throw new ProspectWriteBlockedError("Traxy is read-only. That path is not a lead read.");
  }
  for (const key of url.searchParams.keys()) {
    if (BLOCKED_QUERY.has(key.toLowerCase())) {
      throw new ProspectWriteBlockedError("Traxy is read-only. organizationId and workspaceId are not sent. Use the workspace's own API key.");
    }
  }
  return url.toString();
}

export function traxyLeadsUrl(filters: TraxyFilters, cursor?: string | null) {
  const url = new URL(`${TRAXY_ORIGIN}${LIST_PATH}`);
  url.searchParams.set("limit", String(TRAXY_PAGE_LIMIT));
  if (cursor) url.searchParams.set("cursor", cursor);
  if (filters.monitoredProfileIds.length) url.searchParams.set("monitoredProfileIds", filters.monitoredProfileIds.join(","));
  if (filters.leadTiers.length) url.searchParams.set("leadTiers", filters.leadTiers.join(","));
  if (filters.minIcpMatchPercent != null) url.searchParams.set("minIcpMatchPercent", String(filters.minIcpMatchPercent));
  return assertTraxyRead({ method: "GET", url: url.toString() });
}

function clip(value: string, max = 300) {
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function text(value: unknown) {
  return typeof value === "string" ? clip(value) : "";
}

function emailsOf(...values: unknown[]) {
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const email = value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    emails.push(email);
  }
  return emails.slice(0, 5);
}

function httpsText(value: unknown) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return "";
    return url.toString().slice(0, 500);
  } catch {
    return "";
  }
}

function percent(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 0 || rounded > 100) return null;
  return rounded;
}

export function mapTraxyLead(value: unknown): MappedPerson | null {
  const lead = asRecord(value);
  const externalId = text(lead.id);
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(externalId)) return null;
  const profile = asRecord(lead.profile);
  const contact = asRecord(lead.contact);
  const signal = asRecord(lead.signal);
  const phone = text(contact.contactPhone);
  return {
    externalId,
    displayName: text(profile.displayName) || "Unnamed prospect",
    headline: text(profile.headline),
    company: text(profile.currentCompany),
    location: text(profile.location),
    emails: emailsOf(contact.workEmail, contact.personalEmail),
    phones: phone ? [phone] : [],
    profileUrl: httpsText(profile.profileUrl),
    icpMatchPercent: percent(lead.icpMatchPercent),
    intentScore: typeof lead.intentScore === "number" && Number.isFinite(lead.intentScore) ? lead.intentScore : null,
    tier: text(lead.leadTier),
    signal: text(signal.summary),
    seenAt: typeof signal.occurredAt === "string" ? signal.occurredAt : null,
    raw: sanitizeRaw({
      id: externalId,
      icpMatchPercent: lead.icpMatchPercent ?? null,
      intentScore: lead.intentScore ?? null,
      leadTier: lead.leadTier ?? null,
      profile,
      contact,
      signal,
    }),
  };
}

export async function traxyRequest(input: { apiKey: string; url: string; fetchImpl?: FetchLike }) {
  const url = assertTraxyRead({ method: "GET", url: input.url });
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new ProspectApiError("TRAXY_API_KEY is empty");
  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
      redirect: "error",
    });
  } catch (error) {
    if (error instanceof ProspectWriteBlockedError) throw error;
    throw new ProspectApiError(redactProspectSecrets(error instanceof Error ? error.message : "Traxy request failed", [apiKey]));
  }
  const textBody = await response.text();
  let body: unknown = {};
  if (textBody) {
    try {
      body = JSON.parse(textBody);
    } catch {
      body = {};
    }
  }
  if (!response.ok) {
    throw new ProspectApiError(redactProspectSecrets(`Traxy ${response.status}`, [apiKey]), response.status);
  }
  return body;
}

function nextCursor(body: Record<string, unknown>) {
  const page = asRecord(body.page);
  const next = page.nextCursor;
  return typeof next === "string" && next.trim() ? next.trim() : null;
}

export async function listTraxyLeads(input: { apiKey: string; filters: TraxyFilters; fetchImpl?: FetchLike; maxPages?: number }) {
  const people: MappedPerson[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  let requests = 0;
  const maxPages = input.maxPages ?? TRAXY_MAX_PAGES;
  for (let page = 0; page < maxPages; page += 1) {
    const body = asRecord(await traxyRequest({ apiKey: input.apiKey, url: traxyLeadsUrl(input.filters, cursor), fetchImpl: input.fetchImpl }));
    requests += 1;
    const data = Array.isArray(body.data) ? body.data : [];
    for (const row of data) {
      const mapped = mapTraxyLead(row);
      if (mapped) people.push(mapped);
    }
    const next = nextCursor(body);
    if (!next) return { people, requests, truncated: false };
    if (seenCursors.has(next)) return { people, requests, truncated: true };
    seenCursors.add(next);
    cursor = next;
  }
  return { people, requests, truncated: true };
}

/** Sums a counts payload. Prefers total or count when present so a breakdown is not added twice. */
export function traxyCountTotal(body: unknown): number | null {
  const record = asRecord(body);
  const data = Object.keys(asRecord(record.data)).length ? asRecord(record.data) : record;
  for (const key of ["total", "count", "totalCount"]) {
    const value = data[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  const numbers = Object.values(data).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!numbers.length) return null;
  return numbers.reduce((sum, value) => sum + value, 0);
}

export function traxyDateRange(people: MappedPerson[]) {
  const stamps = people.map((person) => person.seenAt).filter((value): value is string => Boolean(value)).map((value) => new Date(value).getTime()).filter((value) => Number.isFinite(value));
  if (!stamps.length) return { dateFrom: null, dateTo: null };
  return {
    dateFrom: new Date(Math.min(...stamps)).toISOString(),
    dateTo: new Date(Math.max(...stamps)).toISOString(),
  };
}

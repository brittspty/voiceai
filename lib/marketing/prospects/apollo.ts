/**
 * Apollo read client.
 * The sync uses POST /api/v1/contacts/search, which Apollo documents as 0 credits.
 * People match, reveal flags, sequences, email sends, and contact creates are refused before fetch.
 * Saved searches are not queried: the public API has no credit-free saved-search read.
 */

import type { ApolloFilters } from "./scope";
import { ProspectApiError, ProspectWriteBlockedError, asRecord, httpsUrl, redactProspectSecrets, sanitizeRaw, walkKeys, type FetchLike } from "./guard";
import { emailsOfLoose, httpsText, textField } from "./map-fields";

export const APOLLO_ORIGIN = "https://api.apollo.io";
export const APOLLO_PER_PAGE = 100;
export const APOLLO_MAX_PAGES = 20;

const CONTACT_SEARCH = "/api/v1/contacts/search";
const PEOPLE_SEARCH = "/api/v1/mixed_people/api_search";
const HEALTH = "/api/v1/auth/health";
const CONTACT_ONE = /^\/api\/v1\/contacts\/[a-z0-9]{24}$/i;

const CONTACT_SEARCH_KEYS = new Set(["contact_label_ids", "q_keywords", "page", "per_page", "sort_by_field", "sort_ascending"]);
const PEOPLE_SEARCH_KEYS = new Set(["person_titles", "person_locations", "person_seniorities", "organization_ids", "q_keywords", "q_person_name", "page", "per_page"]);
const PEOPLE_NARROWING = ["person_titles", "person_locations", "person_seniorities", "organization_ids", "q_keywords", "q_person_name"];
const BLOCKED_KEY = /reveal|waterfall|webhook|sequence|emailer|enroll|subscribe/i;

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

function nonEmpty(value: unknown) {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some((item) => typeof item === "string" && item.trim());
  return false;
}

export function assertApolloRead(input: { method: string; url: string; body?: unknown }) {
  const method = input.method.toUpperCase();
  if (method !== "GET" && method !== "POST") {
    throw new ProspectWriteBlockedError("Apollo is read-only. Only GET and the documented search reads are allowed.");
  }
  const url = httpsUrl(input.url, "api.apollo.io");
  if ([...url.searchParams.keys()].some((key) => key.toLowerCase() === "api_key")) {
    throw new ProspectWriteBlockedError("Apollo is read-only. The API key stays in the header.");
  }
  const path = url.pathname.replace(/\/$/, "");
  if (/sequence|emailer|webhook|opportunit|tasks|deals|labels|enrich|match/i.test(path)) {
    throw new ProspectWriteBlockedError("Apollo is read-only. That path can change records or spend credits.");
  }
  walkKeys(input.body, (key) => {
    if (BLOCKED_KEY.test(key)) throw new ProspectWriteBlockedError("Apollo is read-only. Reveal, sequence, and webhook fields are blocked.");
  });
  if (method === "GET") {
    if (path === HEALTH || CONTACT_ONE.test(path)) return url.toString();
    throw new ProspectWriteBlockedError("Apollo is read-only. That GET is not a contact or health read.");
  }
  const body = asRecord(input.body);
  if (path === CONTACT_SEARCH) {
    for (const key of Object.keys(body)) {
      if (!CONTACT_SEARCH_KEYS.has(key)) throw new ProspectWriteBlockedError("Apollo contacts search received a field that is not a read filter.");
    }
    return url.toString();
  }
  if (path === PEOPLE_SEARCH) {
    for (const key of Object.keys(body)) {
      if (!PEOPLE_SEARCH_KEYS.has(key)) throw new ProspectWriteBlockedError("Apollo people search received a field that is not a read filter.");
    }
    if (!PEOPLE_NARROWING.some((key) => nonEmpty(body[key]))) {
      throw new ProspectWriteBlockedError("Apollo people search must include a filter. An unscoped database pull is blocked.");
    }
    return url.toString();
  }
  throw new ProspectWriteBlockedError("Apollo is read-only. That path is not a lookup.");
}

export function apolloSearchBody(filters: ApolloFilters, page: number, extra: Record<string, unknown> = {}) {
  return {
    page,
    per_page: APOLLO_PER_PAGE,
    ...(filters.listIds.length ? { contact_label_ids: filters.listIds } : {}),
    ...extra,
  };
}

export function mapApolloContact(value: unknown): MappedPerson | null {
  const contact = asRecord(value);
  const externalId = textField(contact.id);
  if (!/^[A-Za-z0-9]{8,80}$/.test(externalId)) return null;
  const phones = (Array.isArray(contact.phone_numbers) ? contact.phone_numbers : [])
    .map((item) => textField(asRecord(item).sanitized_number) || textField(asRecord(item).raw_number))
    .filter(Boolean)
    .slice(0, 5);
  const location = [contact.city, contact.state, contact.country].map((part) => textField(part)).filter(Boolean).join(", ");
  const name = textField(contact.name) || [textField(contact.first_name), textField(contact.last_name)].filter(Boolean).join(" ");
  return {
    externalId,
    displayName: name || "Unnamed prospect",
    headline: textField(contact.title),
    company: textField(contact.organization_name),
    location,
    emails: emailsOfLoose(contact.email),
    phones,
    profileUrl: httpsText(contact.linkedin_url),
    icpMatchPercent: null,
    intentScore: null,
    tier: "",
    signal: "",
    seenAt: typeof contact.created_at === "string" ? contact.created_at : null,
    raw: sanitizeRaw({
      id: externalId,
      name,
      title: contact.title ?? null,
      organization_name: contact.organization_name ?? null,
      city: contact.city ?? null,
      state: contact.state ?? null,
      country: contact.country ?? null,
      created_at: contact.created_at ?? null,
      label_ids: Array.isArray(contact.label_ids) ? contact.label_ids : [],
    }),
  };
}

export async function apolloRequest(input: { apiKey: string; method: "GET" | "POST"; url: string; body?: unknown; fetchImpl?: FetchLike }) {
  const url = assertApolloRead({ method: input.method, url: input.url, body: input.body });
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new ProspectApiError("APOLLO_API_KEY is empty");
  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: input.method,
      headers: {
        "x-api-key": apiKey,
        accept: "application/json",
        "content-type": "application/json",
        "cache-control": "no-cache",
      },
      body: input.method === "POST" ? JSON.stringify(input.body ?? {}) : undefined,
      redirect: "error",
    });
  } catch (error) {
    if (error instanceof ProspectWriteBlockedError) throw error;
    throw new ProspectApiError(redactProspectSecrets(error instanceof Error ? error.message : "Apollo request failed", [apiKey]));
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
    throw new ProspectApiError(redactProspectSecrets(`Apollo ${response.status}`, [apiKey]), response.status);
  }
  return body;
}

export async function listApolloContacts(input: { apiKey: string; filters: ApolloFilters; fetchImpl?: FetchLike; maxPages?: number }) {
  const people: MappedPerson[] = [];
  let requests = 0;
  const maxPages = input.maxPages ?? APOLLO_MAX_PAGES;
  let truncated = false;
  for (let page = 1; page <= maxPages; page += 1) {
    const body = asRecord(await apolloRequest({
      apiKey: input.apiKey,
      method: "POST",
      url: `${APOLLO_ORIGIN}${CONTACT_SEARCH}`,
      body: apolloSearchBody(input.filters, page),
      fetchImpl: input.fetchImpl,
    }));
    requests += 1;
    const contacts = Array.isArray(body.contacts) ? body.contacts : [];
    for (const row of contacts) {
      const mapped = mapApolloContact(row);
      if (mapped) people.push(mapped);
    }
    const pagination = asRecord(body.pagination);
    const totalPages = typeof pagination.total_pages === "number" ? pagination.total_pages : null;
    if (contacts.length < APOLLO_PER_PAGE) return { people, requests, truncated: false };
    if (totalPages != null && page >= totalPages) return { people, requests, truncated: false };
    if (page === maxPages) truncated = true;
  }
  return { people, requests, truncated };
}

export function apolloCount(body: unknown) {
  const total = asRecord(asRecord(body).pagination).total_entries;
  return typeof total === "number" && Number.isFinite(total) ? total : null;
}

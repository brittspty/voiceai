/**
 * StackAdapt GraphQL client.
 * Reads campaigns, line items, creatives, and daily delivery.
 * Mutations and subscriptions are refused before any network call.
 */

import { assertNoAdBudgetWrite } from "./budget-lock";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const STACKADAPT_ENDPOINT = "https://api.stackadapt.com/graphql";
export const STACKADAPT_MAX_PAGES = 20;

export const STACKADAPT_DELIVERY_QUERY = `
query StackAdaptDelivery($from: ISO8601Date!, $to: ISO8601Date!, $after: String) {
  campaigns(first: 50, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      name
      status
      lineItems(first: 50) {
        nodes {
          id
          name
          status
          creatives(first: 50) {
            nodes { id name status }
          }
          dailyStats(from: $from, to: $to) {
            date
            impressions
            clicks
            conversions
            spend
          }
        }
      }
    }
  }
}
`.trim();

export class StackAdaptWriteBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StackAdaptWriteBlockedError";
  }
}

export class StackAdaptApiError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "StackAdaptApiError";
    this.status = status;
  }
}

export function redactStackAdaptSecrets(value: string, secrets: string[] = []) {
  let redacted = value.replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]");
  for (const secret of secrets) {
    if (secret.trim().length >= 6) redacted = redacted.split(secret).join("[redacted]");
  }
  return redacted;
}

/** Strips comments and string literals, then refuses mutation and subscription operations. */
export function assertStackAdaptReadOnly(document: string) {
  const stripped = document
    .replace(/#[^\n]*/g, " ")
    .replace(/"""[\s\S]*?"""/g, " ")
    .replace(/"(?:\\.|[^"\\])*"/g, " ");
  if (/\bmutation\b/i.test(stripped) || /\bsubscription\b/i.test(stripped)) {
    throw new StackAdaptWriteBlockedError("StackAdapt client is read-only. Mutations and subscriptions are blocked.");
  }
  if (!/\bquery\b/i.test(stripped) && !stripped.includes("{")) {
    throw new StackAdaptWriteBlockedError("StackAdapt client is read-only. Only a GraphQL query is allowed.");
  }
}

export function assertStackAdaptEndpoint(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new StackAdaptWriteBlockedError("StackAdapt client is read-only. The GraphQL URL is invalid.");
  }
  if (url.protocol !== "https:" || url.hostname !== "api.stackadapt.com" || url.pathname !== "/graphql") {
    throw new StackAdaptWriteBlockedError("StackAdapt client is read-only. Only https://api.stackadapt.com/graphql is allowed.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new StackAdaptWriteBlockedError("StackAdapt client is read-only. The GraphQL URL cannot carry credentials or a query string.");
  }
  return url.toString();
}

export async function stackAdaptGraphql(input: {
  apiKey: string;
  query?: string;
  variables?: Record<string, unknown>;
  endpoint?: string;
  fetchImpl?: FetchLike;
}) {
  const query = input.query ?? STACKADAPT_DELIVERY_QUERY;
  const endpoint = assertStackAdaptEndpoint(input.endpoint ?? STACKADAPT_ENDPOINT);
  assertStackAdaptReadOnly(query);
  assertNoAdBudgetWrite({ method: "POST", url: endpoint, body: { query, variables: input.variables ?? {} } });
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new StackAdaptApiError("STACKADAPT_API_KEY is empty");
  const fetchImpl = input.fetchImpl ?? fetch;
  const secrets = [apiKey];
  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ query, variables: input.variables ?? {} }),
      redirect: "error",
    });
  } catch (error) {
    throw new StackAdaptApiError(redactStackAdaptSecrets(error instanceof Error ? error.message : "StackAdapt request failed", secrets));
  }
  const text = await response.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    const message = typeof body === "string" ? body : "StackAdapt request failed";
    throw new StackAdaptApiError(redactStackAdaptSecrets(`StackAdapt ${response.status}: ${message}`.slice(0, 400), secrets), response.status);
  }
  const record = body && typeof body === "object" ? (body as { errors?: { message?: string }[]; data?: unknown }) : {};
  if (Array.isArray(record.errors) && record.errors.length) {
    const message = record.errors.map((error) => error.message || "StackAdapt error").join("; ");
    throw new StackAdaptApiError(redactStackAdaptSecrets(message.slice(0, 400), secrets), response.status);
  }
  return record.data ?? body;
}

function nodes<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object" && Array.isArray((value as { nodes?: T[] }).nodes)) return (value as { nodes: T[] }).nodes;
  return [];
}

export type StackAdaptCreative = { id: string; name: string; status: string };
export type StackAdaptDailyStat = { date: string; impressions: number; clicks: number; conversions: number; spend: number };
export type StackAdaptLineItem = { id: string; name: string; status: string; creatives: StackAdaptCreative[]; dailyStats: StackAdaptDailyStat[] };
export type StackAdaptCampaign = { id: string; name: string; status: string; lineItems: StackAdaptLineItem[] };
export type StackAdaptBundle = { campaigns: StackAdaptCampaign[]; warnings: string[] };

function num(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stat(value: unknown): StackAdaptDailyStat | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const date = text(row.date).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const spend = row.spend ?? row.cost ?? row.costUsd;
  return {
    date,
    impressions: num(row.impressions),
    clicks: num(row.clicks),
    conversions: num(row.conversions),
    spend: num(spend),
  };
}

function creative(value: unknown): StackAdaptCreative | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = text(row.id);
  if (!id) return null;
  return { id, name: text(row.name), status: text(row.status) };
}

function lineItem(value: unknown): StackAdaptLineItem | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = text(row.id);
  if (!id) return null;
  const stats = Array.isArray(row.dailyStats) ? row.dailyStats : nodes(row.dailyStats);
  return {
    id,
    name: text(row.name),
    status: text(row.status),
    creatives: nodes<unknown>(row.creatives).map(creative).filter((row): row is StackAdaptCreative => Boolean(row)),
    dailyStats: stats.map(stat).filter((row): row is StackAdaptDailyStat => Boolean(row)),
  };
}

function campaign(value: unknown): StackAdaptCampaign | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = text(row.id);
  if (!id) return null;
  return {
    id,
    name: text(row.name),
    status: text(row.status),
    lineItems: nodes<unknown>(row.lineItems).map(lineItem).filter((row): row is StackAdaptLineItem => Boolean(row)),
  };
}

export function parseStackAdaptData(data: unknown): StackAdaptCampaign[] {
  const root = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  return nodes<unknown>(root.campaigns).map(campaign).filter((row): row is StackAdaptCampaign => Boolean(row));
}

export async function pullStackAdaptBundle(input: {
  apiKey: string;
  from: string;
  to: string;
  endpoint?: string;
  fetchImpl?: FetchLike;
}): Promise<StackAdaptBundle> {
  const warnings: string[] = [];
  const campaigns: StackAdaptCampaign[] = [];
  let after: string | null = null;
  for (let page = 0; page < STACKADAPT_MAX_PAGES; page += 1) {
    const data = await stackAdaptGraphql({
      apiKey: input.apiKey,
      endpoint: input.endpoint,
      fetchImpl: input.fetchImpl,
      variables: { from: input.from, to: input.to, after },
    });
    campaigns.push(...parseStackAdaptData(data));
    const root = data && typeof data === "object" ? (data as { campaigns?: { pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } } }).campaigns : undefined;
    const pageInfo = root?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
    after = pageInfo.endCursor;
  }
  if (!campaigns.length) warnings.push("StackAdapt returned no campaigns.");
  return { campaigns, warnings };
}

export const STACKADAPT_REST_BASE = "https://api.stackadapt.com/service/v2";

const STACKADAPT_GET_PATHS = new Set([
  "/delivery",
  "/stats",
  "/campaigns",
  "/native_ads",
  "/conversion_trackers",
  "/insights/campaign_device",
  "/insights/campaign_supply_source",
  "/supply_sources",
  "/conversion_paths",
  "/brand_lift_studies",
  "/custom_segments",
]);

export function assertStackAdaptGetPath(path: string) {
  if (!path.startsWith("/") || path.includes("..") || path.includes("?") || path.includes("#") || path.includes("\\")) {
    throw new StackAdaptWriteBlockedError("StackAdapt client is read-only. The path is invalid.");
  }
  if (!STACKADAPT_GET_PATHS.has(path)) {
    throw new StackAdaptWriteBlockedError("StackAdapt client is read-only. That path is not a reporting GET.");
  }
  return path;
}

/** Read-only REST GET. GraphQL delivery stays on stackAdaptGraphql. No request body. */
export async function stackAdaptGet(input: {
  apiKey: string;
  path: string;
  query?: Record<string, string>;
  fetchImpl?: FetchLike;
  optional?: boolean;
}) {
  const path = assertStackAdaptGetPath(input.path);
  const url = new URL(`${STACKADAPT_REST_BASE}${path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value) url.searchParams.set(key, value);
  }
  if (url.protocol !== "https:" || url.hostname !== "api.stackadapt.com" || !url.pathname.startsWith("/service/v2/")) {
    throw new StackAdaptWriteBlockedError("StackAdapt client is read-only. Only https://api.stackadapt.com/service/v2 is allowed.");
  }
  const endpoint = url.toString();
  assertNoAdBudgetWrite({ method: "GET", url: endpoint, params: input.query ?? {} });
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new StackAdaptApiError("STACKADAPT_API_KEY is empty");
  const fetchImpl = input.fetchImpl ?? fetch;
  const secrets = [apiKey];
  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "GET",
      headers: {
        "X-AUTHORIZATION": apiKey,
        accept: "application/json",
      },
      redirect: "error",
    });
  } catch (error) {
    throw new StackAdaptApiError(redactStackAdaptSecrets(error instanceof Error ? error.message : "StackAdapt request failed", secrets));
  }
  if (input.optional && response.status === 404) return null;
  const textBody = await response.text();
  let body: unknown = {};
  if (textBody) {
    try {
      body = JSON.parse(textBody);
    } catch {
      body = textBody;
    }
  }
  if (!response.ok) {
    const message = typeof body === "string" ? body : "StackAdapt request failed";
    throw new StackAdaptApiError(redactStackAdaptSecrets(`StackAdapt ${response.status}: ${message}`.slice(0, 400), secrets), response.status);
  }
  return body;
}

/**
 * StackAdapt GraphQL client.
 * Reads one advertiser's campaigns, ads, and daily delivery.
 * Mutations and subscriptions are refused before any network call.
 * A campaigns or delivery query without a single advertiser id is refused.
 */

import { addDaysISO } from "../../time";
import { assertNoAdBudgetWrite } from "./budget-lock";
import { stackAdaptRawStatus } from "./stackadapt-status";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const STACKADAPT_ENDPOINT = "https://api.stackadapt.com/graphql";
export const STACKADAPT_MAX_PAGES = 20;

/** Campaigns for exactly one advertiser. The id is a variable, never interpolated. */
export const STACKADAPT_CAMPAIGNS_QUERY = `
query StackAdaptAdvertiserCampaigns($advertiserIds: [ID!]!, $after: String) {
  campaigns(first: 50, after: $after, filterBy: { advertiserIds: $advertiserIds }) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      name
      isArchived
      isDraft
      advertiser { id }
      campaignStatus { state status }
      ads(first: 50) {
        pageInfo { hasNextPage }
        nodes { id name paused isArchived }
      }
    }
  }
}
`.trim();

/**
 * Daily delivery for exactly one advertiser.
 * StackAdapt's date `to` is exclusive. Callers pass an inclusive end and this client adds a day.
 * cost is stored for staff. Client surfaces strip it. Budget and bid fields are not requested.
 */
export const STACKADAPT_DELIVERY_QUERY = `
query StackAdaptAdvertiserDelivery($advertiserIds: [ID!]!, $from: ISO8601Date!, $to: ISO8601Date!, $after: String) {
  campaignDelivery(
    dataType: TABLE
    granularity: DAILY
    date: { from: $from, to: $to }
    filterBy: { advertiserIds: $advertiserIds }
  ) {
    ... on CampaignDeliveryOutcome {
      records(first: 50, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          campaign { id advertiser { id } }
          granularity { startTime }
          metrics {
            impressionsBigint
            clicksBigint
            conversionsBigint
            cost
          }
        }
      }
    }
    ... on Progress {
      __typename
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

function stripGraphql(document: string) {
  return document
    .replace(/#[^\n]*/g, " ")
    .replace(/"""[\s\S]*?"""/g, " ")
    .replace(/"(?:\\.|[^"\\])*"/g, " ");
}

/** Strips comments and string literals, then refuses mutation and subscription operations. */
export function assertStackAdaptReadOnly(document: string) {
  const stripped = stripGraphql(document);
  if (/\bmutation\b/i.test(stripped) || /\bsubscription\b/i.test(stripped)) {
    throw new StackAdaptWriteBlockedError("StackAdapt client is read-only. Mutations and subscriptions are blocked.");
  }
  if (!/\bquery\b/i.test(stripped) && !stripped.includes("{")) {
    throw new StackAdaptWriteBlockedError("StackAdapt client is read-only. Only a GraphQL query is allowed.");
  }
}

const CAMPAIGN_READ = /\b(campaigns|campaignDelivery|adDelivery|advertiserDelivery|campaignGroupDelivery)\s*\(/;

/**
 * Campaign and delivery reads must name exactly one advertiser.
 * Listing every advertiser is refused. The id comes from variables, not from the document text.
 */
export function assertStackAdaptAdvertiserQuery(document: string, variables: Record<string, unknown> = {}) {
  assertStackAdaptReadOnly(document);
  const stripped = stripGraphql(document);
  if (/\badvertisers\s*\(/.test(stripped)) {
    throw new StackAdaptWriteBlockedError("StackAdapt client is read-only. Listing every advertiser is blocked.");
  }
  if (!CAMPAIGN_READ.test(stripped)) return "";
  if (!/\badvertiserIds\b/.test(stripped)) {
    throw new StackAdaptWriteBlockedError("StackAdapt client is read-only. Campaign and delivery queries must filter by one advertiser.");
  }
  const withoutSignatures = stripped.replace(/\$[A-Za-z0-9_]+\s*:\s*\[[^\]]*\]!?/g, " ");
  const literal = withoutSignatures.match(/advertiserIds\s*:\s*\[([^\]]*)\]/);
  if (literal) {
    const parts = literal[1].split(",").map((part) => part.trim().replace(/['"]/g, "")).filter(Boolean);
    if (parts.length !== 1 || !/^\d+$/.test(parts[0])) {
      throw new StackAdaptWriteBlockedError("StackAdapt client is read-only. Exactly one advertiser id is allowed.");
    }
  }
  const ids = variables.advertiserIds;
  if (!Array.isArray(ids) || ids.length !== 1) {
    throw new StackAdaptWriteBlockedError("StackAdapt client is read-only. Exactly one advertiser id is allowed.");
  }
  const id = String(ids[0] ?? "").trim();
  if (!/^\d+$/.test(id) || ids.some((value) => String(value).trim() !== id)) {
    throw new StackAdaptWriteBlockedError("StackAdapt client is read-only. The advertiser id is invalid.");
  }
  return id;
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
  const variables = input.variables ?? {};
  const endpoint = assertStackAdaptEndpoint(input.endpoint ?? STACKADAPT_ENDPOINT);
  assertStackAdaptAdvertiserQuery(query, variables);
  assertNoAdBudgetWrite({ method: "POST", url: endpoint, body: { query, variables } });
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
      body: JSON.stringify({ query, variables }),
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
export type StackAdaptCampaign = { id: string; name: string; status: string; advertiserId?: string; lineItems: StackAdaptLineItem[] };
export type StackAdaptBundle = { campaigns: StackAdaptCampaign[]; warnings: string[] };

function num(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function adStatus(row: Record<string, unknown>) {
  if (row.isArchived === true) return "ARCHIVED";
  if (row.paused === true) return "PAUSED";
  return "ACTIVE";
}

function campaignStatus(row: Record<string, unknown>) {
  const status = record(row.campaignStatus);
  return stackAdaptRawStatus({
    isArchived: row.isArchived === true,
    isDraft: row.isDraft === true,
    state: status?.state,
    detail: status?.status,
    fallback: row.status,
  });
}

/** Keeps a campaign only when its advertiser id is the one that was requested. */
export function parseStackAdaptCampaignNode(value: unknown, advertiserId: string): StackAdaptCampaign | null {
  const row = record(value);
  if (!row) return null;
  const id = text(row.id);
  const owner = text(record(row.advertiser)?.id);
  if (!id || owner !== advertiserId) return null;
  const creatives = nodes<unknown>(record(row.ads)?.nodes ?? row.ads)
    .map((item) => {
      const ad = record(item);
      const adId = ad ? text(ad.id) : "";
      if (!ad || !adId) return null;
      return { id: adId, name: text(ad.name), status: adStatus(ad) };
    })
    .filter((item): item is StackAdaptCreative => Boolean(item));
  return {
    id,
    name: text(row.name) || id,
    status: campaignStatus(row),
    advertiserId,
    lineItems: [
      {
        id: `line:${id}`,
        name: text(row.name) || id,
        status: campaignStatus(row),
        creatives,
        dailyStats: [],
      },
    ],
  };
}

export function parseStackAdaptDeliveryNode(value: unknown, advertiserId: string): { campaignId: string; stat: StackAdaptDailyStat } | null {
  const row = record(value);
  if (!row) return null;
  const campaign = record(row.campaign);
  const owner = text(record(campaign?.advertiser)?.id);
  const campaignId = text(campaign?.id);
  if (!campaignId || owner !== advertiserId) return null;
  const metrics = record(row.metrics);
  const date = text(record(row.granularity)?.startTime).slice(0, 10);
  if (!metrics || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return {
    campaignId,
    stat: {
      date,
      impressions: num(metrics.impressionsBigint ?? metrics.impressions),
      clicks: num(metrics.clicksBigint ?? metrics.clicks),
      conversions: num(metrics.conversionsBigint ?? metrics.conversions),
      spend: num(metrics.cost ?? metrics.spend),
    },
  };
}

export function parseStackAdaptData(data: unknown, advertiserId = ""): StackAdaptCampaign[] {
  const root = record(data);
  const rows = nodes<unknown>(record(root?.campaigns)?.nodes ?? root?.campaigns);
  if (!advertiserId) return [];
  return rows.map((row) => parseStackAdaptCampaignNode(row, advertiserId)).filter((row): row is StackAdaptCampaign => Boolean(row));
}

function attachStats(campaigns: StackAdaptCampaign[], stats: { campaignId: string; stat: StackAdaptDailyStat }[], advertiserId: string) {
  const byId = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  for (const row of stats) {
    let campaign = byId.get(row.campaignId);
    if (!campaign) {
      campaign = {
        id: row.campaignId,
        name: row.campaignId,
        status: "unknown",
        advertiserId,
        lineItems: [{ id: `line:${row.campaignId}`, name: row.campaignId, status: "unknown", creatives: [], dailyStats: [] }],
      };
      campaigns.push(campaign);
      byId.set(row.campaignId, campaign);
    }
    const line = campaign.lineItems[0];
    if (!line) continue;
    const existing = line.dailyStats.find((stat) => stat.date === row.stat.date);
    if (!existing) {
      line.dailyStats.push({ ...row.stat });
      continue;
    }
    existing.impressions += row.stat.impressions;
    existing.clicks += row.stat.clicks;
    existing.conversions += row.stat.conversions;
    existing.spend += row.stat.spend;
  }
}

function pageInfo(value: unknown) {
  const info = record(value);
  const cursor = text(info?.endCursor);
  return { hasNext: Boolean(info?.hasNextPage && cursor), cursor: cursor || null };
}

/** Totals a probe may print. Spend, cost, and the key are not included. */
export function stackAdaptProbeSummary(bundle: StackAdaptBundle, range: { advertiserId: string; from: string; to: string }) {
  let impressions = 0;
  let clicks = 0;
  let conversions = 0;
  for (const campaign of bundle.campaigns) {
    for (const line of campaign.lineItems) {
      for (const stat of line.dailyStats) {
        impressions += stat.impressions;
        clicks += stat.clicks;
        conversions += stat.conversions;
      }
    }
  }
  return {
    advertiserId: range.advertiserId,
    campaigns: bundle.campaigns.length,
    from: range.from,
    to: range.to,
    impressions,
    clicks,
    conversions,
  };
}

export async function pullStackAdaptBundle(input: {
  apiKey: string;
  from: string;
  to: string;
  advertiserId: string;
  endpoint?: string;
  fetchImpl?: FetchLike;
}): Promise<StackAdaptBundle> {
  const advertiserId = assertStackAdaptAdvertiserQuery(STACKADAPT_CAMPAIGNS_QUERY, { advertiserIds: [input.advertiserId] });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.from) || !/^\d{4}-\d{2}-\d{2}$/.test(input.to) || input.from > input.to) {
    throw new StackAdaptApiError("StackAdapt date range is invalid");
  }
  const warnings: string[] = [];
  const campaigns: StackAdaptCampaign[] = [];
  let after: string | null = null;
  let campaignPages = 0;
  for (; campaignPages < STACKADAPT_MAX_PAGES; campaignPages += 1) {
    const data = await stackAdaptGraphql({
      apiKey: input.apiKey,
      endpoint: input.endpoint,
      fetchImpl: input.fetchImpl,
      query: STACKADAPT_CAMPAIGNS_QUERY,
      variables: { advertiserIds: [advertiserId], after },
    });
    const connection = record(record(data)?.campaigns);
    const before = campaigns.length;
    campaigns.push(...parseStackAdaptData(data, advertiserId));
    if (nodes<unknown>(connection?.nodes).length > campaigns.length - before) warnings.push("Ignored a campaign outside the requested advertiser.");
    const info = pageInfo(connection?.pageInfo);
    const adsTruncated = nodes<unknown>(connection?.nodes).some((node) => record(record(record(node)?.ads)?.pageInfo)?.hasNextPage === true);
    if (adsTruncated) warnings.push("Some creatives were not loaded.");
    if (!info.hasNext) break;
    after = info.cursor;
  }
  if (campaignPages >= STACKADAPT_MAX_PAGES) warnings.push("StackAdapt campaign page limit reached.");

  const stats: { campaignId: string; stat: StackAdaptDailyStat }[] = [];
  after = null;
  let deliveryPages = 0;
  const exclusiveTo = addDaysISO(input.to, 1);
  for (; deliveryPages < STACKADAPT_MAX_PAGES; deliveryPages += 1) {
    const data = await stackAdaptGraphql({
      apiKey: input.apiKey,
      endpoint: input.endpoint,
      fetchImpl: input.fetchImpl,
      query: STACKADAPT_DELIVERY_QUERY,
      variables: { advertiserIds: [advertiserId], from: input.from, to: exclusiveTo, after },
    });
    const delivery = record(record(data)?.campaignDelivery);
    if (delivery?.__typename === "Progress" || (delivery && !("records" in delivery))) {
      warnings.push("StackAdapt delivery is still processing.");
      break;
    }
    const records = record(delivery?.records);
    for (const node of nodes<unknown>(records?.nodes)) {
      const parsed = parseStackAdaptDeliveryNode(node, advertiserId);
      if (parsed) stats.push(parsed);
    }
    const info = pageInfo(records?.pageInfo);
    if (!info.hasNext) break;
    after = info.cursor;
  }
  if (deliveryPages >= STACKADAPT_MAX_PAGES) warnings.push("StackAdapt delivery page limit reached.");
  attachStats(campaigns, stats, advertiserId);
  if (!campaigns.length) warnings.push("StackAdapt returned no campaigns.");
  return { campaigns, warnings: [...new Set(warnings)] };
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

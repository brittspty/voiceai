/**
 * Read-only StackAdapt conversion reads for Connected TV.
 * One advertiser per request. Pages follow the cursor. Budget and bid fields are not requested.
 *
 * STACKADAPT_CTV_VERIFIED_FIELDS was checked against a live read. Every name exists and returns data.
 * cookieConversions is a decimal. ipConversionsBigint and cookieConversionsBigint are included on the
 * delivery query, so the IP or cookie split is shown when that query succeeds.
 * A schema error on those two fields still retries without them.
 * campaignInsight often answers { __typename: "Progress" } first and has rows about 10 seconds later.
 * Insight reads retry about every 6 seconds for up to 3 minutes, then record that the report is still processing.
 * Breakdowns are one dimension at a time, filtered to the CTV campaign ids from the delivery read.
 * A live account of about 196k impressions fit in 7 pages that way, under the page cap.
 * audienceInsights needs a job id and is audience research, so this path uses campaignInsight.
 */

import { addDaysISO } from "../../time";
import {
  STACKADAPT_MAX_PAGES,
  StackAdaptApiError,
  assertStackAdaptAdvertiserQuery,
  stackAdaptGraphql,
  type FetchLike,
} from "../connectors/stackadapt-client";
import { isExplicitCtvType } from "./parse";
import {
  parseCtvBreakdownNode,
  parseCtvConversionNode,
  parseCtvPixelNode,
  type CtvBreakdownDelivery,
  type CtvConversionDelivery,
  type CtvPixelDelivery,
} from "./attribution-parse";

export const VIEW_THROUGH_LABEL = "View-through visits are pixel-tracked site visits after a CTV impression.";
export const STILL_PROCESSING = "StackAdapt attribution is still processing.";
export const PIXEL_UNAVAILABLE = "Conversions by pixel or event name are not available.";
export const BREAKDOWN_UNAVAILABLE = "Publisher, app, device, and geo breakdowns are not available.";
export const IP_SPLIT_UNAVAILABLE = "The IP or household versus cookie split is not available.";

/** Confirmed on a live StackAdapt read. Every field exists and returns data. */
export const STACKADAPT_CTV_VERIFIED_FIELDS = [
  "metrics.ipConversionsBigint",
  "metrics.cookieConversionsBigint",
  "campaignInsight",
  "campaignInsight.attributes CONVERSION_PIXEL",
  "campaignInsight.attributes DATE",
  "attributes.conversionPixel.id",
  "attributes.conversionPixel.name",
  "attributes.date",
  "insight metrics impressions",
  "insight metrics clickConversions",
  "insight metrics impressionConversions",
  "insight metrics cookieConversions",
  "insight metrics cost",
  "campaignInsight.attributes SUPPLY_SOURCE",
  "attributes.supplySource.id",
  "attributes.supplySource.name",
  "campaignInsight.attributes APP",
  "attributes.app.title",
  "attributes.app.domain",
  "campaignInsight.attributes DEVICE_TYPE",
  "attributes.deviceType",
  "campaignInsight.attributes COUNTRY",
  "attributes.country.name",
  "attributes.country.code",
] as const;

const CONVERSION_METRICS = `
            impressionsBigint
            clickConversionsBigint
            impressionConversionsBigint
            ipConversionsBigint
            cookieConversionsBigint
            cost
`;

const VERIFIED_CONVERSION_METRICS = `
            impressionsBigint
            clickConversionsBigint
            impressionConversionsBigint
            cost
`;

function deliveryQuery(metrics: string) {
  return `
query StackAdaptCtvConversions($advertiserIds: [ID!]!, $from: ISO8601Date!, $to: ISO8601Date!, $after: String) {
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
          campaign {
            id
            name
            channelType
            advertiser { id }
            campaignStatus { state status }
          }
          granularity { startTime }
          metrics {
${metrics}
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
}

export const STACKADAPT_CTV_CONVERSION_QUERY = deliveryQuery(CONVERSION_METRICS);
export const STACKADAPT_CTV_CONVERSION_VERIFIED_QUERY = deliveryQuery(VERIFIED_CONVERSION_METRICS);

/** Insight reports are often still processing on the first call. */
export const INSIGHT_RETRY_MS = 6_000;
export const INSIGHT_RETRY_LIMIT_MS = 3 * 60_000;

/**
 * One attribute per request, plus the CTV campaign ids.
 * DATE stays on the pixel query only. A combined attribute list was too fine-grained.
 * first: 50 and a cap of 20 pages hold the 7 pages seen for about 196k impressions.
 */
export const CTV_BREAKDOWN_DIMENSIONS = [
  { attribute: "APP", selection: "app { title domain }" },
  { attribute: "SUPPLY_SOURCE", selection: "supplySource { id name }" },
  { attribute: "DEVICE_TYPE", selection: "deviceType" },
  { attribute: "COUNTRY", selection: "country { name code }" },
] as const;

export function stackAdaptCtvBreakdownQuery(attribute: string, selection: string) {
  return `
query StackAdaptCtvBreakdownInsight($advertiserIds: [ID!]!, $ids: [ID!]!, $from: ISO8601Date!, $to: ISO8601Date!, $after: String) {
  campaignInsight(
    attributes: [${attribute}]
    date: { from: $from, to: $to }
    filterBy: { advertiserIds: $advertiserIds, ids: $ids }
  ) {
    ... on CampaignInsightOutcome {
      records(first: 50, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          campaign {
            id
            name
            channelType
            advertiser { id }
          }
          attributes {
            ${selection}
          }
          metrics {
            impressions
            clickConversions
            impressionConversions
            cookieConversions
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
}

export const STACKADAPT_CTV_BREAKDOWN_QUERIES = CTV_BREAKDOWN_DIMENSIONS.map((dimension) => ({
  ...dimension,
  query: stackAdaptCtvBreakdownQuery(dimension.attribute, dimension.selection),
}));

export const STACKADAPT_CTV_PIXEL_QUERY = `
query StackAdaptCtvPixelInsight($advertiserIds: [ID!]!, $from: ISO8601Date!, $to: ISO8601Date!, $after: String) {
  campaignInsight(
    attributes: [CONVERSION_PIXEL, DATE]
    date: { from: $from, to: $to }
    filterBy: { advertiserIds: $advertiserIds }
  ) {
    ... on CampaignInsightOutcome {
      records(first: 50, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          campaign {
            id
            name
            channelType
            advertiser { id }
          }
          attributes {
            date
            conversionPixel { id name }
          }
          metrics {
            impressions
            clickConversions
            impressionConversions
            cookieConversions
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

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function nodes(value: unknown) {
  if (Array.isArray(value)) return value;
  const row = record(value);
  return Array.isArray(row?.nodes) ? row.nodes : [];
}

function pageInfo(value: unknown) {
  const info = record(value);
  const cursor = typeof info?.endCursor === "string" ? info.endCursor.trim() : "";
  return { hasNext: Boolean(info?.hasNextPage && cursor), cursor: cursor || null };
}

export function isStackAdaptSchemaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /cannot query field|unknown argument|unknown type|is not defined|doesn't exist on type|does not exist on type|has no field|fieldundefined|expected type|argument .* required type/i.test(message);
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error || "");
}

function stillProcessing(payload: Record<string, unknown> | null) {
  return payload?.__typename === "Progress" || Boolean(payload && !("records" in payload));
}

async function readPaged<T>(input: {
  apiKey: string;
  query: string;
  root: "campaignDelivery" | "campaignInsight";
  from: string;
  to: string;
  advertiserId: string;
  ids?: string[];
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  parse: (node: unknown, advertiserId: string) => T | null;
}): Promise<{ rows: T[]; warnings: string[] }> {
  const advertiserId = assertStackAdaptAdvertiserQuery(input.query, { advertiserIds: [input.advertiserId] });
  const warnings: string[] = [];
  const rows: T[] = [];
  let after: string | null = null;
  let pages = 0;
  const exclusiveTo = addDaysISO(input.to, 1);
  const retryProgress = input.root === "campaignInsight";
  const sleep = input.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = input.now ?? Date.now;
  for (; pages < STACKADAPT_MAX_PAGES; pages += 1) {
    const started = now();
    let payload: Record<string, unknown> | null = null;
    while (true) {
      const data = await stackAdaptGraphql({
        apiKey: input.apiKey,
        fetchImpl: input.fetchImpl,
        query: input.query,
        variables: {
          advertiserIds: [advertiserId],
          from: input.from,
          to: exclusiveTo,
          after,
          ...(input.ids ? { ids: input.ids } : {}),
        },
      });
      payload = record(record(data)?.[input.root]);
      if (!retryProgress || !stillProcessing(payload)) break;
      if (now() - started >= INSIGHT_RETRY_LIMIT_MS) {
        warnings.push(STILL_PROCESSING);
        return { rows, warnings };
      }
      await sleep(INSIGHT_RETRY_MS);
    }
    if (!retryProgress && stillProcessing(payload)) {
      warnings.push(STILL_PROCESSING);
      break;
    }
    const records = record(payload?.records);
    for (const node of nodes(records?.nodes)) {
      const parsed = input.parse(node, advertiserId);
      if (parsed) rows.push(parsed);
    }
    const info = pageInfo(records?.pageInfo);
    if (!info.hasNext) break;
    after = info.cursor;
  }
  if (pages >= STACKADAPT_MAX_PAGES) warnings.push("StackAdapt attribution page limit reached.");
  return { rows, warnings };
}

function ctvCampaignIds(rows: CtvConversionDelivery[]) {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!isExplicitCtvType(row.channelType) || !row.campaignId || seen.has(row.campaignId)) continue;
    seen.add(row.campaignId);
    ids.push(row.campaignId);
  }
  return ids;
}

export async function pullStackAdaptCtvAttribution(input: {
  apiKey: string;
  from: string;
  to: string;
  advertiserId: string;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): Promise<{
  rows: CtvConversionDelivery[];
  pixels: CtvPixelDelivery[];
  breakdowns: CtvBreakdownDelivery[];
  ipSplitAvailable: boolean;
  pixelAvailable: boolean;
  pixelNote: string;
  breakdownNote: string;
  warnings: string[];
}> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.from) || !/^\d{4}-\d{2}-\d{2}$/.test(input.to) || input.from > input.to) {
    throw new StackAdaptApiError("StackAdapt date range is invalid");
  }
  assertStackAdaptAdvertiserQuery(STACKADAPT_CTV_CONVERSION_QUERY, { advertiserIds: [input.advertiserId] });
  const warnings: string[] = [];
  let ipSplitAvailable = true;
  let delivery: { rows: CtvConversionDelivery[]; warnings: string[] };
  try {
    delivery = await readPaged({
      ...input,
      query: STACKADAPT_CTV_CONVERSION_QUERY,
      root: "campaignDelivery",
      parse: parseCtvConversionNode,
    });
  } catch (error) {
    if (!isStackAdaptSchemaError(error) && !/ipConversionsBigint|cookieConversionsBigint/i.test(messageOf(error))) throw error;
    ipSplitAvailable = false;
    delivery = await readPaged({
      ...input,
      query: STACKADAPT_CTV_CONVERSION_VERIFIED_QUERY,
      root: "campaignDelivery",
      parse: parseCtvConversionNode,
    });
  }
  warnings.push(...delivery.warnings);
  let pixels: CtvPixelDelivery[] = [];
  let pixelAvailable = false;
  let pixelNote = "";
  try {
    const pulled = await readPaged({
      ...input,
      query: STACKADAPT_CTV_PIXEL_QUERY,
      root: "campaignInsight",
      parse: parseCtvPixelNode,
    });
    pixels = pulled.rows;
    warnings.push(...pulled.warnings);
    pixelAvailable = true;
    if (!pixels.length && pulled.warnings.includes(STILL_PROCESSING)) pixelNote = STILL_PROCESSING;
  } catch (error) {
    pixelNote = PIXEL_UNAVAILABLE;
    if (!isStackAdaptSchemaError(error)) warnings.push(messageOf(error) || "StackAdapt pixel read failed");
  }
  let breakdowns: CtvBreakdownDelivery[] = [];
  let breakdownNote = "";
  const ids = ctvCampaignIds(delivery.rows);
  if (ids.length) {
    let failed = 0;
    let breakdownStillProcessing = false;
    for (const dimension of STACKADAPT_CTV_BREAKDOWN_QUERIES) {
      try {
        const pulled = await readPaged({
          ...input,
          query: dimension.query,
          root: "campaignInsight",
          ids,
          parse: (node, advertiserId) => parseCtvBreakdownNode(node, advertiserId),
        });
        for (const row of pulled.rows) breakdowns.push(...row);
        warnings.push(...pulled.warnings);
        if (pulled.warnings.includes(STILL_PROCESSING)) breakdownStillProcessing = true;
      } catch (error) {
        failed += 1;
        if (!isStackAdaptSchemaError(error)) warnings.push(messageOf(error) || "StackAdapt breakdown read failed");
      }
    }
    if (failed === STACKADAPT_CTV_BREAKDOWN_QUERIES.length) {
      breakdownNote = BREAKDOWN_UNAVAILABLE;
      breakdowns = [];
    } else if (!breakdowns.length && breakdownStillProcessing) {
      breakdownNote = STILL_PROCESSING;
    }
  }
  return {
    rows: delivery.rows,
    pixels,
    breakdowns,
    ipSplitAvailable,
    pixelAvailable,
    pixelNote,
    breakdownNote,
    warnings: [...new Set(warnings.filter(Boolean))],
  };
}

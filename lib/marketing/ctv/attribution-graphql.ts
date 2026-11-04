/**
 * Read-only StackAdapt conversion reads for Connected TV.
 * One advertiser per request. Pages follow the cursor. Budget and bid fields are not requested.
 *
 * The campaignDelivery metrics below that #61 already runs are the verified ones:
 * impressionsBigint, clickConversionsBigint, impressionConversionsBigint, cost,
 * campaign.channelType, and granularity.startTime.
 *
 * Everything in STACKADAPT_CTV_UNVERIFIED_FIELDS is in the public GraphQL schema
 * (StackAdapt pa-typescript-sdk 0.73) and has not been run against this account.
 * A schema error on ipConversionsBigint or cookieConversionsBigint retries without them.
 * A schema error on the insight breakdown query keeps the delivery rows and records
 * an honest not-available note. audienceInsights is a job-id audience study in that
 * schema, not a per-campaign conversion breakdown, so this path uses campaignInsight.
 */

import { addDaysISO } from "../../time";
import {
  STACKADAPT_MAX_PAGES,
  StackAdaptApiError,
  assertStackAdaptAdvertiserQuery,
  stackAdaptGraphql,
  type FetchLike,
} from "../connectors/stackadapt-client";
import {
  parseCtvBreakdownNode,
  parseCtvConversionNode,
  parseCtvPixelNode,
  type CtvBreakdownDelivery,
  type CtvConversionDelivery,
  type CtvPixelDelivery,
} from "./attribution-parse";

export const VIEW_THROUGH_LABEL = "View-through visits are pixel-tracked site visits after a CTV impression.";
export const PIXEL_UNAVAILABLE = "Conversions by pixel or event name are not available.";
export const BREAKDOWN_UNAVAILABLE = "Publisher, app, device, and geo breakdowns are not available.";
export const IP_SPLIT_UNAVAILABLE = "The IP or household versus cookie split is not available.";

/** Public schema names that this account has not confirmed. Verify live before relying on them. */
export const STACKADAPT_CTV_UNVERIFIED_FIELDS = [
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

export const STACKADAPT_CTV_BREAKDOWN_QUERY = `
query StackAdaptCtvBreakdownInsight($advertiserIds: [ID!]!, $from: ISO8601Date!, $to: ISO8601Date!, $after: String) {
  campaignInsight(
    attributes: [SUPPLY_SOURCE, APP, DEVICE_TYPE, COUNTRY, DATE]
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
            supplySource { id name }
            app { title domain }
            deviceType
            country { name code }
          }
          metrics {
            impressions
            clickConversions
            impressionConversions
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

async function readPaged<T>(input: {
  apiKey: string;
  query: string;
  root: "campaignDelivery" | "campaignInsight";
  from: string;
  to: string;
  advertiserId: string;
  fetchImpl?: FetchLike;
  parse: (node: unknown, advertiserId: string) => T | null;
}): Promise<{ rows: T[]; warnings: string[] }> {
  const advertiserId = assertStackAdaptAdvertiserQuery(input.query, { advertiserIds: [input.advertiserId] });
  const warnings: string[] = [];
  const rows: T[] = [];
  let after: string | null = null;
  let pages = 0;
  const exclusiveTo = addDaysISO(input.to, 1);
  for (; pages < STACKADAPT_MAX_PAGES; pages += 1) {
    const data = await stackAdaptGraphql({
      apiKey: input.apiKey,
      fetchImpl: input.fetchImpl,
      query: input.query,
      variables: { advertiserIds: [advertiserId], from: input.from, to: exclusiveTo, after },
    });
    const payload = record(record(data)?.[input.root]);
    if (payload?.__typename === "Progress" || (payload && !("records" in payload))) {
      warnings.push("StackAdapt attribution is still processing.");
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

export async function pullStackAdaptCtvAttribution(input: {
  apiKey: string;
  from: string;
  to: string;
  advertiserId: string;
  fetchImpl?: FetchLike;
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
  } catch (error) {
    pixelNote = PIXEL_UNAVAILABLE;
    if (!isStackAdaptSchemaError(error)) warnings.push(messageOf(error) || "StackAdapt pixel read failed");
  }
  let breakdowns: CtvBreakdownDelivery[] = [];
  let breakdownNote = "";
  try {
    const pulled = await readPaged({
      ...input,
      query: STACKADAPT_CTV_BREAKDOWN_QUERY,
      root: "campaignInsight",
      parse: (node, advertiserId) => parseCtvBreakdownNode(node, advertiserId),
    });
    for (const row of pulled.rows) breakdowns.push(...row);
    warnings.push(...pulled.warnings);
  } catch (error) {
    breakdownNote = BREAKDOWN_UNAVAILABLE;
    breakdowns = [];
    if (!isStackAdaptSchemaError(error)) warnings.push(messageOf(error) || "StackAdapt breakdown read failed");
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

/**
 * Read-only StackAdapt campaignDelivery for Connected TV.
 * One advertiser per request. Pages follow the cursor. Budget and bid fields are not requested.
 * cost is stored for staff. Client, share, plan, and export responses strip it.
 */

import { addDaysISO } from "../../time";
import {
  STACKADAPT_MAX_PAGES,
  StackAdaptApiError,
  assertStackAdaptAdvertiserQuery,
  stackAdaptGraphql,
  type FetchLike,
} from "../connectors/stackadapt-client";
import { parseCtvGraphqlNode, type CtvGraphqlDelivery } from "./parse";

export const STACKADAPT_CTV_DELIVERY_QUERY = `
query StackAdaptCtvDelivery($advertiserIds: [ID!]!, $from: ISO8601Date!, $to: ISO8601Date!, $after: String) {
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
            impressionsBigint
            uniqueImpressionsBigint
            frequency
            videoStartsBigint
            videoQ1PlaybacksBigint
            videoQ2PlaybacksBigint
            videoQ3PlaybacksBigint
            videoCompletionsBigint
            videoCompletionRate
            clickConversionsBigint
            impressionConversionsBigint
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

export async function pullStackAdaptCtvDelivery(input: {
  apiKey: string;
  from: string;
  to: string;
  advertiserId: string;
  fetchImpl?: FetchLike;
}): Promise<{ rows: CtvGraphqlDelivery[]; warnings: string[] }> {
  const advertiserId = assertStackAdaptAdvertiserQuery(STACKADAPT_CTV_DELIVERY_QUERY, { advertiserIds: [input.advertiserId] });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.from) || !/^\d{4}-\d{2}-\d{2}$/.test(input.to) || input.from > input.to) {
    throw new StackAdaptApiError("StackAdapt date range is invalid");
  }
  const warnings: string[] = [];
  const rows: CtvGraphqlDelivery[] = [];
  let after: string | null = null;
  let pages = 0;
  const exclusiveTo = addDaysISO(input.to, 1);
  for (; pages < STACKADAPT_MAX_PAGES; pages += 1) {
    const data = await stackAdaptGraphql({
      apiKey: input.apiKey,
      fetchImpl: input.fetchImpl,
      query: STACKADAPT_CTV_DELIVERY_QUERY,
      variables: { advertiserIds: [advertiserId], from: input.from, to: exclusiveTo, after },
    });
    const delivery = record(record(data)?.campaignDelivery);
    if (delivery?.__typename === "Progress" || (delivery && !("records" in delivery))) {
      warnings.push("StackAdapt delivery is still processing.");
      break;
    }
    const records = record(delivery?.records);
    for (const node of nodes(records?.nodes)) {
      const parsed = parseCtvGraphqlNode(node, advertiserId);
      if (parsed) rows.push(parsed);
    }
    const info = pageInfo(records?.pageInfo);
    if (!info.hasNext) break;
    after = info.cursor;
  }
  if (pages >= STACKADAPT_MAX_PAGES) warnings.push("StackAdapt delivery page limit reached.");
  return { rows, warnings: [...new Set(warnings)] };
}

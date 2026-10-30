import { mergeSnapshots } from "./meta-map";
import {
  googleAdsSearch,
  googleAdsSearchStream,
  redactGoogleSecrets,
  refreshGoogleAdsAccessToken,
  type FetchLike,
  type Sleep,
} from "./google-ads-client";
import { normalizeGoogleAdsBundle, type GoogleAdsBundle } from "./google-ads-map";

const CUSTOMER_QUERY = `
  SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.status
  FROM customer
  LIMIT 1
`.trim();

const CLIENT_QUERY = `
  SELECT
    customer_client.id,
    customer_client.descriptive_name,
    customer_client.currency_code,
    customer_client.time_zone,
    customer_client.status,
    customer_client.manager,
    customer_client.level
  FROM customer_client
  WHERE customer_client.status = 'ENABLED'
`.trim();

const CAMPAIGN_QUERY = `
  SELECT
    customer.id,
    customer.descriptive_name,
    customer.currency_code,
    customer.time_zone,
    customer.status,
    campaign.id,
    campaign.name,
    campaign.status,
    campaign.advertising_channel_type,
    campaign.start_date,
    campaign.end_date,
    campaign_budget.amount_micros,
    campaign_budget.period,
    campaign_budget.total_amount_micros
  FROM campaign
  WHERE campaign.status != 'REMOVED'
`.trim();

const AD_GROUP_QUERY = `
  SELECT
    campaign.id,
    campaign.bidding_strategy_type,
    ad_group.id,
    ad_group.name,
    ad_group.status,
    ad_group.type
  FROM ad_group
  WHERE ad_group.status != 'REMOVED'
`.trim();

const AD_QUERY = `
  SELECT
    campaign.id,
    ad_group.id,
    ad_group_ad.ad.id,
    ad_group_ad.ad.name,
    ad_group_ad.ad.type,
    ad_group_ad.ad.final_urls,
    ad_group_ad.ad.responsive_search_ad.headlines,
    ad_group_ad.ad.responsive_search_ad.descriptions,
    ad_group_ad.status
  FROM ad_group_ad
  WHERE ad_group_ad.status != 'REMOVED'
`.trim();

const AD_QUERY_LIGHT = `
  SELECT
    campaign.id,
    ad_group.id,
    ad_group_ad.ad.id,
    ad_group_ad.ad.name,
    ad_group_ad.ad.type,
    ad_group_ad.ad.final_urls,
    ad_group_ad.status
  FROM ad_group_ad
  WHERE ad_group_ad.status != 'REMOVED'
`.trim();

function metricQuery(since: string, until: string) {
  return `
    SELECT
      segments.date,
      campaign.id,
      ad_group.id,
      ad_group_ad.ad.id,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value
    FROM ad_group_ad
    WHERE segments.date BETWEEN '${since}' AND '${until}'
  `.trim();
}

function searchTermQuery(since: string, until: string) {
  return `
    SELECT
      segments.date,
      segments.search_term_match_type,
      campaign.id,
      ad_group.id,
      search_term_view.search_term,
      search_term_view.status,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM search_term_view
    WHERE segments.date BETWEEN '${since}' AND '${until}'
  `.trim();
}

export type GoogleAdsPullInput = {
  customerIds: string[];
  discoverCustomers: boolean;
  loginCustomerId: string;
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  apiVersion: string;
  since: string;
  until: string;
  fetchImpl?: FetchLike;
  sleep?: Sleep;
  /** Intraday runs load metrics and search terms only. */
  insightsOnly?: boolean;
};

function assertDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Google Ads date window is invalid");
}

function clip(error: unknown, secrets: string[]) {
  const message = error instanceof Error ? error.message : "Google Ads request failed";
  return redactGoogleSecrets(message, secrets).slice(0, 300);
}

function record(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function text(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export async function pullGoogleAdsAccount(
  input: GoogleAdsPullInput & { customerId: string; accessToken: string },
): Promise<GoogleAdsBundle> {
  const secrets = [input.accessToken, input.developerToken, input.clientSecret, input.refreshToken];
  const common = {
    customerId: input.customerId,
    accessToken: input.accessToken,
    developerToken: input.developerToken,
    loginCustomerId: input.loginCustomerId,
    apiVersion: input.apiVersion,
    fetchImpl: input.fetchImpl,
    sleep: input.sleep,
  };
  const warnings: string[] = [];
  const customerRows = await googleAdsSearch({ ...common, query: CUSTOMER_QUERY });
  const customer = customerRows[0] ?? { customer: { id: input.customerId } };
  const metrics = await googleAdsSearchStream({ ...common, query: metricQuery(input.since, input.until) });
  let searchTerms: unknown[] = [];
  try {
    searchTerms = await googleAdsSearchStream({ ...common, query: searchTermQuery(input.since, input.until) });
  } catch (error) {
    warnings.push(`${input.customerId} search terms skipped: ${clip(error, secrets)}`);
  }
  if (input.insightsOnly) {
    return { customer, campaigns: [], adGroups: [], ads: [], metrics, searchTerms, warnings };
  }
  const campaigns = await googleAdsSearch({ ...common, query: CAMPAIGN_QUERY });
  const adGroups = await googleAdsSearch({ ...common, query: AD_GROUP_QUERY });
  let ads: unknown[] = [];
  try {
    ads = await googleAdsSearch({ ...common, query: AD_QUERY });
  } catch (error) {
    warnings.push(`${input.customerId} ad copy skipped: ${clip(error, secrets)}`);
    ads = await googleAdsSearch({ ...common, query: AD_QUERY_LIGHT });
  }
  return { customer, campaigns, adGroups, ads, metrics, searchTerms, warnings };
}

async function discoverCustomerIds(input: GoogleAdsPullInput & { accessToken: string }) {
  const rows = await googleAdsSearch({
    customerId: input.loginCustomerId,
    query: CLIENT_QUERY,
    accessToken: input.accessToken,
    developerToken: input.developerToken,
    loginCustomerId: input.loginCustomerId,
    apiVersion: input.apiVersion,
    fetchImpl: input.fetchImpl,
    sleep: input.sleep,
  });
  const ids: string[] = [];
  for (const row of rows) {
    const client = record(record(row).customerClient);
    if (client.manager === true) continue;
    const level = Number(client.level);
    if (Number.isFinite(level) && level <= 0) continue;
    const id = text(client.id);
    if (/^\d{10}$/.test(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export async function pullGoogleAdsSnapshot(input: GoogleAdsPullInput) {
  assertDate(input.since);
  assertDate(input.until);
  const secrets = [input.developerToken, input.clientSecret, input.refreshToken];
  const accessToken = await refreshGoogleAdsAccessToken({
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    refreshToken: input.refreshToken,
    fetchImpl: input.fetchImpl,
  });
  let customerIds = input.customerIds.filter((id) => /^\d{10}$/.test(id));
  if (input.discoverCustomers || !customerIds.length) {
    try {
      const discovered = await discoverCustomerIds({ ...input, accessToken });
      if (discovered.length) customerIds = discovered;
    } catch {
      if (!customerIds.length) customerIds = [input.loginCustomerId];
    }
  }
  if (!customerIds.length) customerIds = [input.loginCustomerId];

  const parts = [];
  const failures: string[] = [];
  for (const customerId of customerIds) {
    try {
      const bundle = await pullGoogleAdsAccount({ ...input, customerId, accessToken });
      parts.push(normalizeGoogleAdsBundle(bundle));
    } catch (error) {
      failures.push(`${customerId}: ${clip(error, secrets)}`);
    }
  }
  const snapshot = mergeSnapshots(parts);
  if (failures.length) snapshot.warnings.push(...failures.map((failure) => `Account pull failed: ${failure}`));
  return { snapshot, failures };
}

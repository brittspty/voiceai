import type { AdPlatform } from "../types";
import {
  graphGet,
  graphList,
  graphPost,
  isMetaBudgetStop,
  MAX_PULL_MS,
  MetaGraphError,
  redactSecrets,
  waitForMeta,
  type FetchLike,
  type GraphCall,
  type MetaProgressLog,
  type Sleep,
} from "./meta-client";
import { asRecord, mergeSnapshots, normalizeMetaBundle, str, type MetaBundle } from "./meta-map";

const ACCOUNT_FIELDS = "id,name,account_id,currency,timezone_name,account_status";
const CAMPAIGN_FIELDS = "id,name,objective,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time";
const ADSET_FIELDS = "id,name,campaign_id,status,effective_status,optimization_goal,bid_strategy,daily_budget,targeting";
/** Light fields only. Creative copy is loaded later, and only for ads that delivered. */
const AD_FIELDS = "id,name,adset_id,status,effective_status,creative{id}";
const CREATIVE_FIELDS =
  "id,name,title,body,call_to_action_type,image_hash,video_id,thumbnail_url,object_story_spec,url_tags,asset_feed_spec";
/**
 * Filtering `adcreative.id` IN is rejected (#100). Full creative fields are read from the ads edge
 * for delivered ad ids only. The payload is heavy, so each request stays small.
 */
const CREATIVE_AD_FIELDS = `id,creative{${CREATIVE_FIELDS}}`;
export const CREATIVE_PAGE_LIMIT = 25;
const AUDIENCE_FIELDS = "id,name,subtype,approximate_count_lower_bound,description";
const INSIGHT_FIELDS =
  "ad_id,adset_id,campaign_id,spend,impressions,reach,clicks,inline_link_clicks,actions,action_values,date_start,date_stop,video_thruplay_watched_actions";

/** Inclusive windows longer than this use Meta's async insights job. */
export const ASYNC_INSIGHTS_AFTER_DAYS = 7;
export const ASYNC_POLL_START_MS = 5_000;
export const ASYNC_POLL_MAX_MS = 30_000;
export const ID_BATCH = 50;
export { MAX_PULL_MS };

export type MetaPullInput = {
  accountIds: string[];
  accessToken: string;
  appSecret: string;
  graphVersion: string;
  since: string;
  until: string;
  attributionWindows: string[];
  fetchImpl?: FetchLike;
  sleep?: Sleep;
  log?: MetaProgressLog;
  deadline?: number;
};

export function inclusiveDays(since: string, until: string) {
  const start = Date.parse(`${since.slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${until.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 1;
  return Math.floor((end - start) / 86_400_000) + 1;
}

function insightParams(input: { since: string; until: string; attributionWindows: string[] }) {
  return {
    level: "ad",
    time_increment: "1",
    fields: INSIGHT_FIELDS,
    time_range: JSON.stringify({ since: input.since, until: input.until }),
    action_attribution_windows: JSON.stringify(input.attributionWindows),
  };
}

function callContext(input: MetaPullInput): Omit<GraphCall, "path"> {
  return {
    version: input.graphVersion,
    token: input.accessToken,
    appSecret: input.appSecret,
    fetchImpl: input.fetchImpl,
    sleep: input.sleep,
    log: input.log,
    deadline: input.deadline,
  };
}

async function pullAsyncInsights(input: MetaPullInput & { accountId: string }) {
  const common = callContext(input);
  const created = asRecord(
    await graphPost({
      ...common,
      path: `${input.accountId}/insights`,
      params: insightParams(input),
    }),
  );
  const reportId = str(created.report_run_id);
  if (!reportId) throw new Error("Meta insights job did not return a report_run_id");
  const pollDeadline = Math.min(Date.now() + 10 * 60_000, input.deadline ?? Date.now() + 10 * 60_000);
  let status = "";
  let waitMs = ASYNC_POLL_START_MS;
  while (Date.now() < pollDeadline) {
    const job = asRecord(
      await graphGet({ ...common, path: reportId, params: { fields: "async_status,async_percent_completion" } }),
    );
    status = str(job.async_status);
    if (status === "Job Completed") {
      return graphList({ ...common, path: `${reportId}/insights` });
    }
    if (status === "Job Failed" || status === "Job Skipped") {
      throw new Error(`Meta insights job ${status}`);
    }
    const reason = `insights job ${status || "running"}`;
    await waitForMeta({
      ms: waitMs,
      reason,
      path: `/${input.graphVersion}/${reportId}`,
      sleep: input.sleep,
      deadline: input.deadline ?? pollDeadline,
      log: input.log,
    });
    waitMs = Math.min(waitMs * 2, ASYNC_POLL_MAX_MS);
  }
  throw new Error(`Meta insights job timed out${status ? ` (${status})` : ""}`);
}

export async function pullAdInsights(input: MetaPullInput & { accountId: string }) {
  const common = callContext(input);
  const days = inclusiveDays(input.since, input.until);
  if (days > ASYNC_INSIGHTS_AFTER_DAYS) return pullAsyncInsights(input);
  try {
    return await graphList({
      ...common,
      path: `${input.accountId}/insights`,
      params: insightParams(input),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
    const retryAsync = status >= 500 || /reduce the amount of data|timed out|timeout/i.test(message);
    if (!retryAsync) throw error;
    return pullAsyncInsights(input);
  }
}

/** Ads that delivered in the window, or were updated since it started and are not archived. */
export function activityFilter(since: string) {
  const unix = Math.floor(Date.parse(`${since.slice(0, 10)}T00:00:00Z`) / 1000);
  return JSON.stringify([
    { field: "updated_time", operator: "GREATER_THAN", value: Number.isFinite(unix) ? unix : 0 },
    { field: "effective_status", operator: "NOT_IN", value: ["ARCHIVED", "DELETED"] },
  ]);
}

function updatedSinceFilter(since: string) {
  const unix = Math.floor(Date.parse(`${since.slice(0, 10)}T00:00:00Z`) / 1000);
  return JSON.stringify([{ field: "updated_time", operator: "GREATER_THAN", value: Number.isFinite(unix) ? unix : 0 }]);
}

function insightLinks(insights: unknown[]) {
  const adsetByAd = new Map<string, string>();
  const campaignByAdset = new Map<string, string>();
  for (const item of insights) {
    const record = asRecord(item);
    const adId = str(record.ad_id);
    const adsetId = str(record.adset_id);
    const campaignId = str(record.campaign_id);
    if (adId && adsetId && !adsetByAd.has(adId)) adsetByAd.set(adId, adsetId);
    if (adsetId && campaignId && !campaignByAdset.has(adsetId)) campaignByAdset.set(adsetId, campaignId);
  }
  return { adsetByAd, campaignByAdset };
}

function withStubs(rows: unknown[], ids: string[], stub: (id: string) => Record<string, unknown>) {
  const merged = mergeRows([rows]);
  const have = new Set(merged.map((row) => str(asRecord(row).id)));
  for (const id of ids) {
    if (!id || have.has(id)) continue;
    merged.push({ ...stub(id), _placeholder: true });
    have.add(id);
  }
  return merged;
}

function insightEntityIds(insights: unknown[]) {
  const ads = new Set<string>();
  const adsets = new Set<string>();
  const campaigns = new Set<string>();
  for (const item of insights) {
    const record = asRecord(item);
    const adId = str(record.ad_id);
    const adsetId = str(record.adset_id);
    const campaignId = str(record.campaign_id);
    if (adId) ads.add(adId);
    if (adsetId) adsets.add(adsetId);
    if (campaignId) campaigns.add(campaignId);
  }
  return { ads: [...ads], adsets: [...adsets], campaigns: [...campaigns] };
}

function mergeRows(parts: unknown[][]) {
  const byId = new Map<string, Record<string, unknown>>();
  for (const part of parts) {
    for (const item of part) {
      const record = asRecord(item);
      const id = str(record.id);
      if (!id) continue;
      const previous = byId.get(id);
      if (!previous) {
        byId.set(id, record);
        continue;
      }
      const previousCreative = asRecord(previous.creative);
      const nextCreative = asRecord(record.creative);
      const creative =
        Object.keys(nextCreative).length >= Object.keys(previousCreative).length
          ? { ...previousCreative, ...nextCreative }
          : { ...nextCreative, ...previousCreative };
      byId.set(id, { ...previous, ...record, creative: Object.keys(creative).length ? creative : previous.creative ?? record.creative });
    }
  }
  return [...byId.values()];
}

function clipError(error: unknown) {
  return redactSecrets(error instanceof Error ? error.message : "request failed").slice(0, 300);
}

export async function pullMetaAccount(input: MetaPullInput & { accountId: string }): Promise<MetaBundle> {
  const deadline = input.deadline ?? Date.now() + MAX_PULL_MS;
  const scoped = { ...input, deadline };
  const common = callContext(scoped);
  const accountId = input.accountId;
  const warnings: string[] = [];
  const account = await graphGet({ ...common, path: accountId, params: { fields: ACCOUNT_FIELDS } });
  const insights = await pullAdInsights({ ...scoped, accountId });
  const delivered = insightEntityIds(insights);

  let campaigns: unknown[] = [];
  let adsets: unknown[] = [];
  let ads: unknown[] = [];
  let audiences: unknown[] = [];
  let stopped = "";
  const stopFor = (error: unknown) => {
    stopped = clipError(error);
  };

  const listRecent = async (path: string, fields: string) => {
    try {
      return await graphList({ ...common, path, params: { fields, filtering: activityFilter(input.since) } });
    } catch (error) {
      if (isMetaBudgetStop(error)) {
        stopFor(error);
        return [];
      }
      if (error instanceof MetaGraphError && error.code === 100) {
        warnings.push(`${path} recent list skipped: ${clipError(error)}`);
        return [];
      }
      try {
        return await graphList({ ...common, path, params: { fields, filtering: updatedSinceFilter(input.since) } });
      } catch (again) {
        if (isMetaBudgetStop(again)) stopFor(again);
        else warnings.push(`${path} recent list skipped: ${clipError(again)}`);
        return [];
      }
    }
  };

  const recent = async (path: string, fields: string) => {
    if (stopped) return [];
    return listRecent(path, fields);
  };

  // The ids= query parameter is rejected for this app ("deprecated in v26.0+"), even on v23.0.
  // Delivered entities are loaded with filtering IN on the account edge, 50 ids at a time.
  const fetchIdChunks = async (
    path: string,
    fields: string,
    idField: string,
    ids: string[],
    label: string,
    options?: { batch?: number; limit?: number },
  ) => {
    const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    const rows: unknown[] = [];
    if (stopped || !unique.length) return rows;
    const batch = options?.batch ?? ID_BATCH;
    for (let index = 0; index < unique.length; index += batch) {
      const chunk = unique.slice(index, index + batch);
      const filtering = JSON.stringify([{ field: idField, operator: "IN", value: chunk }]);
      const params: Record<string, string> = { fields, filtering };
      if (options?.limit) params.limit = String(options.limit);
      try {
        rows.push(...(await graphList({ ...common, path, params })));
      } catch (error) {
        // graphRequest already retried rate-limit codes. Code 17 waits 30s doubling to 120s
        // when Meta sends neither Retry-After nor estimated_time_to_regain_access. A wait past
        // the pull deadline throws a Meta rate limit stop instead of an empty edge. Anything
        // still thrown here did not load: callers must not replace stored rows for those ids.
        if (isMetaBudgetStop(error)) stopFor(error);
        else warnings.push(`${label} skipped: ${clipError(error)}`);
        break;
      }
    }
    return rows;
  };

  const links = insightLinks(insights);
  const loadEdge = async (
    path: string,
    fields: string,
    idField: string,
    ids: string[],
    label: string,
    stub: (id: string) => Record<string, unknown>,
  ) => {
    const fetched = await fetchIdChunks(path, fields, idField, ids, label);
    const listed = await recent(path, fields);
    return withStubs(mergeRows([fetched, listed]), ids, stub);
  };

  campaigns = await loadEdge(`${accountId}/campaigns`, CAMPAIGN_FIELDS, "campaign.id", delivered.campaigns, "campaigns", (id) => ({
    id,
    name: id,
    effective_status: "UNKNOWN",
  }));
  adsets = await loadEdge(`${accountId}/adsets`, ADSET_FIELDS, "adset.id", delivered.adsets, "ad sets", (id) => ({
    id,
    name: id,
    campaign_id: links.campaignByAdset.get(id) ?? "",
    effective_status: "UNKNOWN",
  }));
  ads = await loadEdge(`${accountId}/ads`, AD_FIELDS, "ad.id", delivered.ads, "ads", (id) => ({
    id,
    name: id,
    adset_id: links.adsetByAd.get(id) ?? "",
    effective_status: "UNKNOWN",
    creative: {},
  }));
  if (!stopped) {
    const deliveredAds = new Set(delivered.ads);
    const creativeAdIds = ads.flatMap((item) => {
      const record = asRecord(item);
      if (record._placeholder === true) return [];
      const id = str(record.id);
      return id && deliveredAds.has(id) ? [id] : [];
    });
    const detailed = await fetchIdChunks(
      `${accountId}/ads`,
      CREATIVE_AD_FIELDS,
      "ad.id",
      creativeAdIds,
      "creatives",
      { batch: CREATIVE_PAGE_LIMIT, limit: CREATIVE_PAGE_LIMIT },
    );
    ads = mergeRows([ads, detailed]);
    try {
      audiences = await graphList({ ...common, path: `${accountId}/customaudiences`, params: { fields: AUDIENCE_FIELDS } });
    } catch (error) {
      if (isMetaBudgetStop(error)) stopFor(error);
      else warnings.push(`${accountId} audiences skipped: ${clipError(error)}`);
    }
  }
  return { account, campaigns, adsets, ads, audiences, insights, warnings, stopped };
}

export async function pullMetaSnapshot(input: MetaPullInput) {
  const label = input.attributionWindows.join("_");
  const deadline = input.deadline ?? Date.now() + MAX_PULL_MS;
  const parts = [];
  const failures: string[] = [];
  for (const accountId of input.accountIds) {
    try {
      const bundle = await pullMetaAccount({ ...input, accountId, deadline });
      parts.push(normalizeMetaBundle(bundle, { attributionWindow: label, platform: "meta" satisfies AdPlatform }));
      if (bundle.stopped) failures.push(`${accountId}: ${bundle.stopped}`);
    } catch (error) {
      failures.push(`${accountId}: ${redactSecrets(error instanceof Error ? error.message : "request failed").slice(0, 240)}`);
    }
  }
  const snapshot = mergeSnapshots(parts);
  if (failures.length) snapshot.warnings.push(...failures.map((failure) => `Account pull failed: ${failure}`));
  return { snapshot, failures };
}

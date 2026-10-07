import type { AdPlatform } from "../types";
import {
  graphGet,
  graphList,
  graphPost,
  isMetaBudgetStop,
  MAX_PULL_MS,
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
      try {
        return await graphList({ ...common, path, params: { fields, filtering: updatedSinceFilter(input.since) } });
      } catch (again) {
        if (isMetaBudgetStop(again)) stopFor(again);
        else warnings.push(`${path} recent list skipped: ${clipError(again)}`);
        return [];
      }
    }
  };

  const takeIds = async (ids: string[], fields: string) => {
    if (stopped) return [];
    const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    const rows: unknown[] = [];
    for (let index = 0; index < unique.length; index += ID_BATCH) {
      const chunk = unique.slice(index, index + ID_BATCH);
      let body: Record<string, unknown>;
      try {
        body = asRecord(
          await graphGet({
            ...common,
            path: "",
            params: { ids: chunk.join(","), fields },
            rowsBefore: rows.length,
          }),
        );
      } catch (error) {
        if (!isMetaBudgetStop(error)) throw error;
        stopFor(error);
        return rows;
      }
      for (const id of chunk) {
        const row = asRecord(body[id]);
        if (str(row.id)) rows.push(row);
        else if (row.error) warnings.push(`${id} skipped: ${clipError(new Error(str(asRecord(row.error).message) || "request failed"))}`);
      }
    }
    return rows;
  };

  const recent = async (path: string, fields: string) => {
    if (stopped) return [];
    return listRecent(path, fields);
  };

  try {
    campaigns = mergeRows([await takeIds(delivered.campaigns, CAMPAIGN_FIELDS), await recent(`${accountId}/campaigns`, CAMPAIGN_FIELDS)]);
    adsets = mergeRows([await takeIds(delivered.adsets, ADSET_FIELDS), await recent(`${accountId}/adsets`, ADSET_FIELDS)]);
    ads = mergeRows([await takeIds(delivered.ads, AD_FIELDS), await recent(`${accountId}/ads`, AD_FIELDS)]);
    if (!stopped) {
      const deliveredAds = new Set(delivered.ads);
      const creativeIds = ads.flatMap((item) => {
        const record = asRecord(item);
        if (!deliveredAds.has(str(record.id))) return [];
        const creativeId = str(asRecord(record.creative).id);
        return creativeId ? [creativeId] : [];
      });
      const creatives = await takeIds(creativeIds, CREATIVE_FIELDS);
      const creativeById = new Map(creatives.map((item) => [str(asRecord(item).id), item]));
      ads = ads.map((item) => {
        const record = asRecord(item);
        const creativeId = str(asRecord(record.creative).id);
        const full = creativeById.get(creativeId);
        return full ? { ...record, creative: full } : record;
      });
      try {
        audiences = await graphList({ ...common, path: `${accountId}/customaudiences`, params: { fields: AUDIENCE_FIELDS } });
      } catch (error) {
        if (isMetaBudgetStop(error)) stopFor(error);
        else warnings.push(`${accountId} audiences skipped: ${clipError(error)}`);
      }
    }
  } catch (error) {
    if (!isMetaBudgetStop(error)) throw error;
    stopFor(error);
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

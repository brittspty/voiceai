import type { AdPlatform } from "../types";
import { graphGet, graphList, graphPost, redactSecrets, type FetchLike, type Sleep } from "./meta-client";
import { asRecord, mergeSnapshots, normalizeMetaBundle, str, type MetaBundle } from "./meta-map";

const ACCOUNT_FIELDS = "id,name,account_id,currency,timezone_name,account_status";
const CAMPAIGN_FIELDS = "id,name,objective,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time";
const ADSET_FIELDS = "id,name,campaign_id,status,effective_status,optimization_goal,bid_strategy,daily_budget,targeting";
const AD_FIELDS =
  "id,name,adset_id,status,effective_status,creative{id,name,title,body,call_to_action_type,image_hash,video_id,thumbnail_url,object_story_spec,url_tags,asset_feed_spec}";
const AUDIENCE_FIELDS = "id,name,subtype,approximate_count_lower_bound,description";
const INSIGHT_FIELDS =
  "ad_id,adset_id,campaign_id,spend,impressions,reach,clicks,inline_link_clicks,actions,action_values,date_start,date_stop,video_thruplay_watched_actions";

/** Inclusive windows longer than this use Meta's async insights job. */
export const ASYNC_INSIGHTS_AFTER_DAYS = 7;

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

async function pullAsyncInsights(input: MetaPullInput & { accountId: string }) {
  const common = {
    version: input.graphVersion,
    token: input.accessToken,
    appSecret: input.appSecret,
    fetchImpl: input.fetchImpl,
    sleep: input.sleep,
  };
  const created = asRecord(
    await graphPost({
      ...common,
      path: `${input.accountId}/insights`,
      params: insightParams(input),
    }),
  );
  const reportId = str(created.report_run_id);
  if (!reportId) throw new Error("Meta insights job did not return a report_run_id");
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const deadline = Date.now() + 10 * 60_000;
  let status = "";
  while (Date.now() < deadline) {
    const job = asRecord(await graphGet({ ...common, path: reportId, params: { fields: "async_status,async_percent_completion" } }));
    status = str(job.async_status);
    if (status === "Job Completed") {
      return graphList({ ...common, path: `${reportId}/insights` });
    }
    if (status === "Job Failed" || status === "Job Skipped") {
      throw new Error(`Meta insights job ${status}`);
    }
    await sleep(5_000);
  }
  throw new Error(`Meta insights job timed out${status ? ` (${status})` : ""}`);
}

export async function pullAdInsights(input: MetaPullInput & { accountId: string }) {
  const common = {
    version: input.graphVersion,
    token: input.accessToken,
    appSecret: input.appSecret,
    fetchImpl: input.fetchImpl,
    sleep: input.sleep,
  };
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

export async function pullMetaAccount(input: MetaPullInput & { accountId: string }): Promise<MetaBundle> {
  const common = {
    version: input.graphVersion,
    token: input.accessToken,
    appSecret: input.appSecret,
    fetchImpl: input.fetchImpl,
    sleep: input.sleep,
  };
  const accountId = input.accountId;
  const warnings: string[] = [];
  const account = await graphGet({ ...common, path: accountId, params: { fields: ACCOUNT_FIELDS } });
  const [campaigns, adsets, ads] = await Promise.all([
    graphList({ ...common, path: `${accountId}/campaigns`, params: { fields: CAMPAIGN_FIELDS } }),
    graphList({ ...common, path: `${accountId}/adsets`, params: { fields: ADSET_FIELDS } }),
    graphList({ ...common, path: `${accountId}/ads`, params: { fields: AD_FIELDS } }),
  ]);
  let audiences: unknown[] = [];
  try {
    audiences = await graphList({ ...common, path: `${accountId}/customaudiences`, params: { fields: AUDIENCE_FIELDS } });
  } catch (error) {
    warnings.push(
      `${accountId} audiences skipped: ${redactSecrets(error instanceof Error ? error.message : "request failed").slice(0, 180)}`,
    );
  }
  const insights = await pullAdInsights(input);
  return { account, campaigns, adsets, ads, audiences, insights, warnings };
}

export async function pullMetaSnapshot(input: MetaPullInput) {
  const label = input.attributionWindows.join("_");
  const parts = [];
  const failures: string[] = [];
  for (const accountId of input.accountIds) {
    try {
      const bundle = await pullMetaAccount({ ...input, accountId });
      parts.push(normalizeMetaBundle(bundle, { attributionWindow: label, platform: "meta" satisfies AdPlatform }));
    } catch (error) {
      failures.push(`${accountId}: ${redactSecrets(error instanceof Error ? error.message : "request failed").slice(0, 240)}`);
    }
  }
  const snapshot = mergeSnapshots(parts);
  if (failures.length) snapshot.warnings.push(...failures.map((failure) => `Account pull failed: ${failure}`));
  return { snapshot, failures };
}

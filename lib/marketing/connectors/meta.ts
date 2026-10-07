import type { AdPlatform } from "../types";
import { graphGet, graphList, redactSecrets, type FetchLike } from "./meta-client";
import { mergeSnapshots, normalizeMetaBundle, type MetaBundle } from "./meta-map";

const ACCOUNT_FIELDS = "id,name,account_id,currency,timezone_name,account_status";
const CAMPAIGN_FIELDS = "id,name,objective,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time";
const ADSET_FIELDS = "id,name,campaign_id,status,effective_status,optimization_goal,bid_strategy,daily_budget,targeting";
const AD_FIELDS =
  "id,name,adset_id,status,effective_status,creative{id,name,title,body,call_to_action_type,image_hash,video_id,thumbnail_url,object_story_spec,url_tags,asset_feed_spec}";
const AUDIENCE_FIELDS = "id,name,subtype,approximate_count_lower_bound,description";
const INSIGHT_FIELDS =
  "ad_id,adset_id,campaign_id,spend,impressions,reach,clicks,inline_link_clicks,actions,action_values,date_start,date_stop,video_thruplay_watched_actions";

export type MetaPullInput = {
  accountIds: string[];
  accessToken: string;
  appSecret: string;
  graphVersion: string;
  since: string;
  until: string;
  attributionWindows: string[];
  fetchImpl?: FetchLike;
};

export async function pullMetaAccount(input: MetaPullInput & { accountId: string }): Promise<MetaBundle> {
  const common = {
    version: input.graphVersion,
    token: input.accessToken,
    appSecret: input.appSecret,
    fetchImpl: input.fetchImpl,
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
  const insights = await graphList({
    ...common,
    path: `${accountId}/insights`,
    params: {
      level: "ad",
      time_increment: "1",
      fields: INSIGHT_FIELDS,
      time_range: JSON.stringify({ since: input.since, until: input.until }),
      action_attribution_windows: JSON.stringify(input.attributionWindows),
    },
  });
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

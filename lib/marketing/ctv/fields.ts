/**
 * StackAdapt reporting names checked against public sources on 2026-10-31.
 *
 * Documented:
 * - REST base https://api.stackadapt.com/service/v2 and header X-AUTHORIZATION
 *   (docs.stackadapt.com). REST reporting is read-only. Writes are deprecated.
 * - GET /service/v2/delivery is the STATS_DELIVERY endpoint. Public field conv_rev
 *   is conversion revenue (Fivetran community, 2023).
 * - GET /service/v2/stats, /campaigns, /native_ads, /conversion_trackers
 *   (public swagger client brianclogan/StackAdapt-PHP-API).
 * - Delivery metrics from the public GraphQL schema mirrored by Fivetran and
 *   Porter: impressions / impressionsBigint, unique_impressions, frequency, cost,
 *   click_conversions, impression_conversions, conversion_revenue, ip_conversions,
 *   cookie_conversions, video_q_1_playbacks (25%), video_q_2_playbacks (50%),
 *   video_q_3_playbacks (75%), video_completions (100%), video_completion_rate,
 *   ecpm, ecpa, ecpc, roas, device_type, supply_source_id, campaign_group_id,
 *   campaign_id, ad_id, channel_type (Porter observed CTV).
 * - conversion_path: attribution_type, click_to_conversion_time,
 *   impression_to_conversion_time (Fivetran public schema).
 * - Hevo documents a Brand Lift Study object (name, status, campaigns).
 *
 * The logged-in reference at docs.stackadapt.com was not readable without an
 * account. Names below marked TODO(verify) are guessed.
 */

export const STACKADAPT_REST_ORIGIN = "https://api.stackadapt.com";
export const STACKADAPT_REST_PREFIX = "/service/v2";

export const STACKADAPT_DOCUMENTED_PATHS = ["/delivery", "/stats", "/campaigns", "/native_ads", "/conversion_trackers"] as const;

/** TODO(verify): REST paths for insight objects. The GraphQL object names are public. The paths are guessed. */
export const STACKADAPT_UNVERIFIED_PATHS = [
  "/insights/campaign_device",
  "/insights/campaign_supply_source",
  "/supply_sources",
  "/conversion_paths",
  "/brand_lift_studies",
  "/custom_segments",
] as const;

/** TODO(verify): query parameter names. The public swagger lists the GETs and not the query string. */
export const STACKADAPT_DATE_PARAMS = { start: "start_date", end: "end_date" } as const;

export const IMPRESSION_FIELDS = ["impressions", "impressions_bigint", "impressionsBigint"] as const;
export const UNIQUE_IMPRESSION_FIELDS = ["unique_impressions", "unique_impressions_bigint", "uniqueImpressionsBigint"] as const;
export const FREQUENCY_FIELDS = ["frequency"] as const;
export const COST_FIELDS = ["cost"] as const;
export const CLICK_CONVERSION_FIELDS = ["click_conversions", "click_conversions_bigint", "clickConversions"] as const;
export const VIEW_CONVERSION_FIELDS = ["impression_conversions", "impression_conversions_bigint", "impressionConversions"] as const;
export const REVENUE_FIELDS = ["conv_rev", "conversion_revenue", "conversionRevenue"] as const;
export const IP_CONVERSION_FIELDS = ["ip_conversions", "ip_conversions_bigint", "ipConversions"] as const;
export const COOKIE_CONVERSION_FIELDS = ["cookie_conversions", "cookie_conversions_bigint", "cookieConversions"] as const;
export const VIDEO_Q1_FIELDS = ["video_q_1_playbacks", "video_q1_playbacks", "videoQ1PlaybacksBigint"] as const;
export const VIDEO_Q2_FIELDS = ["video_q_2_playbacks", "video_q2_playbacks", "videoQ2PlaybacksBigint"] as const;
export const VIDEO_Q3_FIELDS = ["video_q_3_playbacks", "video_q3_playbacks", "videoQ3PlaybacksBigint"] as const;
export const VIDEO_COMPLETE_FIELDS = ["video_completions", "video_completions_bigint", "videoCompletionsBigint"] as const;
export const VIDEO_RATE_FIELDS = ["video_completion_rate", "videoCompletionRate"] as const;
export const DEVICE_FIELDS = ["device_type", "deviceType"] as const;
export const SUPPLY_ID_FIELDS = ["supply_source_id", "supplySourceId"] as const;
/** TODO(verify): insight rows expose supply_source_id. The joined publisher name is guessed. */
export const SUPPLY_NAME_FIELDS = ["supply_source_name", "supplySourceName", "publisher", "app_name"] as const;
export const CHANNEL_FIELDS = ["channel_type", "channelType", "campaign_channel"] as const;
export const CAMPAIGN_GROUP_FIELDS = ["campaign_group_id", "campaignGroupId"] as const;
export const CAMPAIGN_FIELDS = ["campaign_id", "campaignId"] as const;
export const CAMPAIGN_NAME_FIELDS = ["campaign_group_name", "campaignGroupName", "campaign_name", "campaignName", "name"] as const;
export const LINE_NAME_FIELDS = ["line_item_name", "lineItemName"] as const;
export const AD_FIELDS = ["ad_id", "native_ad_id"] as const;
/** TODO(verify): creative_id is not a column on the public ad object. ad_id is. */
export const CREATIVE_FIELDS = ["creative_id", "creativeId"] as const;
export const AD_NAME_FIELDS = ["ad_name", "adName", "native_ad_name"] as const;
/** TODO(verify): custom_segment exists. The delivery breakdown key is guessed. */
export const AUDIENCE_FIELDS = ["custom_segment_id", "customSegmentId", "audience_id", "audienceId", "segment_id"] as const;
export const AUDIENCE_NAME_FIELDS = ["custom_segment_name", "audience_name", "audienceName"] as const;
/**
 * TODO(verify): household_id is not on the public delivery objects.
 * unique_impressions is the documented reach field and is stored beside it.
 */
export const HOUSEHOLD_FIELDS = ["household_id", "householdId"] as const;
/** TODO(verify): site visit field. ga4_sessions is documented and is only a proxy. */
export const SITE_VISIT_FIELDS = ["ga4_sessions", "ga4Sessions", "site_visits", "siteVisits"] as const;
/** TODO(verify): conversion tracker window field names are not in the public schema. */
export const CLICK_WINDOW_FIELDS = ["click_through_window", "clickThroughWindow", "click_lookback"] as const;
export const VIEW_WINDOW_FIELDS = ["view_through_window", "viewThroughWindow", "view_lookback"] as const;
export const CPM_FIELDS = ["ecpm"] as const;
export const CPA_FIELDS = ["ecpa"] as const;
export const CPC_FIELDS = ["ecpc"] as const;
export const ROAS_FIELDS = ["roas"] as const;
export const PATH_CLICK_LAG_FIELDS = ["click_to_conversion_time", "clickToConversionTime"] as const;
export const PATH_VIEW_LAG_FIELDS = ["impression_to_conversion_time", "impressionToConversionTime"] as const;
export const PATH_TYPE_FIELDS = ["attribution_type", "attributionType"] as const;

import { addDaysISO, zonedISODate } from "../../time";
import type { MetaBundle } from "./meta-map";

/**
 * Labeled fixture shaped like Meta Marketing API payloads.
 * Names start with MOCK. Numbers are illustrative, not a live account.
 */
export function mockMetaBundle(now: Date, timeZone = "America/New_York"): MetaBundle {
  const until = zonedISODate(now, timeZone);
  const days = [2, 1, 0].map((offset) => addDaysISO(until, -offset));
  const accountId = "act_000000000000001";

  const creative = (
    id: string,
    name: string,
    headline: string,
    body: string,
    image: string,
  ) => ({
    id,
    name,
    title: headline,
    body,
    call_to_action_type: "LEARN_MORE",
    image_hash: image,
    url_tags: "utm_source=facebook&utm_medium=paid",
    object_story_spec: {
      link_data: {
        name: headline,
        message: body,
        description: "MOCK description",
        link: "https://example.com/mock/offer?utm_source=facebook",
        image_hash: image,
        call_to_action: { type: "LEARN_MORE", value: { link: "https://example.com/mock/offer?utm_source=facebook" } },
      },
    },
  });

  const ads = [
    {
      id: "ad_mock_1",
      name: "MOCK Roof storm v1",
      adset_id: "as_mock_1",
      status: "ACTIVE",
      effective_status: "ACTIVE",
      creative: creative("cr_mock_1", "MOCK Roof storm", "Storm damage? Start here", "A 30 second roof check.", "hash_roof_a"),
    },
    {
      id: "ad_mock_2",
      name: "MOCK Roof storm v2",
      adset_id: "as_mock_1",
      status: "ACTIVE",
      effective_status: "ACTIVE",
      creative: creative("cr_mock_2", "MOCK Roof storm v2", "See the storm photos", "Same offer, different hook.", "hash_roof_b"),
    },
    {
      id: "ad_mock_3",
      name: "MOCK Medicare intro",
      adset_id: "as_mock_2",
      status: "PAUSED",
      effective_status: "PAUSED",
      creative: creative("cr_mock_3", "MOCK Medicare intro", "A short Medicare introduction", "Request a conversation.", "hash_med_a"),
    },
  ];

  const insights = ads.flatMap((ad, index) =>
    days.map((date, dayIndex) => ({
      ad_id: ad.id,
      adset_id: ad.adset_id,
      campaign_id: ad.adset_id === "as_mock_1" ? "c_mock_leads" : "c_mock_traffic",
      date_start: date,
      date_stop: date,
      spend: (10 + index + dayIndex).toFixed(2),
      impressions: String(1000 + index * 100 + dayIndex * 10),
      reach: String(800 + index * 50),
      clicks: String(20 + index * 3 + dayIndex),
      inline_link_clicks: String(15 + index),
      actions: [
        { action_type: "lead", value: String(index + dayIndex + 1) },
        { action_type: "onsite_conversion.lead_grouped", value: String(index + dayIndex + 1) },
        { action_type: "link_click", value: String(15 + index) },
        { action_type: "video_view", value: String(40 + index) },
      ],
      action_values: [{ action_type: "purchase", value: "0" }],
      video_thruplay_watched_actions: [{ action_type: "video_view", value: String(5 + index) }],
    })),
  );

  return {
    account: {
      id: accountId,
      account_id: "000000000000001",
      name: "MOCK Meta account",
      currency: "USD",
      timezone_name: timeZone,
      account_status: 1,
    },
    campaigns: [
      {
        id: "c_mock_leads",
        name: "MOCK — Roof leads",
        objective: "OUTCOME_LEADS",
        status: "ACTIVE",
        effective_status: "ACTIVE",
        daily_budget: "5000",
        start_time: `${days[0]}T00:00:00-0400`,
      },
      {
        id: "c_mock_traffic",
        name: "MOCK — Medicare traffic",
        objective: "OUTCOME_TRAFFIC",
        status: "PAUSED",
        effective_status: "PAUSED",
        lifetime_budget: "25000",
        start_time: `${days[0]}T00:00:00-0400`,
      },
    ],
    adsets: [
      {
        id: "as_mock_1",
        name: "MOCK — Florida homeowners",
        campaign_id: "c_mock_leads",
        status: "ACTIVE",
        effective_status: "ACTIVE",
        optimization_goal: "LEAD_GENERATION",
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        targeting: { custom_audiences: [{ id: "aud_mock_vh", name: "MOCK verified homeowners" }] },
      },
      {
        id: "as_mock_2",
        name: "MOCK — Broad Medicare",
        campaign_id: "c_mock_traffic",
        status: "PAUSED",
        effective_status: "PAUSED",
        optimization_goal: "LINK_CLICKS",
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        targeting: {
          custom_audiences: [{ id: "aud_mock_lal", name: "MOCK lookalike" }],
          excluded_custom_audiences: [{ id: "aud_mock_excl", name: "MOCK exclusions" }],
        },
      },
    ],
    ads,
    audiences: [
      {
        id: "aud_mock_vh",
        name: "MOCK verified homeowners",
        subtype: "CUSTOM",
        approximate_count_lower_bound: 12000,
        description: "Fixture audience",
      },
      {
        id: "aud_mock_lal",
        name: "MOCK lookalike",
        subtype: "LOOKALIKE",
        approximate_count_lower_bound: 200000,
        description: "Fixture lookalike",
      },
    ],
    insights,
    warnings: [],
  };
}

/**
 * Shapes follow the published Ads API examples.
 * They are illustrative accounts, not a customer's data.
 */

export const AD_ACCOUNT_FIXTURE = {
  id: "adacct_123",
  name: "Acme LLC",
  legal_name: "Acme LLC",
  account_name: "Acme US campaigns",
  brand_name: "Acme",
  url: "https://www.acme.example",
  preview_url: null,
  status: "active",
  timezone: "UTC",
  currency_code: "USD",
  review: { status: "approved" },
};

export const CAMPAIGN_LIST_FIXTURE = {
  object: "list",
  data: [
    {
      id: "cmpn_101",
      created_at: 1735689600,
      status: "paused",
      bidding_type: "impressions",
      budget: { lifetime_spend_limit_micros: 25000000 },
      conversion_event_setting_ids: [],
      description: "Promote the new productivity bundle.",
      end_time: 1738368000,
      mode: null,
      name: "Spring launch",
      start_time: 1735689600,
      targeting: {},
      updated_at: 1735776000,
    },
  ],
  first_id: "cmpn_101",
  last_id: "cmpn_101",
  has_more: false,
};

export const AD_GROUP_LIST_FIXTURE = {
  object: "list",
  data: [
    {
      id: "adgrp_301",
      campaign_id: "cmpn_101",
      name: "US English",
      status: "paused",
      context_hints: ["productivity", "team collaboration"],
      bidding_config: { billing_event_type: "impression", max_bid_micros: 60000 },
    },
  ],
  has_more: false,
};

export const AD_LIST_FIXTURE = {
  object: "list",
  data: [
    {
      id: "ad_501",
      ad_group_id: "adgrp_301",
      name: "Planner launch card",
      status: "paused",
      creative: {
        type: "chat_card",
        title: "Try the new workspace planner",
        body: "Coordinate tasks, docs, and meetings in one place.",
        target_url: "https://example.com/workspace-planner",
        file_id: "file_901",
      },
    },
  ],
  has_more: false,
};

/** Insights `spend` is shown as 18.42 in the docs. Units are not stated. */
export const INSIGHTS_FIXTURE = {
  object: "list",
  data: [
    {
      id: "start=1777075200:end=1777161600:entity_id=cmpn_101",
      start_time: 1777075200,
      end_time: 1777161600,
      readable_time: "2026-04-25",
      campaign_id: "cmpn_101",
      campaign_name: "Spring launch",
      impressions: 1200,
      clicks: 36,
      spend: 18.42,
    },
    {
      id: "start=1777161600:end=1777248000:entity_id=cmpn_101",
      start_time: 1777161600,
      end_time: 1777248000,
      readable_time: "2026-04-26",
      campaign_id: "cmpn_101",
      campaign_name: "Spring launch",
      impressions: 980,
      clicks: 29,
      spend: 14.86,
      country: "US",
      device: "desktop",
      platform: "desktop_web",
    },
  ],
  count: 2,
  first_id: "start=1777075200:end=1777161600:entity_id=cmpn_101",
  last_id: "start=1777161600:end=1777248000:entity_id=cmpn_101",
  has_more: false,
};

export const CONVERSION_INSIGHTS_FIXTURE = {
  object: "list",
  account_currency: "USD",
  data: [
    {
      entity_id: "cmpn_123",
      conversions: 10,
      click_through_conversions: 7,
      view_through_conversions: 3,
      order_created_attributed_sales: "0",
      order_created_attributed_sales_currency: "USD",
    },
  ],
  count: 1,
};

export const AUDIENCE_LIST_FIXTURE = {
  object: "list",
  data: [{ id: "aud_1", name: "Example visitors", status: "ready" }],
  has_more: false,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function created(prefix: string, body: unknown) {
  const record = asRecord(body);
  const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : "Draft";
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 16) || "draft";
  return { id: `${prefix}_${slug}`, name, status: "paused" };
}

/** Mock responses stay paused on create. Activate is the only path that returns active. */
export function mockChatgptAdsResponse(method: string, path: string, body: unknown) {
  if (method === "GET" && path === "/ad_account") return AD_ACCOUNT_FIXTURE;
  if (method === "GET" && path === "/campaigns") return CAMPAIGN_LIST_FIXTURE;
  if (method === "GET" && path === "/ad_groups") return AD_GROUP_LIST_FIXTURE;
  if (method === "GET" && path === "/ads") return AD_LIST_FIXTURE;
  if (method === "GET" && path === "/custom_audiences") return AUDIENCE_LIST_FIXTURE;
  if (method === "GET" && path.endsWith("/insights")) return INSIGHTS_FIXTURE;
  if (method === "POST" && path === "/conversions/insights") return CONVERSION_INSIGHTS_FIXTURE;
  if (method === "POST" && path === "/campaigns") return created("cmpn", body);
  if (method === "POST" && path === "/ad_groups") return created("adgrp", body);
  if (method === "POST" && path === "/ads") return created("ad", body);
  if (method === "POST" && path.endsWith("/activate")) {
    const parts = path.split("/").filter(Boolean);
    return { id: parts[1] || "cmpn_101", status: "active" };
  }
  return { object: "list", data: [], has_more: false };
}

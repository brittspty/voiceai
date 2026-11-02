import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { connectionFor, exampleRegistryState, openToken, sealToken } from "./channels/registry";
import { adaptChannelDaily } from "./channels/adapters";
import { chatgptAdsEnabled, chatgptAdsSpendUnit, channelRegistryEnabled } from "./config";
import { chatgptAudits, resetChatgptAudits } from "./chatgpt-ads/audit";
import { connectChatgptAds, disconnectChatgptAds, presentChatgptConnection, resolveChatgptAdsKey } from "./chatgpt-ads/connect";
import { parseAdsManagerCsv } from "./chatgpt-ads/csv";
import { INSIGHTS_FIXTURE } from "./chatgpt-ads/fixtures";
import {
  DEFAULT_CLICK_DAYS,
  DEFAULT_VIEW_DAYS,
  INSIGHTS_MAX_ROWS,
  SPEND_LAG_HOURS,
  SPEND_REPLAY_DAYS,
  buildInsightQuery,
  interpretSpend,
  loadChatgptAdsInsights,
  mapInsightPayload,
  microsToDollars,
  presentChatgptAdsReport,
  toChannelDaily,
  withSpendReplay,
} from "./chatgpt-ads/reporting";
import { buildPausedCampaign, createPausedChatgptAds, launchChatgptAds, suggestChatgptCreative, type WizardDraft } from "./chatgpt-ads/setup";
import { AdBudgetWriteBlockedError, CHATGPT_ADS_STAFF_GRANT, assertNoAdBudgetWrite } from "./connectors/budget-lock";
import {
  ChatgptAdsNotAllowedError,
  ChatgptAdsRequestError,
  chatgptAdsRequest,
  classifyChatgptAdsRequest,
  redactAdsSecrets,
} from "./connectors/chatgpt-ads-client";
import { collectsCostKeys } from "./channels/cost-strip";
import { forbiddenClientKeys } from "./client-view";

const ROOT = path.resolve(import.meta.dirname, "../..");
const ON = { CHANNEL_REGISTRY: "on", CHATGPT_ADS: "on" };
const KEY = "sk-test-openai-ads-key-ok99";
const ACTOR = { id: "staff-1", kind: "super_admin" };

function draft(overrides: Partial<WizardDraft> = {}): WizardDraft {
  return {
    campaignName: "Spring launch",
    lifetimeSpendLimitMicros: 25_000_000,
    adGroupName: "US English",
    maxBidMicros: 60_000,
    contextHints: ["productivity"],
    platforms: ["web"],
    locations: ["2000043"],
    audienceInclude: ["aud_1"],
    audienceExclude: ["aud_2"],
    adName: "Planner launch card",
    title: "Try the planner",
    body: "Coordinate tasks in one place.",
    imageFileId: "file_901",
    link: "https://example.com/planner",
    utmSource: "chatgpt",
    utmMedium: "paid",
    ...overrides,
  };
}

test("ChatGPT Ads stays off until the registry and its own flag are on", () => {
  assert.equal(channelRegistryEnabled({}), false);
  assert.equal(chatgptAdsEnabled({}), false);
  assert.equal(chatgptAdsEnabled({ CHANNEL_REGISTRY: "on" }), false);
  assert.equal(chatgptAdsEnabled({ CHATGPT_ADS: "on" }), false);
  assert.equal(chatgptAdsEnabled(ON), true);
  assert.equal(chatgptAdsSpendUnit({}), "unverified");
  const example = readFileSync(path.join(ROOT, ".env.example"), "utf8");
  assert.match(example, /CHANNEL_REGISTRY=off/);
  assert.match(example, /CHATGPT_ADS=off/);
  assert.match(example, /CHATGPT_ADS_MODE=mock/);
  const seeded = exampleRegistryState().registry.find((row) => row.key === "chatgpt_ads");
  assert.equal(seeded?.staffLabel, "ChatGPT Ads");
  assert.equal(seeded?.writesEnabled, false);
  assert.equal(seeded?.auth, "api_key");
});

test("the Ads API allowlist permits reads and one conversion report, and blocks everything else", async () => {
  const origin = "https://api.ads.openai.com/v1";
  for (const path of ["/ad_account", "/campaigns", "/ad_groups", "/ads", "/ad_account/insights", "/campaigns/cmpn_101/insights", "/custom_audiences"]) {
    assert.equal(classifyChatgptAdsRequest("GET", `${origin}${path}`), "read", path);
  }
  assert.equal(classifyChatgptAdsRequest("POST", `${origin}/conversions/insights`), "read_post");
  assert.equal(classifyChatgptAdsRequest("POST", `${origin}/campaigns`), "staff_write");
  assert.equal(classifyChatgptAdsRequest("POST", `${origin}/campaigns/cmpn_101/activate`), "staff_write");
  for (const target of [
    ["POST", `${origin}/conversions`],
    ["POST", `${origin}/pixel`],
    ["POST", `${origin}/ad_account/brand`],
    ["POST", `${origin}/ad_account/daily_spend_limit`],
    ["POST", `${origin}/ad_account/spend_limit_windows`],
    ["PATCH", `${origin}/campaigns/cmpn_101`],
    ["DELETE", `${origin}/ads/ad_501`],
    ["GET", "https://example.com/v1/ad_account"],
    ["GET", "http://api.ads.openai.com/v1/ad_account"],
  ] as const) {
    assert.equal(classifyChatgptAdsRequest(target[0], target[1]), "blocked", target[1]);
  }
  await assert.rejects(() => chatgptAdsRequest({ method: "POST", path: "/pixel", apiKey: KEY, actor: "bot" }), ChatgptAdsNotAllowedError);
});

test("bots cannot write budgets, bids, or launch", async () => {
  const url = "https://api.ads.openai.com/v1/campaigns";
  assert.throws(
    () => assertNoAdBudgetWrite({ method: "POST", url, body: { budget: { lifetime_spend_limit_micros: 25_000_000 } } }),
    AdBudgetWriteBlockedError,
  );
  assert.throws(
    () => assertNoAdBudgetWrite({ method: "POST", url: "https://api.ads.openai.com/v1/ad_groups", body: { bidding_config: { max_bid_micros: 60_000 } } }),
    AdBudgetWriteBlockedError,
  );
  assert.throws(
    () => assertNoAdBudgetWrite({ method: "POST", url: "https://api.ads.openai.com/v1/campaigns/cmpn_101/activate" }),
    (error: unknown) => error instanceof AdBudgetWriteBlockedError && /launch/.test(error.message),
  );
  assert.throws(
    () =>
      assertNoAdBudgetWrite({
        method: "POST",
        url,
        body: { status: "active", budget: { lifetime_spend_limit_micros: 25_000_000 } },
        staffGrant: CHATGPT_ADS_STAFF_GRANT,
      }),
    (error: unknown) => error instanceof AdBudgetWriteBlockedError && /launch/.test(error.message),
  );
  assert.doesNotThrow(() =>
    assertNoAdBudgetWrite({
      method: "POST",
      url,
      body: { status: "paused", budget: { lifetime_spend_limit_micros: 25_000_000 } },
      staffGrant: CHATGPT_ADS_STAFF_GRANT,
    }),
  );
  await assert.rejects(
    () => chatgptAdsRequest({ method: "POST", path: "/campaigns", apiKey: KEY, actor: "staff", body: { status: "paused" } }),
    AdBudgetWriteBlockedError,
  );
  const staffRoute = readFileSync(path.join(ROOT, "app/api/marketing/chatgpt-ads/staff/route.ts"), "utf8");
  const allowed = new Set([
    "lib/marketing/connectors/budget-lock.ts",
    "app/api/marketing/chatgpt-ads/staff/route.ts",
    "lib/marketing/chatgpt-ads.test.ts",
  ]);
  const hits: string[] = [];
  for (const file of ["lib/marketing/connectors/chatgpt-ads-client.ts", "lib/marketing/chatgpt-ads/setup.ts", "lib/marketing/chatgpt-ads/connect.ts"]) {
    if (readFileSync(path.join(ROOT, file), "utf8").includes("CHATGPT_ADS_STAFF_GRANT")) hits.push(file);
  }
  assert.deepEqual(hits, []);
  assert.equal(allowed.has("app/api/marketing/chatgpt-ads/staff/route.ts"), true);
  assert.match(staffRoute, /CHATGPT_ADS_STAFF_GRANT/);
});

test("creates stay paused and launch requires staff confirmation", async () => {
  const capture: { method: string; path: string; body: unknown }[] = [];
  let called = false;
  const created = await createPausedChatgptAds({
    env: ON,
    actor: ACTOR,
    apiKey: KEY,
    staffGrant: CHATGPT_ADS_STAFF_GRANT,
    draft: draft(),
    clientKey: "harbor",
    mode: "mock",
    capture,
    fetchImpl: async () => {
      called = true;
      throw new Error("network");
    },
  });
  assert.equal(called, false);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.deepEqual(created.statuses, ["paused", "paused", "paused"]);
  const bodies = capture.map((call) => call.body as { status?: string; budget?: { lifetime_spend_limit_micros?: number }; bidding_config?: { max_bid_micros?: number } });
  assert.equal(bodies.every((body) => body.status === "paused"), true);
  assert.equal(bodies[0]?.budget?.lifetime_spend_limit_micros, 25_000_000);
  assert.equal(bodies[1]?.bidding_config?.max_bid_micros, 60_000);
  const forced = buildPausedCampaign(draft());
  assert.equal(forced.ok && forced.body.status, "paused");
  const owner = await launchChatgptAds({
    env: ON,
    actor: { id: "owner", kind: "client_owner" },
    apiKey: KEY,
    staffGrant: CHATGPT_ADS_STAFF_GRANT,
    entity: "campaign",
    id: created.campaignId,
    confirmed: true,
    clientKey: "harbor",
    capture: [],
  });
  assert.equal(owner.ok, false);
  if (!owner.ok) assert.equal(owner.status, 403);
  const unconfirmed = await launchChatgptAds({
    env: ON,
    actor: ACTOR,
    apiKey: KEY,
    staffGrant: CHATGPT_ADS_STAFF_GRANT,
    entity: "campaign",
    id: created.campaignId,
    confirmed: false,
    clientKey: "harbor",
  });
  assert.equal(unconfirmed.ok, false);
  const launched = await launchChatgptAds({
    env: ON,
    actor: { id: "am", kind: "account_manager" },
    apiKey: KEY,
    staffGrant: CHATGPT_ADS_STAFF_GRANT,
    entity: "campaign",
    id: created.campaignId,
    confirmed: true,
    clientKey: "harbor",
    mode: "mock",
  });
  assert.equal(launched.ok, true);
  if (launched.ok) assert.equal(launched.statusText, "active");
  const suggestion = suggestChatgptCreative({ product: "Planner", audience: "ops teams", lifetimeSpendLimitMicros: 9 } as { product: string; audience: string });
  assert.equal(JSON.stringify(suggestion).includes("lifetime"), false);
  assert.equal(JSON.stringify(suggestion).includes("micros"), false);
  assert.match(chatgptAudits("harbor").map((row) => row.action).join(","), /create/);
  assert.match(chatgptAudits("harbor").map((row) => row.action).join(","), /launch/);
  resetChatgptAudits();
});

test("clients lose spend and the reporting model keeps the lag and attribution", () => {
  const rows = mapInsightPayload(INSIGHTS_FIXTURE, { unit: "unverified", granularity: "daily" });
  assert.equal(rows[0]?.spend, 18.42);
  assert.equal(rows[0]?.spendUnitNeedsVerification, true);
  assert.equal(rows[0]?.spendLagHours, SPEND_LAG_HOURS);
  assert.equal(rows[0]?.attributionClickDays, DEFAULT_CLICK_DAYS);
  assert.equal(rows[0]?.attributionViewDays, DEFAULT_VIEW_DAYS);
  assert.equal(rows[1]?.breakdownCountry, "US");
  assert.equal(rows[1]?.breakdownPlatform, "desktop_web");
  const dollars = interpretSpend(18.42, "dollars");
  assert.equal(dollars.spendUnitNeedsVerification, false);
  assert.equal(interpretSpend(18_420_000, "micros").spend, microsToDollars(18_420_000));
  const client = presentChatgptAdsReport({ rows, spend: 18.42, budget: 25 }, "client");
  assert.deepEqual(collectsCostKeys(client), []);
  assert.deepEqual(forbiddenClientKeys(client), []);
  const daily = toChannelDaily(rows[0]!);
  assert.equal(adaptChannelDaily(daily).channel, "chatgpt_ads");
  assert.equal(adaptChannelDaily(daily).spend, 18.42);
  const replay = withSpendReplay({ since: "2026-04-26", until: "2026-04-26" });
  assert.equal(replay.since, "2026-04-24");
  assert.equal(replay.replayDays, SPEND_REPLAY_DAYS);
  const query = buildInsightQuery({ since: "2026-04-01", until: "2026-04-26", segment: "country", granularity: "daily" });
  assert.equal(query.ok, true);
  if (query.ok) {
    assert.equal(query.query.attribution_window_days, 30);
    assert.equal(query.query.view_through_attribution_window_days, 1);
    assert.equal(query.query.limit, INSIGHTS_MAX_ROWS);
  }
  assert.equal(buildInsightQuery({ since: "2024-01-01", until: "2026-04-26" }).ok, false);
  assert.equal(buildInsightQuery({ since: "2026-04-01", until: "2026-04-02", limit: 2001 }).ok, false);
  assert.equal(buildInsightQuery({ since: "2026-04-01", until: "2026-04-02", granularity: "weekly" as "daily" }).ok, false);
  const csv = parseAdsManagerCsv("date,campaign name,impressions,clicks,amount spent,conversions\n2026-04-25,Spring launch,1200,36,18.42,2\n");
  assert.equal(csv.rows[0]?.channel, "chatgpt_ads");
  assert.equal(csv.rows[0]?.spend, 18.42);
  assert.equal(csv.rows[0]?.source, "csv");
});

test("a pasted key is sealed by the registry, never returned, and disconnect removes it", async () => {
  const env = { ...ON, OPENAI_ADS_API_KEY: "sk-env-key-should-not-be-used-99" };
  const logs: string[] = [];
  let called = false;
  const rejected = await connectChatgptAds({
    state: exampleRegistryState(),
    env,
    actor: ACTOR,
    clientId: "harbor",
    apiKey: "invalid-openai-ads-key-xxxx",
    mode: "mock",
    log: (line) => logs.push(line),
    fetchImpl: async () => {
      called = true;
      throw new Error("network");
    },
  });
  assert.equal(called, false);
  assert.equal(rejected.ok, false);
  assert.equal(JSON.stringify(rejected).includes("invalid-openai-ads-key-xxxx"), false);
  assert.equal(connectionFor(rejected.state, "harbor", "chatgpt_ads")?.tokenRef ?? null, null);
  const connected = await connectChatgptAds({
    state: exampleRegistryState(),
    env,
    actor: { id: "owner", kind: "client_owner" },
    clientId: "harbor",
    apiKey: KEY,
    mode: "mock",
    log: (line) => logs.push(line),
    fetchImpl: async () => {
      called = true;
      throw new Error(KEY);
    },
  });
  assert.equal(called, false);
  assert.equal(connected.ok, true);
  if (!connected.ok) return;
  const packed = JSON.stringify({ view: connected.view, logs });
  assert.equal(packed.includes(KEY), false);
  assert.match(packed, /ok99/);
  const sealed = connectionFor(connected.state, "harbor", "chatgpt_ads");
  assert.match(sealed?.tokenRef || "", /^v1\./);
  assert.equal(String(sealed?.tokenRef).includes(KEY), false);
  assert.equal(sealed?.writesEnabled, false);
  assert.equal(openToken(sealed?.tokenRef || "", env), KEY);
  assert.equal(resolveChatgptAdsKey(exampleRegistryState(), "harbor", env), null);
  assert.equal(resolveChatgptAdsKey(connected.state, "harbor", env), KEY);
  const removed = disconnectChatgptAds({
    state: connected.state,
    env,
    actor: ACTOR,
    clientId: "harbor",
    confirm: true,
  });
  assert.equal(removed.ok, true);
  if (!removed.ok) return;
  assert.equal(connectionFor(removed.state, "harbor", "chatgpt_ads")?.tokenRef, null);
  assert.equal(connectionFor(removed.state, "harbor", "chatgpt_ads")?.state, "disconnected");
  assert.equal(resolveChatgptAdsKey(removed.state, "harbor", env), null);
  assert.equal(presentChatgptConnection(removed.state, "harbor", env).keyLast4, "");
  assert.equal(JSON.stringify(removed.view).includes(KEY), false);
  const round = sealToken(KEY, env);
  assert.equal(round.includes(KEY), false);
  assert.equal(openToken(round, env), KEY);
  await assert.rejects(
    () => chatgptAdsRequest({ method: "GET", path: "/ad_account", apiKey: KEY, mode: "live", env, fetchImpl: async () => { throw new Error(`down ${KEY}`); } }),
    (error: unknown) => error instanceof ChatgptAdsRequestError && !String(error.message).includes(KEY),
  );
  assert.equal(redactAdsSecrets(`Bearer ${KEY}`, [KEY]).includes(KEY), false);
  const report = await loadChatgptAdsInsights({ apiKey: KEY, since: "2026-04-20", until: "2026-04-26", env, mode: "mock", fetchImpl: async () => { throw new Error("network"); } });
  assert.equal(report.ok, true);
  if (report.ok) {
    assert.equal(report.spendUnitNeedsVerification, true);
    assert.match(report.attribution, /30-day click \/ 1-day view/);
    assert.equal(report.rows.some((row) => row.spend === 18.42), true);
  }
});

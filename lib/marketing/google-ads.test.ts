import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GoogleAdsConnection } from "../../components/google-ads-connection";
import { accessFromUser } from "./access";
import { decideGoogleAdsSync } from "./config";
import { mockGoogleAdsBundle } from "./connectors/google-fixtures";
import {
  GOOGLE_ADS_MUTATE_PATHS,
  GOOGLE_ADS_TOKEN_URL,
  GoogleAdsWriteBlockedError,
  classifyGoogleAdsRequest,
  googleAdsRequest,
  googleAdsSearch,
  googleAdsServiceUrl,
  redactGoogleSecrets,
  refreshGoogleAdsAccessToken,
  type FetchLike,
} from "./connectors/google-ads-client";
import { mapGoogleBudget, mapGoogleObjective, mapGoogleStatus, normalizeGoogleAdsBundle } from "./connectors/google-ads-map";
import { pullGoogleAdsSnapshot } from "./connectors/google-ads";
import { getConnector } from "./connectors/registry";
import { describeGoogleAdsConnection, googleAdsConnectionDenial } from "./google-connection";
import { runGoogleAdsSync } from "./google-sync";
import { createMemoryStore } from "./store";

const NOW = new Date("2026-10-07T15:00:00.000Z");
const TZ = "America/New_York";
const ROOT = path.resolve(import.meta.dirname, "../..");
const CUSTOMER = "1234567890";
const SECRET = "dev-token-super-secret";

function liveEnv(extra: Record<string, string> = {}) {
  return {
    MARKETING_GOOGLE_ADS: "on",
    MARKETING_SYNC_MODE: "live",
    GOOGLE_ADS_DEVELOPER_TOKEN: SECRET,
    GOOGLE_ADS_CLIENT_ID: "client-id-value",
    GOOGLE_ADS_CLIENT_SECRET: "client-secret-value",
    GOOGLE_ADS_REFRESH_TOKEN: "refresh-token-value",
    GOOGLE_ADS_LOGIN_CUSTOMER_ID: "200-000-0002",
    ...extra,
  };
}

test("search and searchStream are the only allowed Google Ads calls", () => {
  const search = `https://googleads.googleapis.com/v21/customers/${CUSTOMER}/googleAds:search`;
  const stream = `https://googleads.googleapis.com/v21/customers/${CUSTOMER}/googleAds:searchStream`;
  assert.equal(classifyGoogleAdsRequest("POST", search), "search");
  assert.equal(classifyGoogleAdsRequest("POST", stream), "searchStream");
  assert.equal(googleAdsServiceUrl("v21", CUSTOMER, "search"), search);
  assert.equal(classifyGoogleAdsRequest("GET", search), "blocked");
  assert.equal(classifyGoogleAdsRequest("POST", search.replace("https:", "http:")), "blocked");
  assert.equal(classifyGoogleAdsRequest("POST", search.replace("googleads.googleapis.com", "evil.example")), "blocked");
  assert.equal(classifyGoogleAdsRequest("POST", `${search}?page=1`), "blocked");
  assert.equal(classifyGoogleAdsRequest("POST", `${search.slice(0, -6)}Search`), "blocked");
  assert.equal(classifyGoogleAdsRequest("POST", `https://googleads.googleapis.com/v21/customers/${CUSTOMER}/googleAds:search/../../../campaigns:mutate`), "blocked");
  assert.equal(classifyGoogleAdsRequest("POST", GOOGLE_ADS_TOKEN_URL), "blocked");
  assert.throws(() => googleAdsServiceUrl("v21", "../mutate", "search"), GoogleAdsWriteBlockedError);
  assert.throws(() => googleAdsServiceUrl("not-a-version", CUSTOMER, "search"), GoogleAdsWriteBlockedError);
});

test("every mutate endpoint is rejected before fetch", async () => {
  let calls = 0;
  const fetchImpl: FetchLike = async () => {
    calls += 1;
    throw new Error("fetch should not run");
  };
  const hostile = [
    ...GOOGLE_ADS_MUTATE_PATHS.map((path) => `https://googleads.googleapis.com/v21/customers/${CUSTOMER}/${path}`),
    `https://googleads.googleapis.com/v21/customers/${CUSTOMER}:uploadClickConversions`,
    `https://googleads.googleapis.com/v18/customers/${CUSTOMER}/googleAds:mutate`,
    "https://googleads.googleapis.com/v21/customers/123/googleAds:search",
    `https://user:pass@googleads.googleapis.com/v21/customers/${CUSTOMER}/googleAds:search`,
  ];
  for (const url of hostile) {
    await assert.rejects(() => googleAdsRequest({ method: "POST", url, body: "{}", fetchImpl }), GoogleAdsWriteBlockedError);
  }
  assert.equal(calls, 0);
  const pullSource = readFileSync(path.join(ROOT, "lib/marketing/connectors/google-ads.ts"), "utf8");
  assert.equal(/:mutate|uploadClickConversions|uploadCallConversions/.test(pullSource), false);
});

test("an allowed search calls fetch once and does not follow redirects", async () => {
  let calls = 0;
  let redirectMode = "";
  const fetchImpl: FetchLike = async (_url, init) => {
    calls += 1;
    redirectMode = String(init?.redirect ?? "");
    return new Response(JSON.stringify({ results: [{ campaign: { id: "1" } }] }), { status: 200 });
  };
  const rows = await googleAdsSearch({
    customerId: CUSTOMER,
    query: "SELECT campaign.id FROM campaign",
    accessToken: "access-token-value",
    developerToken: SECRET,
    loginCustomerId: CUSTOMER,
    apiVersion: "v21",
    fetchImpl,
  });
  assert.equal(calls, 1);
  assert.equal(redirectMode, "error");
  assert.equal(rows.length, 1);
});

test("token refresh is not a Google Ads mutate call and redacts secrets", async () => {
  const refresh = "refresh-token-value";
  const fetchImpl: FetchLike = async (url) => {
    assert.equal(String(url), GOOGLE_ADS_TOKEN_URL);
    assert.equal(classifyGoogleAdsRequest("POST", String(url)), "blocked");
    return new Response(JSON.stringify({ error: "invalid_grant", error_description: `rejected ${refresh}` }), { status: 400 });
  };
  await assert.rejects(
    () => refreshGoogleAdsAccessToken({ clientId: "client-id-value", clientSecret: "client-secret-value", refreshToken: refresh, fetchImpl }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message.includes(refresh), false);
      assert.equal(error.message.includes("client-secret-value"), false);
      return true;
    },
  );
  assert.equal(redactGoogleSecrets(`Bearer abcdef token ${refresh}`, [refresh]).includes(refresh), false);
});

test("the switch defaults off and missing credentials do nothing", async () => {
  const store = createMemoryStore();
  const off = await runGoogleAdsSync({ env: {}, store, now: NOW, timezone: TZ });
  assert.equal(off.status, "skipped");
  assert.match(off.reason ?? "", /MARKETING_GOOGLE_ADS is off/);
  assert.equal(store.dump().runs, 0);

  const partial = await runGoogleAdsSync({
    env: { MARKETING_GOOGLE_ADS: "on", GOOGLE_ADS_DEVELOPER_TOKEN: SECRET },
    store,
    now: NOW,
    timezone: TZ,
  });
  assert.equal(partial.status, "skipped");
  assert.match(partial.reason ?? "", /GOOGLE_ADS_CLIENT_ID/);
  assert.equal(store.dump().runs, 0);

  const badId = await runGoogleAdsSync({
    env: liveEnv({ GOOGLE_ADS_LOGIN_CUSTOMER_ID: "not-an-id" }),
    store,
    now: NOW,
    timezone: TZ,
  });
  assert.equal(badId.status, "skipped");
  assert.match(badId.reason ?? "", /10-digit/);
  assert.equal(store.dump().accounts, 0);

  const flaggedOff = await runGoogleAdsSync({
    env: liveEnv({ MARKETING_GOOGLE_ADS: "off" }),
    store,
    now: NOW,
    timezone: TZ,
  });
  assert.equal(flaggedOff.status, "skipped");
  assert.equal(store.dump().runs, 0);
  assert.equal(decideGoogleAdsSync({}).action, "skip");
});

test("mock mode loads campaigns, ads, metrics, and search terms without calling Google", async () => {
  const store = createMemoryStore();
  let called = false;
  const fetchImpl: FetchLike = async () => {
    called = true;
    throw new Error("Google should not be called");
  };
  const env = { MARKETING_GOOGLE_ADS: "on", MARKETING_SYNC_MODE: "mock" };
  const first = await runGoogleAdsSync({ env, store, now: NOW, timezone: TZ, fetchImpl });
  const dump1 = store.dump();
  const second = await runGoogleAdsSync({ env, store, now: NOW, timezone: TZ, fetchImpl });
  const dump2 = store.dump();
  assert.equal(called, false);
  assert.equal(first.status, "succeeded");
  assert.equal(first.mode, "mock");
  assert.equal(second.status, "succeeded");
  assert.equal(dump1.accounts, 1);
  assert.equal(dump2.accounts, 1);
  assert.equal(dump1.campaigns, 2);
  assert.equal(dump2.campaigns, 2);
  assert.equal(dump1.adGroups, 2);
  assert.equal(dump2.ads, 2);
  assert.equal(dump1.metrics, 4);
  assert.equal(dump2.metrics, 4);
  assert.equal(dump1.searchTerms, 4);
  assert.equal(dump2.searchTerms, 4);
  assert.equal(dump2.runs, 2);
});

test("a later sync updates search term spend in place", async () => {
  const store = createMemoryStore();
  const env = { MARKETING_GOOGLE_ADS: "on", MARKETING_SYNC_MODE: "mock" };
  const snapshot = normalizeGoogleAdsBundle(mockGoogleAdsBundle(NOW, TZ));
  await runGoogleAdsSync({ env, store, now: NOW, timezone: TZ, snapshot });
  const changed = structuredClone(snapshot);
  const target = changed.searchTerms[0];
  assert.ok(target);
  target.spend = "9.0000";
  await runGoogleAdsSync({ env, store, now: NOW, timezone: TZ, snapshot: changed });
  const dump = store.dump();
  assert.equal(dump.searchTerms, snapshot.searchTerms.length);
  const key = `${target.platform}|${target.date}|${target.campaignExternalId}|${target.adGroupExternalId}|${target.term}|${target.matchType}`;
  assert.equal(dump.searchTermSpend[key], "9.0000");
});

test("google rows map into the shared marketing snapshot", () => {
  assert.equal(mapGoogleStatus("ENABLED"), "active");
  assert.equal(mapGoogleStatus("PAUSED"), "paused");
  assert.equal(mapGoogleStatus("REMOVED"), "deleted");
  assert.equal(mapGoogleObjective("SEARCH"), "leads");
  assert.equal(mapGoogleObjective("PERFORMANCE_MAX"), "conversions");
  assert.deepEqual(mapGoogleBudget({ campaignBudget: { amountMicros: "50000000", period: "DAILY" } }), {
    budgetType: "daily",
    budgetAmount: "50.0000",
  });
  const snapshot = normalizeGoogleAdsBundle(mockGoogleAdsBundle(NOW, TZ));
  assert.equal(snapshot.accounts[0]?.externalId, "1000000001");
  assert.equal(snapshot.accounts[0]?.platform, "google_ads");
  assert.equal(snapshot.campaigns[0]?.budgetAmount, "50.0000");
  assert.equal(snapshot.campaigns[0]?.endDate, null);
  assert.equal(snapshot.campaigns[0]?.objective, "leads");
  assert.equal(snapshot.adGroups.length, 2);
  assert.equal(snapshot.ads.length, 2);
  assert.equal(snapshot.metrics.length, 4);
  assert.equal(snapshot.metrics[0]?.spend, "12.0000");
  assert.equal(snapshot.metrics[0]?.attributionWindow, "google_ads");
  assert.equal(snapshot.searchTerms.length, 4);
  assert.equal(snapshot.searchTerms[0]?.spend, "4.5000");
  assert.equal(snapshot.searchTerms[0]?.term, "roof leak repair");
});

test("a live pull uses only search and searchStream", async () => {
  const calls: { url: string; method: string; login: string }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const href = String(url);
    const headers = new Headers(init?.headers);
    calls.push({ url: href, method: String(init?.method ?? ""), login: headers.get("login-customer-id") ?? "" });
    if (href === GOOGLE_ADS_TOKEN_URL) {
      return new Response(JSON.stringify({ access_token: "ya29.fixture-token", expires_in: 3600 }), { status: 200 });
    }
    assert.notEqual(classifyGoogleAdsRequest("POST", href), "blocked");
    const body = JSON.parse(String(init?.body ?? "{}")) as { query?: string };
    const query = body.query ?? "";
    const customerId = href.match(/customers\/(\d{10})/)?.[1] ?? CUSTOMER;
    if (query.includes("FROM customer_client")) return new Response(JSON.stringify({ results: [] }), { status: 200 });
    if (query.includes("FROM customer\n") || query.includes("FROM customer ")) {
      return new Response(
        JSON.stringify({
          results: [{ customer: { id: customerId, descriptiveName: "Child", currencyCode: "USD", timeZone: TZ, status: "ENABLED" } }],
        }),
        { status: 200 },
      );
    }
    if (query.includes("FROM campaign")) {
      return new Response(
        JSON.stringify({
          results: [
            {
              campaign: { id: "9", name: "Search", status: "ENABLED", advertisingChannelType: "SEARCH", startDate: "2026-10-01", endDate: "2037-12-30" },
              campaignBudget: { amountMicros: "1000000", period: "DAILY" },
            },
          ],
        }),
        { status: 200 },
      );
    }
    if (query.includes("FROM ad_group\n") || query.includes("FROM ad_group ")) {
      return new Response(
        JSON.stringify({
          results: [{ campaign: { id: "9", biddingStrategyType: "MANUAL_CPC" }, adGroup: { id: "8", name: "Group", status: "ENABLED", type: "SEARCH_STANDARD" } }],
        }),
        { status: 200 },
      );
    }
    if (query.includes("search_term_view")) {
      return new Response(
        JSON.stringify([
          {
            results: [
              {
                segments: { date: "2026-10-07", searchTermMatchType: "PHRASE" },
                campaign: { id: "9" },
                adGroup: { id: "8" },
                searchTermView: { searchTerm: "roof leak", status: "NONE" },
                metrics: { impressions: "4", clicks: "1", costMicros: "500000", conversions: "0" },
              },
            ],
          },
        ]),
        { status: 200 },
      );
    }
    if (query.includes("metrics.cost_micros")) {
      return new Response(
        JSON.stringify([
          {
            results: [
              {
                segments: { date: "2026-10-07" },
                campaign: { id: "9" },
                adGroup: { id: "8" },
                adGroupAd: { ad: { id: "7" } },
                metrics: { costMicros: "2500000", impressions: "10", clicks: "2", conversions: "1", conversionsValue: "0" },
              },
            ],
          },
        ]),
        { status: 200 },
      );
    }
    if (query.includes("FROM ad_group_ad")) {
      return new Response(
        JSON.stringify({
          results: [
            {
              campaign: { id: "9" },
              adGroup: { id: "8" },
              adGroupAd: {
                status: "ENABLED",
                ad: {
                  id: "7",
                  name: "Ad",
                  type: "RESPONSIVE_SEARCH_AD",
                  finalUrls: ["https://example.com/roof"],
                  responsiveSearchAd: { headlines: [{ text: "Hi" }], descriptions: [{ text: "There" }] },
                },
              },
            },
          ],
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ results: [] }), { status: 200 });
  };

  const store = createMemoryStore();
  const result = await runGoogleAdsSync({ env: liveEnv(), store, now: NOW, timezone: TZ, fetchImpl });
  assert.equal(result.status, "succeeded");
  assert.equal(result.mode, "live");
  assert.ok(result.searchTerms && result.searchTerms > 0);
  assert.equal(store.dump().campaigns, 1);
  assert.equal(store.dump().ads, 1);
  assert.equal(store.dump().metrics, 1);
  const adsCalls = calls.filter((call) => call.url.includes("googleads.googleapis.com"));
  assert.ok(adsCalls.length >= 5);
  for (const call of adsCalls) {
    assert.equal(call.method, "POST");
    assert.notEqual(classifyGoogleAdsRequest(call.method, call.url), "blocked");
    assert.equal(call.url.includes("mutate"), false);
    assert.equal(call.login, "2000000002");
  }
  assert.equal(calls.filter((call) => call.url === GOOGLE_ADS_TOKEN_URL).length, 1);
  assert.equal(JSON.stringify(result).includes(SECRET), false);
  assert.equal(JSON.stringify(store.dump()).includes(SECRET), false);
});

test("a live transport failure is recorded and does not throw", async () => {
  const store = createMemoryStore();
  const fetchImpl: FetchLike = async () => {
    throw new Error("network down");
  };
  const result = await runGoogleAdsSync({ env: liveEnv(), store, now: NOW, timezone: TZ, fetchImpl });
  assert.equal(result.status, "failed");
  assert.match(result.error ?? "", /network down/);
  assert.equal(result.error?.includes(SECRET), false);
  assert.equal(store.dump().accounts, 0);
});

test("connection status hides secrets and blocks client roles", () => {
  const view = describeGoogleAdsConnection({
    env: liveEnv(),
    lastRun: { status: "failed", mode: "live", finishedAt: "2026-10-28T19:10:00.000Z", error: `Google said ${SECRET}` },
  });
  const json = JSON.stringify(view);
  assert.equal(json.includes(SECRET), false);
  assert.equal(json.includes("client-secret-value"), false);
  assert.equal(json.includes("refresh-token-value"), false);
  assert.equal(view.chip, "needs_attention");
  assert.equal(view.chipLabel, "Needs attention");
  assert.equal(view.readOnly, true);
  assert.equal(view.credentials.every((row) => row.present), true);

  const off = describeGoogleAdsConnection({ env: { MARKETING_GOOGLE_ADS: "off", GOOGLE_ADS_DEVELOPER_TOKEN: SECRET } });
  assert.equal(off.chip, "not_connected");
  assert.equal(JSON.stringify(off).includes(SECRET), false);

  const mock = describeGoogleAdsConnection({ env: { MARKETING_GOOGLE_ADS: "on", MARKETING_SYNC_MODE: "mock" } });
  assert.equal(mock.exampleData, true);
  assert.equal(mock.chip, "connected");
  assert.match(JSON.stringify(mock), /EXAMPLE DATA|fixtures|Example data/);

  const scope = [{ workspaceId: "org", scopeKind: "client" as const, adAccountId: null, campaignId: null }];
  for (const role of ["owner", "admin", "viewer", "client_viewer"]) {
    const access = accessFromUser({ id: role, email: `${role}@example.com`, role }, role === "client_viewer" ? scope : [], {});
    assert.equal(access.seesCost, false, role);
    assert.equal(googleAdsConnectionDenial(access)?.status, 403, role);
  }
  for (const role of ["super_admin", "account_manager"]) {
    const access = accessFromUser({ id: role, email: `${role}@example.com`, role }, role === "account_manager" ? scope : [], {});
    assert.equal(access.seesCost, true, role);
    assert.equal(googleAdsConnectionDenial(access), null, role);
  }
});

test("connection screen meets the shared UI rules", () => {
  const off = describeGoogleAdsConnection({ env: {} });
  const html = renderToStaticMarkup(
    GoogleAdsConnection({ view: off, timeZone: "America/New_York", canManage: true }),
  );
  assert.match(html, /Not connected/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /See how to turn it on/);
  assert.match(html, /min-h-11/);
  assert.match(html, /never asks for a password/);
  assert.equal(html.includes("<input"), false);
  assert.equal(html.includes("type=\"password\""), false);

  const mock = describeGoogleAdsConnection({ env: { MARKETING_GOOGLE_ADS: "on", MARKETING_SYNC_MODE: "mock" } });
  const example = renderToStaticMarkup(
    GoogleAdsConnection({ view: mock, timeZone: "America/New_York", canManage: false }),
  );
  assert.match(example, /EXAMPLE DATA/);
  assert.match(example, /Connected/);
  assert.equal(example.includes("GOOGLE_ADS_DEVELOPER_TOKEN"), false);

  const failed = describeGoogleAdsConnection({
    env: liveEnv(),
    lastRun: { status: "failed", mode: "live", finishedAt: "2026-10-28T19:10:00.000Z", error: "Permission denied" },
  });
  const errorHtml = renderToStaticMarkup(
    GoogleAdsConnection({ view: failed, timeZone: "America/New_York", canManage: true }),
  );
  assert.match(errorHtml, /Needs attention/);
  assert.match(errorHtml, /Retry/);
  assert.match(errorHtml, /role="alert"/);
});

test("google ads is registered beside meta", () => {
  assert.equal(getConnector("google_ads").platform, "google_ads");
  assert.equal(getConnector("meta").platform, "meta");
  assert.throws(() => getConnector("tiktok"), /No marketing connector/);
});

test("pullGoogleAdsSnapshot refuses a mutate URL if a caller builds one", async () => {
  const urls: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    urls.push(String(url));
    if (String(url) === GOOGLE_ADS_TOKEN_URL) {
      return new Response(JSON.stringify({ access_token: "ya29.fixture-token" }), { status: 200 });
    }
    return new Response(JSON.stringify({ results: [] }), { status: 200 });
  };
  const pulled = await pullGoogleAdsSnapshot({
    customerIds: ["2000000002"],
    discoverCustomers: false,
    loginCustomerId: "2000000002",
    developerToken: SECRET,
    clientId: "client-id-value",
    clientSecret: "client-secret-value",
    refreshToken: "refresh-token-value",
    apiVersion: "v21",
    since: "2026-10-01",
    until: "2026-10-07",
    fetchImpl,
  });
  assert.ok(urls.some((url) => url.includes("googleAds:search")));
  assert.equal(urls.some((url) => url.includes("mutate")), false);
  assert.equal(pulled.failures.length, 0);
  await assert.rejects(
    () => googleAdsRequest({ method: "POST", url: `https://googleads.googleapis.com/v21/customers/${CUSTOMER}/campaignBudgets:mutate`, fetchImpl }),
    GoogleAdsWriteBlockedError,
  );
});

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  AdBudgetWriteBlockedError,
  BUDGET_MUTATION_ENDPOINTS,
  BUDGET_MUTATION_FIELDS,
  adBudgetWriteIssue,
  assertNoAdBudgetWrite,
} from "./connectors/budget-lock";
import { graphGet, graphPost, type FetchLike } from "./connectors/meta-client";
import { googleAdsRequest } from "./connectors/google-ads-client";

const ROOT = path.resolve(import.meta.dirname, "../..");
const CONNECTORS = path.join(ROOT, "lib/marketing/connectors");

test("ad API client modules have no budget mutation endpoint or field", () => {
  const clients = readdirSync(CONNECTORS).filter((name) => name.endsWith("-client.ts")).sort();
  assert.deepEqual(clients, ["google-ads-client.ts", "meta-client.ts"]);
  const needles = [...BUDGET_MUTATION_ENDPOINTS, ...BUDGET_MUTATION_FIELDS];
  for (const name of clients) {
    const text = readFileSync(path.join(CONNECTORS, name), "utf8");
    for (const needle of needles) {
      assert.equal(text.includes(needle), false, `${name} contains ${needle}`);
    }
    assert.match(text, /assertNoAdBudgetWrite\(/);
  }
});

test("the lock refuses budget, bid, and spend-cap writes and still allows reads", () => {
  const customer = "1234567890";
  for (const endpoint of BUDGET_MUTATION_ENDPOINTS) {
    const url = `https://googleads.googleapis.com/v26/customers/${customer}/${endpoint}`;
    assert.equal(adBudgetWriteIssue({ method: "POST", url }), endpoint);
    assert.throws(() => assertNoAdBudgetWrite({ method: "POST", url }), AdBudgetWriteBlockedError);
  }
  for (const field of ["daily_budget", "lifetime_budget", "bid_amount", "bid_strategy", "spend_cap"] as const) {
    assert.equal(
      adBudgetWriteIssue({ method: "POST", url: "https://graph.facebook.com/v23.0/123", params: { [field]: "50" } }),
      field,
    );
  }
  assert.ok(
    adBudgetWriteIssue({
      method: "POST",
      url: `https://googleads.googleapis.com/v26/customers/${customer}/adGroupAds:mutate`,
      body: { operations: [{ updateMask: "cpc_bid_micros", update: { cpcBidMicros: "1000000" } }] },
    }),
  );
  assert.ok(
    adBudgetWriteIssue({
      method: "POST",
      url: `https://googleads.googleapis.com/v26/customers/${customer}/campaigns:mutate`,
      body: { operations: [{ update: { campaignBudget: "customers/123/campaignBudgets/1" } }] },
    }),
  );

  assert.equal(
    adBudgetWriteIssue({
      method: "POST",
      url: `https://googleads.googleapis.com/v26/customers/${customer}/googleAds:search`,
      body: JSON.stringify({
        query: "SELECT campaign_budget.amount_micros, campaign_budget.total_amount_micros FROM campaign",
      }),
    }),
    null,
  );
  assert.equal(
    adBudgetWriteIssue({
      method: "GET",
      url: "https://graph.facebook.com/v23.0/act_1/campaigns?fields=id,name,daily_budget,lifetime_budget,bid_strategy&access_token=abc",
    }),
    null,
  );
  assert.equal(
    adBudgetWriteIssue({
      method: "POST",
      url: "https://graph.facebook.com/v23.0/act_1/insights",
      params: { level: "ad", fields: "spend,impressions,clicks", time_increment: "1" },
    }),
    null,
  );
  assert.equal(
    adBudgetWriteIssue({
      method: "POST",
      url: "https://graph.facebook.com/v23.0/123",
      body: new URLSearchParams({ status: "PAUSED" }),
    }),
    null,
  );
  assert.equal(
    adBudgetWriteIssue({
      method: "POST",
      url: `https://googleads.googleapis.com/v26/customers/${customer}/adGroupAds:mutate`,
      body: {
        operations: [{ updateMask: "status", update: { resourceName: `customers/${customer}/adGroupAds/1~2`, status: "PAUSED" } }],
      },
    }),
    null,
  );
});

test("Meta and Google clients throw before fetch, and bots only create recommendations", async () => {
  let calls = 0;
  const fetchImpl: FetchLike = async () => {
    calls += 1;
    throw new Error("fetch should not run");
  };
  await assert.rejects(
    () =>
      graphPost({
        version: "v23.0",
        path: "123",
        token: "token-value",
        appSecret: "",
        params: { daily_budget: "5000" },
        fetchImpl,
      }),
    (error: unknown) => error instanceof AdBudgetWriteBlockedError && /recommendations/.test(error.message),
  );
  await assert.rejects(
    () =>
      googleAdsRequest({
        method: "POST",
        url: "https://googleads.googleapis.com/v26/customers/1234567890/campaignBudgets:mutate",
        body: "{}",
        fetchImpl,
      }),
    AdBudgetWriteBlockedError,
  );
  assert.equal(calls, 0);

  const read = await graphGet({
    version: "v23.0",
    path: "act_1/campaigns",
    token: "token-value",
    appSecret: "",
    params: { fields: "id,daily_budget,lifetime_budget" },
    fetchImpl: async () => Response.json({ data: [] }),
  });
  assert.deepEqual(read, { data: [] });

  const bots = ["worker/index.ts", "lib/marketing/monitor.ts", "lib/marketing/pacing.ts", "lib/marketing/pacing-job.ts"];
  for (const file of bots) {
    const text = readFileSync(path.join(ROOT, file), "utf8");
    assert.equal(text.includes("graphPost"), false, file);
    assert.equal(text.includes("googleAdsRequest"), false, file);
    for (const endpoint of BUDGET_MUTATION_ENDPOINTS) {
      assert.equal(text.includes(endpoint), false, `${file} ${endpoint}`);
    }
  }
});

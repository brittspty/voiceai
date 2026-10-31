import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryStore } from "./store";
import { decideStackAdapt, stackAdaptEnabled } from "./config";
import {
  STACKADAPT_DELIVERY_QUERY,
  STACKADAPT_ENDPOINT,
  StackAdaptWriteBlockedError,
  pullStackAdaptBundle,
  stackAdaptGraphql,
} from "./connectors/stackadapt-client";
import { recommendStackAdapt, stackAdaptToSnapshot } from "./connectors/stackadapt-map";
import { getConnector } from "./connectors/registry";
import { runStackAdaptSync } from "./stackadapt-sync";
import type { StackAdaptBundle } from "./connectors/stackadapt-client";

const KEY = "stackadapt-test-key";

function bundle(): StackAdaptBundle {
  return {
    warnings: [],
    campaigns: [
      {
        id: "camp-1",
        name: "Prospecting",
        status: "ACTIVE",
        lineItems: [
          {
            id: "line-1",
            name: "Lookalike",
            status: "ACTIVE",
            creatives: [
              { id: "cr-1", name: "Roof photo", status: "ACTIVE" },
              { id: "cr-2", name: "Crew photo", status: "ACTIVE" },
            ],
            dailyStats: [
              { date: "2026-10-19", impressions: 1000, clicks: 25, conversions: 2, spend: 12.5 },
              { date: "2026-10-20", impressions: 1100, clicks: 20, conversions: 1, spend: 13 },
            ],
          },
        ],
      },
    ],
  };
}

test("stackadapt stays off without the switch or the key", () => {
  assert.equal(stackAdaptEnabled({}), false);
  assert.deepEqual(decideStackAdapt({}), { action: "skip", reason: "MARKETING_STACKADAPT is off" });
  assert.equal(decideStackAdapt({ MARKETING_STACKADAPT: "on" }).action, "skip");
  assert.equal(decideStackAdapt({ MARKETING_STACKADAPT: "on", STACKADAPT_API_KEY: KEY }).action, "live");
});

test("the graphql client is read-only and keeps the key out of errors", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return Response.json({ error: `leaked ${KEY}` }, { status: 500 });
  };
  await assert.rejects(
    () => stackAdaptGraphql({ apiKey: KEY, query: "mutation UpdateBudget { campaign { id } }", fetchImpl }),
    StackAdaptWriteBlockedError,
  );
  assert.equal(calls, 0);
  await assert.rejects(
    () => stackAdaptGraphql({ apiKey: KEY, endpoint: "https://evil.example/graphql", fetchImpl }),
    StackAdaptWriteBlockedError,
  );
  assert.equal(calls, 0);
  await assert.rejects(() => stackAdaptGraphql({ apiKey: KEY, fetchImpl }), (error: unknown) => {
    assert.equal(calls, 1);
    assert.match(error instanceof Error ? error.message : "", /StackAdapt 500/);
    assert.equal((error instanceof Error ? error.message : "").includes(KEY), false);
    return true;
  });
});

test("a mocked graphql response maps campaigns, line items, creatives, and daily delivery", async () => {
  const seen: { url: string; query: string; auth: string }[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { query?: string };
    seen.push({ url, query: body.query ?? "", auth: String(new Headers(init?.headers).get("authorization")) });
    return Response.json({
      data: {
        campaigns: {
          nodes: [
            {
              id: "camp-1",
              name: "Prospecting",
              status: "ACTIVE",
              lineItems: {
                nodes: [
                  {
                    id: "line-1",
                    name: "Lookalike",
                    status: "ACTIVE",
                    creatives: { nodes: [{ id: "cr-1", name: "Roof photo", status: "ACTIVE" }] },
                    dailyStats: [{ date: "2026-10-20", impressions: 1000, clicks: 25, conversions: 2, spend: 12.5 }],
                  },
                ],
              },
            },
          ],
        },
      },
    });
  };
  const pulled = await pullStackAdaptBundle({ apiKey: KEY, from: "2026-10-14", to: "2026-10-20", fetchImpl });
  assert.equal(seen[0]?.url, STACKADAPT_ENDPOINT);
  assert.equal(seen[0]?.auth, `Bearer ${KEY}`);
  assert.match(seen[0]?.query ?? "", /campaigns/);
  assert.match(STACKADAPT_DELIVERY_QUERY, /lineItems/);
  assert.match(STACKADAPT_DELIVERY_QUERY, /creatives/);
  assert.match(STACKADAPT_DELIVERY_QUERY, /impressions/);
  assert.match(STACKADAPT_DELIVERY_QUERY, /clicks/);
  assert.match(STACKADAPT_DELIVERY_QUERY, /conversions/);
  assert.match(STACKADAPT_DELIVERY_QUERY, /spend/);
  assert.equal(/\bmutation\b/i.test(STACKADAPT_DELIVERY_QUERY), false);
  const snapshot = stackAdaptToSnapshot(pulled);
  assert.equal(snapshot.accounts[0]?.platform, "stackadapt");
  assert.equal(snapshot.campaigns[0]?.name, "Prospecting");
  assert.equal(snapshot.campaigns[0]?.budgetAmount, null);
  assert.equal(snapshot.campaigns[0]?.budgetType, "none");
  assert.equal(snapshot.adGroups[0]?.externalId, "line-1");
  assert.equal(snapshot.creatives.length, 1);
  assert.equal(snapshot.metrics.length, 1);
  assert.equal(snapshot.metrics[0]?.impressions, "1000");
  assert.equal(snapshot.metrics[0]?.clicks, "25");
  assert.equal(snapshot.metrics[0]?.platformConversions, "2.0000");
  assert.equal(snapshot.metrics[0]?.spend, "12.5000");
  assert.equal(getConnector("stackadapt").platform, "stackadapt");
});

test("stackadapt recommendations stay recommend-only and the sync stores metrics", async () => {
  const snapshot = stackAdaptToSnapshot(bundle());
  const recommendations = recommendStackAdapt(snapshot, "2026-10-20");
  for (const recommendation of recommendations) {
    assert.equal(recommendation.type, "stackadapt");
    assert.equal(recommendation.changesSpend, false);
    assert.equal(recommendation.writesAds, false);
    assert.equal(recommendation.recommendationOnly, true);
  }
  const store = createMemoryStore();
  const skipped = await runStackAdaptSync({ env: {}, store, now: new Date("2026-10-20T15:00:00.000Z") });
  assert.equal(skipped.status, "skipped");
  assert.equal(store.dump().metrics, 0);
  let posts = 0;
  const saved = await runStackAdaptSync({
    env: { MARKETING_STACKADAPT: "on", STACKADAPT_API_KEY: KEY, MARKETING_SYNC_MODE: "live", MARKETING_LOOKBACK_DAYS: "7" },
    store,
    now: new Date("2026-10-20T15:00:00.000Z"),
    fetchImpl: async (url, init) => {
      posts += 1;
      assert.equal(url, STACKADAPT_ENDPOINT);
      assert.equal(init?.method, "POST");
      const body = JSON.parse(String(init?.body ?? "{}")) as { query?: string };
      assert.match(body.query ?? "", /query StackAdaptDelivery/);
      assert.equal(/\bmutation\b/i.test(body.query ?? ""), false);
      return Response.json({
        data: {
          campaigns: {
            nodes: bundle().campaigns.map((campaign) => ({
              ...campaign,
              lineItems: { nodes: campaign.lineItems },
            })),
          },
        },
      });
    },
  });
  assert.equal(posts, 1);
  assert.equal(saved.status, "succeeded");
  assert.equal(store.dump().metrics, 2);
  assert.equal(store.dump().campaigns, 1);
  assert.ok((saved.rowsWritten ?? 0) > 0);
});

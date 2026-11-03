import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryStore } from "./store";
import { decideStackAdapt, parseLookbackArg, stackAdaptEnabled, stackAdaptLiveRead, stackAdaptSyncEnabled } from "./config";
import { forSpendViewer } from "./spend-access";
import { applyClientSurface, defaultVisibility } from "./metric-visibility";
import {
  STACKADAPT_CAMPAIGNS_QUERY,
  STACKADAPT_DELIVERY_QUERY,
  STACKADAPT_ENDPOINT,
  StackAdaptWriteBlockedError,
  parseStackAdaptCampaignNode,
  pullStackAdaptBundle,
  stackAdaptGraphql,
  stackAdaptProbeSummary,
  type StackAdaptBundle,
} from "./connectors/stackadapt-client";
import { recommendStackAdapt, stackAdaptToSnapshot } from "./connectors/stackadapt-map";
import { mapStackAdaptStatus, presentedCampaignStatus, stackAdaptRawStatus } from "./connectors/stackadapt-status";
import { liveStackAdaptAdvertiserIds, planStackAdaptClients } from "./client-campaign-scope";
import { getConnector } from "./connectors/registry";
import { runStackAdaptSync } from "./stackadapt-sync";

const KEY = "stackadapt-test-key";
const ADVERTISER = "1001";
const OTHER = "2002";

function bundle(): StackAdaptBundle {
  return {
    warnings: [],
    campaigns: [
      {
        id: "camp-1",
        name: "Cedar prospecting",
        status: "LIVE",
        advertiserId: ADVERTISER,
        lineItems: [
          {
            id: "line:camp-1",
            name: "Cedar prospecting",
            status: "LIVE",
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

const LIVE = {
  STACKADAPT_SYNC: "on",
  INTEGRATIONS_MODE: "mock",
  MARKETING_SYNC_MODE: "auto",
  STACKADAPT_API_KEY: KEY,
  MARKETING_LOOKBACK_DAYS: "7",
};

test("stackadapt live reads follow MARKETING_SYNC_MODE and ignore INTEGRATIONS_MODE", () => {
  assert.equal(stackAdaptEnabled({}), false);
  assert.equal(stackAdaptSyncEnabled({}), false);
  assert.deepEqual(decideStackAdapt({}), { action: "skip", reason: "STACKADAPT_SYNC is off" });
  assert.equal(decideStackAdapt({ STACKADAPT_SYNC: "on", INTEGRATIONS_MODE: "mock" }).action, "skip");
  assert.equal(decideStackAdapt({ STACKADAPT_SYNC: "on", INTEGRATIONS_MODE: "live", STACKADAPT_API_KEY: KEY, MARKETING_SYNC_MODE: "off" }).action, "skip");
  assert.equal(decideStackAdapt({ MARKETING_STACKADAPT: "on", MARKETING_SYNC_MODE: "live", STACKADAPT_API_KEY: KEY }).action, "skip");
  assert.equal(decideStackAdapt({ STACKADAPT_SYNC: "on", INTEGRATIONS_MODE: "mock", MARKETING_SYNC_MODE: "mock", STACKADAPT_API_KEY: KEY }).action, "mock");
  assert.equal(decideStackAdapt({ STACKADAPT_SYNC: "on", INTEGRATIONS_MODE: "mock", MARKETING_SYNC_MODE: "auto", STACKADAPT_API_KEY: KEY }).action, "live");
  assert.equal(decideStackAdapt({ STACKADAPT_SYNC: "on", INTEGRATIONS_MODE: "mock", MARKETING_SYNC_MODE: "live", STACKADAPT_API_KEY: KEY }).action, "live");
  assert.equal(decideStackAdapt(LIVE).action, "live");
  const closed = stackAdaptLiveRead({ STACKADAPT_SYNC: "on", INTEGRATIONS_MODE: "mock", MARKETING_SYNC_MODE: "mock", STACKADAPT_API_KEY: KEY });
  assert.deepEqual(closed, { ok: false, reason: "MARKETING_SYNC_MODE=mock" });
  const open = stackAdaptLiveRead(LIVE);
  assert.equal(open.ok, true);
  const rules = [
    { id: "cedar", stackadaptAdvertiserIds: [ADVERTISER], stackadaptLiveRead: true },
    { id: "other", stackadaptAdvertiserIds: [OTHER], stackadaptLiveRead: false },
  ];
  assert.deepEqual(liveStackAdaptAdvertiserIds(rules), [ADVERTISER]);
  assert.equal(liveStackAdaptAdvertiserIds(rules).includes(OTHER), false);
  assert.equal(parseLookbackArg("90"), 90);
  assert.equal(parseLookbackArg("91"), null);
  assert.equal(parseLookbackArg("0"), null);
  assert.equal(parseLookbackArg("7.5"), null);
});

test("the graphql client refuses mutations and any unscoped advertiser read", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return Response.json({ error: `leaked ${KEY}` }, { status: 500 });
  };
  await assert.rejects(
    () => stackAdaptGraphql({ apiKey: KEY, query: "mutation UpdateBudget { campaign { id } }", fetchImpl }),
    StackAdaptWriteBlockedError,
  );
  await assert.rejects(
    () => stackAdaptGraphql({ apiKey: KEY, query: "subscription Live { campaigns { nodes { id } } }", fetchImpl }),
    StackAdaptWriteBlockedError,
  );
  await assert.rejects(
    () => stackAdaptGraphql({ apiKey: KEY, query: "query All { campaigns(first: 50) { nodes { id name } } }", fetchImpl }),
    StackAdaptWriteBlockedError,
  );
  await assert.rejects(
    () => stackAdaptGraphql({ apiKey: KEY, query: "query All { advertisers(first: 50) { nodes { id name } } }", fetchImpl }),
    StackAdaptWriteBlockedError,
  );
  await assert.rejects(
    () => stackAdaptGraphql({
      apiKey: KEY,
      query: STACKADAPT_CAMPAIGNS_QUERY,
      variables: { advertiserIds: [ADVERTISER, OTHER] },
      fetchImpl,
    }),
    StackAdaptWriteBlockedError,
  );
  assert.equal(calls, 0);
  await assert.rejects(
    () => stackAdaptGraphql({ apiKey: KEY, endpoint: "https://evil.example/graphql", variables: { advertiserIds: [ADVERTISER] }, fetchImpl }),
    StackAdaptWriteBlockedError,
  );
  assert.equal(calls, 0);
  await assert.rejects(
    () => stackAdaptGraphql({ apiKey: KEY, variables: { advertiserIds: [ADVERTISER], from: "2026-10-14", to: "2026-10-21" }, fetchImpl }),
    (error: unknown) => {
      assert.equal(calls, 1);
      assert.match(error instanceof Error ? error.message : "", /StackAdapt 500/);
      assert.equal((error instanceof Error ? error.message : "").includes(KEY), false);
      return true;
    },
  );
  assert.equal(/\bmutation\b/i.test(STACKADAPT_CAMPAIGNS_QUERY), false);
  assert.equal(/\bmutation\b/i.test(STACKADAPT_DELIVERY_QUERY), false);
  assert.match(STACKADAPT_CAMPAIGNS_QUERY, /filterBy: \{ advertiserIds: \$advertiserIds \}/);
  assert.match(STACKADAPT_DELIVERY_QUERY, /filterBy: \{ advertiserIds: \$advertiserIds \}/);
  assert.equal(/budget|bid/i.test(STACKADAPT_CAMPAIGNS_QUERY), false);
  assert.equal(/budget|bid/i.test(STACKADAPT_DELIVERY_QUERY), false);
  assert.match(STACKADAPT_CAMPAIGNS_QUERY, /campaignStatus \{ state status \}/);
  assert.match(STACKADAPT_CAMPAIGNS_QUERY, /isDraft/);
});

test("stackadapt campaign states map into active, paused, and archived", () => {
  assert.equal(mapStackAdaptStatus("LIVE"), "active");
  assert.equal(mapStackAdaptStatus("active"), "active");
  assert.equal(mapStackAdaptStatus("DAILY_BUDGET_REACHED"), "active");
  assert.equal(mapStackAdaptStatus("PAUSED"), "paused");
  assert.equal(mapStackAdaptStatus("CAMPAIGN_GROUP_PAUSED"), "paused");
  assert.equal(mapStackAdaptStatus("CREATIVES_PAUSED"), "paused");
  assert.equal(mapStackAdaptStatus("ENDED"), "archived");
  assert.equal(mapStackAdaptStatus("END_DATE_REACHED"), "archived");
  assert.equal(mapStackAdaptStatus("BUDGET_REACHED"), "archived");
  assert.equal(mapStackAdaptStatus("ARCHIVED"), "archived");
  assert.equal(mapStackAdaptStatus("DRAFT"), "paused");
  assert.equal(mapStackAdaptStatus("APPROVED"), "paused");
  assert.equal(mapStackAdaptStatus("REJECTED"), "paused");
  assert.equal(mapStackAdaptStatus("ERROR"), "paused");
  assert.notEqual(mapStackAdaptStatus("ENDED"), "unknown");
  assert.notEqual(mapStackAdaptStatus("DRAFT"), "unknown");
  assert.equal(presentedCampaignStatus("stackadapt", "unknown", "ENDED"), "archived");
  assert.equal(presentedCampaignStatus("stackadapt", "unknown", "LIVE"), "active");
  assert.equal(presentedCampaignStatus("stackadapt", "active", "ENDED"), "active");
  assert.equal(presentedCampaignStatus("meta", "unknown", "ENDED"), "unknown");
  assert.equal(
    stackAdaptRawStatus({ isArchived: false, state: "", detail: ["END_DATE_REACHED", "CREATIVES_PAUSED"] }),
    "END_DATE_REACHED",
  );
  const ended = parseStackAdaptCampaignNode(
    {
      id: "camp-ended",
      name: "Ended flight",
      isArchived: false,
      isDraft: false,
      advertiser: { id: ADVERTISER },
      campaignStatus: { state: "ENDED", status: ["END_DATE_REACHED"] },
      ads: { nodes: [] },
    },
    ADVERTISER,
  );
  assert.equal(ended?.status, "ENDED");
  assert.equal(stackAdaptToSnapshot({ campaigns: ended ? [ended] : [], warnings: [] }).campaigns[0]?.status, "archived");
  const paused = parseStackAdaptCampaignNode(
    {
      id: "camp-paused",
      name: "Paused flight",
      isArchived: false,
      advertiser: { id: ADVERTISER },
      campaignStatus: { status: ["CAMPAIGN_GROUP_PAUSED"] },
      ads: { nodes: [] },
    },
    ADVERTISER,
  );
  assert.equal(paused?.status, "CAMPAIGN_GROUP_PAUSED");
  assert.equal(stackAdaptToSnapshot({ campaigns: paused ? [paused] : [], warnings: [] }).campaigns[0]?.status, "paused");
  const live = parseStackAdaptCampaignNode(
    {
      id: "camp-live",
      name: "Live flight",
      isDraft: true,
      advertiser: { id: ADVERTISER },
      campaignStatus: { state: "LIVE", status: ["DAILY_BUDGET_REACHED"] },
      ads: { nodes: [] },
    },
    ADVERTISER,
  );
  assert.equal(live?.status, "LIVE");
  assert.equal(stackAdaptToSnapshot({ campaigns: live ? [live] : [], warnings: [] }).campaigns[0]?.status, "active");
});

test("a mocked graphql response keeps one advertiser and drops every other", async () => {
  const seen: { url: string; query: string; auth: string; variables: Record<string, unknown> }[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { query?: string; variables?: Record<string, unknown> };
    seen.push({ url, query: body.query ?? "", auth: String(new Headers(init?.headers).get("authorization")), variables: body.variables ?? {} });
    if ((body.query ?? "").includes("campaignDelivery")) {
      return Response.json({
        data: {
          campaignDelivery: {
            __typename: "CampaignDeliveryOutcome",
            records: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                {
                  campaign: { id: "camp-1", advertiser: { id: ADVERTISER } },
                  granularity: { startTime: "2026-10-20T00:00:00-04:00" },
                  metrics: { impressionsBigint: "1000", clicksBigint: "25", conversionsBigint: "2", cost: "12.50" },
                },
                {
                  campaign: { id: "camp-other", advertiser: { id: OTHER } },
                  granularity: { startTime: "2026-10-20T00:00:00-04:00" },
                  metrics: { impressionsBigint: "9", clicksBigint: "9", conversionsBigint: "9", cost: "99" },
                },
              ],
            },
          },
        },
      });
    }
    return Response.json({
      data: {
        campaigns: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [
            {
              id: "camp-1",
              name: "Cedar prospecting",
              isArchived: false,
              advertiser: { id: ADVERTISER },
              campaignStatus: { state: "LIVE" },
              ads: { pageInfo: { hasNextPage: false }, nodes: [{ id: "cr-1", name: "Roof photo", paused: false, isArchived: false }] },
            },
            {
              id: "camp-other",
              name: "Other shop",
              isArchived: false,
              advertiser: { id: OTHER },
              campaignStatus: { state: "LIVE" },
              ads: { nodes: [] },
            },
          ],
        },
      },
    });
  };
  const pulled = await pullStackAdaptBundle({ apiKey: KEY, from: "2026-10-14", to: "2026-10-20", advertiserId: ADVERTISER, fetchImpl });
  assert.equal(seen.length, 2);
  for (const call of seen) {
    assert.equal(call.url, STACKADAPT_ENDPOINT);
    assert.equal(call.auth, `Bearer ${KEY}`);
    assert.deepEqual(call.variables.advertiserIds, [ADVERTISER]);
    assert.equal(JSON.stringify(call).includes(OTHER), false);
    assert.equal(/\bmutation\b/i.test(call.query), false);
  }
  assert.equal(seen[1]?.variables.to, "2026-10-21");
  assert.equal(pulled.campaigns.length, 1);
  assert.equal(pulled.campaigns[0]?.id, "camp-1");
  const snapshot = stackAdaptToSnapshot(pulled);
  assert.equal(snapshot.accounts[0]?.platform, "stackadapt");
  assert.equal(snapshot.campaigns[0]?.name, "Cedar prospecting");
  assert.deepEqual(snapshot.campaigns[0]?.namingParsed, { stackadaptAdvertiserId: ADVERTISER });
  assert.equal(snapshot.campaigns[0]?.budgetAmount, null);
  assert.equal(snapshot.campaigns[0]?.budgetType, "none");
  assert.equal(snapshot.adGroups[0]?.externalId, "line:camp-1");
  assert.equal(snapshot.creatives.length, 1);
  assert.equal(snapshot.metrics.length, 1);
  assert.equal(snapshot.metrics[0]?.impressions, "1000");
  assert.equal(snapshot.metrics[0]?.clicks, "25");
  assert.equal(snapshot.metrics[0]?.platformConversions, "2.0000");
  assert.equal(snapshot.metrics[0]?.spend, "12.5000");
  assert.equal(JSON.stringify(snapshot.campaigns).includes(OTHER), false);
  assert.equal(getConnector("stackadapt").platform, "stackadapt");
  const changes = planStackAdaptClients(
    [{ id: "client-cedar", stackadaptAdvertiserIds: [ADVERTISER], stackadaptLiveRead: true }],
    snapshot.campaigns.map((campaign, index) => ({ id: `row-${index}`, clientId: null, namingParsed: campaign.namingParsed })),
  );
  assert.deepEqual(changes, [{ id: "row-0", clientId: "client-cedar" }]);
  const summary = stackAdaptProbeSummary(pulled, { advertiserId: ADVERTISER, from: "2026-10-14", to: "2026-10-20" });
  const printed = JSON.stringify(summary);
  assert.equal(summary.campaigns, 1);
  assert.equal(summary.impressions, 1000);
  assert.equal(summary.clicks, 25);
  assert.equal(summary.conversions, 2);
  assert.equal(printed.includes(KEY), false);
  for (const word of ["spend", "cost", "cpa", "cpl", "cpx", "roas", "budget", "bid"]) assert.equal(printed.includes(word), false, word);
});

test("stackadapt sync requests only a live-read advertiser and stores its metrics", async () => {
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
  const quiet = await runStackAdaptSync({
    env: LIVE,
    store,
    now: new Date("2026-10-20T15:00:00.000Z"),
    advertisers: [{ id: "client-other", stackadaptAdvertiserIds: [OTHER], stackadaptLiveRead: false }],
    fetchImpl: async () => {
      posts += 1;
      return Response.json({ data: {} });
    },
  });
  assert.equal(quiet.status, "skipped");
  assert.equal(posts, 0);

  const saved = await runStackAdaptSync({
    env: LIVE,
    store,
    now: new Date("2026-10-20T15:00:00.000Z"),
    advertisers: [
      { id: "client-cedar", stackadaptAdvertiserIds: [ADVERTISER], stackadaptLiveRead: true },
      { id: "client-other", stackadaptAdvertiserIds: [OTHER], stackadaptLiveRead: false },
    ],
    fetchImpl: async (url, init) => {
      posts += 1;
      assert.equal(url, STACKADAPT_ENDPOINT);
      assert.equal(init?.method, "POST");
      const body = JSON.parse(String(init?.body ?? "{}")) as { query?: string; variables?: { advertiserIds?: string[]; to?: string } };
      assert.deepEqual(body.variables?.advertiserIds, [ADVERTISER]);
      assert.equal(JSON.stringify(body).includes(OTHER), false);
      assert.equal(/\bmutation\b/i.test(body.query ?? ""), false);
      if ((body.query ?? "").includes("campaignDelivery")) {
        assert.equal(body.variables?.to, "2026-10-21");
        return Response.json({
          data: {
            campaignDelivery: {
              __typename: "CampaignDeliveryOutcome",
              records: {
                nodes: [
                  {
                    campaign: { id: "camp-1", advertiser: { id: ADVERTISER } },
                    granularity: { startTime: "2026-10-19T00:00:00-04:00" },
                    metrics: { impressionsBigint: "1000", clicksBigint: "25", conversionsBigint: "2", cost: "12.50" },
                  },
                  {
                    campaign: { id: "camp-1", advertiser: { id: ADVERTISER } },
                    granularity: { startTime: "2026-10-20T00:00:00-04:00" },
                    metrics: { impressionsBigint: "1100", clicksBigint: "20", conversionsBigint: "1", cost: "13" },
                  },
                ],
              },
            },
          },
        });
      }
      return Response.json({
        data: {
          campaigns: {
            nodes: [
              {
                id: "camp-1",
                name: "Cedar prospecting",
                advertiser: { id: ADVERTISER },
                campaignStatus: { state: "LIVE" },
                ads: { nodes: [{ id: "cr-1", name: "Roof photo", paused: false, isArchived: false }] },
              },
            ],
          },
        },
      });
    },
  });
  assert.equal(posts, 2);
  assert.equal(saved.status, "succeeded");
  assert.equal(store.dump().metrics, 2);
  assert.equal(store.dump().campaigns, 1);
  assert.ok((saved.rowsWritten ?? 0) > 0);
});

test("clients, client viewers, and share links never see stackadapt spend", () => {
  const visibility = defaultVisibility();
  const dashboard = {
    mode: "client" as const,
    showMoney: true,
    dates: ["2026-10-20"],
    campaigns: [
      {
        id: "camp-1",
        name: "Cedar prospecting",
        goal: "leads" as const,
        status: "active" as const,
        platform: "stackadapt",
        dailyBudget: 40,
        ads: [
          {
            id: "ad-1",
            name: "Roof photo",
            format: "Video",
            status: "active" as const,
            audience: "Homeowners",
            thumbnailUrl: null,
            days: [{ date: "2026-10-20", i: 1000, r: 800, c: 25, l: 2, k: 1, s: 12.5 }],
          },
        ],
      },
    ],
    notes: [],
    sourceLine: "Connected TV",
    workspaceName: "Demo workspace",
    mock: true,
    spend: 12.5,
    cost: 12.5,
    cpa: 6,
    cpl: 6,
    cpx: 4,
    roas: 2,
    budget: 40,
    bid: 3,
  };
  const share = {
    viewOnly: true as const,
    client: "Cedar Lane Studio",
    rangeLabel: "Last 7 days",
    kpis: [
      { label: "Ad views", value: "1,000", delta: "", meaning: "How many times people saw the ads." },
      { label: "Clicks", value: "25", delta: "", meaning: "Clicks" },
      { label: "Spend", value: "$12.50", delta: "CPA is $6", meaning: "CPL is $6 and ROAS is 2" },
    ],
    campaigns: [{ name: "Cedar prospecting", status: "Doing well" as const, booked: 1, leads: 2, channel: "StackAdapt", detail: "2 leads" }],
    updated: "Updated just now",
    sharedBy: "your marketing team",
    expires: "",
    spend: 12.5,
    cost: 12.5,
    cpa: 6,
    cpl: 6,
    cpx: 4,
    roas: 2,
    budget: 40,
    bid: 3,
  };
  const row = {
    platform: "stackadapt",
    campaign: "Cedar prospecting",
    impressions: 1000,
    clicks: 25,
    conversions: 2,
    spend: 12.5,
    cost: 12.5,
    cpa: 6,
    cpl: 6,
    cpx: 4,
    roas: 2,
    budget: 40,
    bid: 3,
  };
  const surfaces = [
    applyClientSurface(dashboard, visibility, true),
    applyClientSurface(share, visibility, true),
    forSpendViewer(row, { role: "owner", kind: "client_owner" }),
    forSpendViewer(row, { role: "client_viewer", kind: "client_viewer" }),
    forSpendViewer(share, null),
  ];
  for (const surface of surfaces) {
    const printed = JSON.stringify(surface).toLowerCase();
    for (const word of ["spend", "cost", "cpa", "cpl", "cpx", "roas", "budget", "bid"]) {
      assert.equal(printed.includes(word), false, word);
    }
    assert.equal(printed.includes("$"), false);
    assert.equal(printed.includes("12.5"), false);
  }
  const clientDash = surfaces[0] as { campaigns?: { ads?: { days?: { i?: number; c?: number }[] }[] }[]; showMoney?: boolean };
  assert.equal(clientDash.showMoney, false);
  assert.equal(clientDash.campaigns?.[0]?.ads?.[0]?.days?.[0]?.i, 1000);
  assert.equal(clientDash.campaigns?.[0]?.ads?.[0]?.days?.[0]?.c, 25);
  const viewer = surfaces[3] as { impressions?: number; clicks?: number; conversions?: number };
  assert.equal(viewer.impressions, 1000);
  assert.equal(viewer.clicks, 25);
  assert.equal(viewer.conversions, 2);
});

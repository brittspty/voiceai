import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClientChannel } from "../../../components/jarvis/pages";
import { ChannelDetail } from "../../../components/jarvis/staff";
import { decideCtvAttribution } from "../config";
import { StackAdaptWriteBlockedError, stackAdaptGraphql } from "../connectors/stackadapt-client";
import { buildCtvChannelPage, ctvExportCsv, ctvMoneyKeys, releaseCtvChannel } from "./channel";
import { STACKADAPT_CTV_DELIVERY_QUERY, pullStackAdaptCtvDelivery } from "./graphql";
import { answerCtvRequest } from "./http";
import { isCtvCampaign, parseCtvGraphqlNode } from "./parse";
import { memoryCtvLiveStore, runStackAdaptCtvSync, type CtvLiveDay } from "./live-sync";
import { attachShareCtv } from "./sync";
import type { CtvView } from "./report";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const ADVERTISER = "1001";
const OTHER = "2002";
const KEY = "ctv-test-key";

const OFF = {
  STACKADAPT_CTV_LIVE: "off",
  STACKADAPT_SYNC: "on",
  STACKADAPT_API_KEY: KEY,
  INTEGRATIONS_MODE: "mock",
  MARKETING_SYNC_MODE: "auto",
  CTV_ATTRIBUTION: "on",
};

const LIVE = {
  ...OFF,
  STACKADAPT_CTV_LIVE: "on",
  CTV_ATTRIBUTION: "off",
  MARKETING_LOOKBACK_DAYS: "14",
};

function keysOf(value: unknown, keys: string[] = []) {
  if (Array.isArray(value)) {
    for (const item of value) keysOf(item, keys);
    return keys;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      keys.push(key.toLowerCase().replace(/[_-]/g, ""));
      keysOf(child, keys);
    }
  }
  return keys;
}

function node(partial: Record<string, unknown>) {
  return {
    campaign: {
      id: "camp-north",
      name: "Northwind evening slate",
      channelType: "CTV",
      advertiser: { id: ADVERTISER },
      campaignStatus: { state: "LIVE" },
    },
    granularity: { startTime: "2026-11-02T00:00:00Z" },
    metrics: {
      impressionsBigint: "5000",
      uniqueImpressionsBigint: "2100",
      frequency: 2.4,
      videoStartsBigint: "4800",
      videoQ1PlaybacksBigint: "4000",
      videoQ2PlaybacksBigint: "3000",
      videoQ3PlaybacksBigint: "2000",
      videoCompletionsBigint: "1500",
      videoCompletionRate: 0.3,
      clickConversionsBigint: "6",
      impressionConversionsBigint: "2",
      cost: "812.4",
      budget: "424242",
      bid: "77",
    },
    ...partial,
  };
}

function page(body: unknown, cursor: { hasNextPage: boolean; endCursor?: string }) {
  return {
    data: {
      campaignDelivery: {
        records: {
          pageInfo: cursor,
          nodes: Array.isArray(body) ? body : [body],
        },
      },
    },
  };
}

test("the CTV switch stays off and makes no outbound call", async () => {
  assert.equal(decideCtvAttribution({}).action, "skip");
  assert.equal(decideCtvAttribution({ CTV_ATTRIBUTION: "on", INTEGRATIONS_MODE: "mock", STACKADAPT_API_KEY: KEY }).action, "mock");
  assert.equal(decideCtvAttribution({ CTV_ATTRIBUTION: "on", INTEGRATIONS_MODE: "live", STACKADAPT_API_KEY: KEY }).action, "live");
  assert.match(readFileSync(path.join(ROOT, ".env.example"), "utf8"), /STACKADAPT_CTV_LIVE=off/);
  let calls = 0;
  const skipped = await runStackAdaptCtvSync({
    env: OFF,
    fetchImpl: async () => {
      calls += 1;
      return Response.json({});
    },
  });
  assert.equal(skipped.status, "skipped");
  assert.equal(skipped.outbound, 0);
  assert.equal(calls, 0);
  const closed = await runStackAdaptCtvSync({
    env: { ...LIVE, STACKADAPT_SYNC: "off" },
    fetchImpl: async () => {
      calls += 1;
      return Response.json({});
    },
  });
  assert.equal(closed.outbound, 0);
  assert.equal(calls, 0);
  const example = renderToStaticMarkup(createElement(ClientChannel, { channel: "ctv" }));
  assert.match(example, /EXAMPLE DATA/);
  assert.match(example, /Harbor Dental/);
});

test("the CTV query is read-only, paged, and refuses to run without one advertiser", async () => {
  assert.match(STACKADAPT_CTV_DELIVERY_QUERY, /\bquery\b/);
  assert.doesNotMatch(STACKADAPT_CTV_DELIVERY_QUERY, /\bmutation\b/i);
  assert.doesNotMatch(STACKADAPT_CTV_DELIVERY_QUERY, /\bbudget\b/i);
  assert.doesNotMatch(STACKADAPT_CTV_DELIVERY_QUERY, /\bbid\b/i);
  assert.match(STACKADAPT_CTV_DELIVERY_QUERY, /channelType/);
  assert.match(STACKADAPT_CTV_DELIVERY_QUERY, /uniqueImpressionsBigint/);
  assert.match(STACKADAPT_CTV_DELIVERY_QUERY, /videoStartsBigint/);
  assert.match(STACKADAPT_CTV_DELIVERY_QUERY, /videoQ1PlaybacksBigint/);
  assert.match(STACKADAPT_CTV_DELIVERY_QUERY, /videoCompletionsBigint/);
  assert.match(STACKADAPT_CTV_DELIVERY_QUERY, /videoCompletionRate/);
  assert.match(STACKADAPT_CTV_DELIVERY_QUERY, /clickConversionsBigint/);
  assert.match(STACKADAPT_CTV_DELIVERY_QUERY, /impressionConversionsBigint/);
  assert.match(STACKADAPT_CTV_DELIVERY_QUERY, /\bcost\b/);
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return Response.json({});
  };
  await assert.rejects(() => pullStackAdaptCtvDelivery({ apiKey: KEY, from: "2026-11-01", to: "2026-11-04", advertiserId: "", fetchImpl }), /advertiser/);
  await assert.rejects(
    () => stackAdaptGraphql({ apiKey: KEY, query: STACKADAPT_CTV_DELIVERY_QUERY, variables: {}, fetchImpl }),
    /advertiser/,
  );
  await assert.rejects(
    () => stackAdaptGraphql({
      apiKey: KEY,
      query: STACKADAPT_CTV_DELIVERY_QUERY.replace("query", "mutation"),
      variables: { advertiserIds: [ADVERTISER] },
      fetchImpl,
    }),
    StackAdaptWriteBlockedError,
  );
  assert.equal(calls, 0);
});

test("CTV rows are chosen by channel type and parse the delivery metrics", () => {
  assert.equal(isCtvCampaign({ name: "CTV special", channelType: "DISPLAY" }), false);
  assert.equal(isCtvCampaign({ name: "Evening slate", channelType: "", namingParsed: { channelType: "CTV" } }), true);
  assert.equal(isCtvCampaign({ name: "CTV special", channelType: "", namingParsed: {} }), false);
  const parsed = parseCtvGraphqlNode(node({}), ADVERTISER);
  assert.ok(parsed);
  assert.equal(parsed.channelType, "CTV");
  assert.equal(parsed.campaignName, "Northwind evening slate");
  assert.equal(parsed.impressions, 5000);
  assert.equal(parsed.uniqueImpressions, 2100);
  assert.equal(parsed.frequency, 2.4);
  assert.equal(parsed.videoStarts, 4800);
  assert.equal(parsed.completion25, 4000);
  assert.equal(parsed.completion50, 3000);
  assert.equal(parsed.completion75, 2000);
  assert.equal(parsed.completion100, 1500);
  assert.equal(parsed.completionRate, 0.3);
  assert.equal(parsed.clickConversions, 6);
  assert.equal(parsed.viewConversions, 2);
  assert.equal(parsed.spend, 812.4);
  assert.equal(JSON.stringify(parsed).includes("424242"), false);
  assert.equal(JSON.stringify(parsed).includes("\"bid\""), false);
  const display = parseCtvGraphqlNode(node({
    campaign: { id: "camp-display", name: "CTV special", channelType: "DISPLAY", advertiser: { id: ADVERTISER }, campaignStatus: { state: "LIVE" } },
  }), ADVERTISER);
  assert.equal(display?.channelType, "DISPLAY");
  assert.equal(parseCtvGraphqlNode(node({}), OTHER), null);
});

test("a live read requests one mapped advertiser and leaves the other client's rows", async () => {
  const seen: { url: string; method: string; body: string }[] = [];
  const example: CtvLiveDay = {
    clientId: "north",
    date: "2026-11-02",
    campaignId: "camp-example",
    campaignName: "Example slate",
    channelType: "CTV",
    impressions: 9,
    uniqueImpressions: 0,
    frequency: 0,
    videoStarts: 0,
    completion25: 0,
    completion50: 0,
    completion75: 0,
    completion100: 0,
    clickConversions: 0,
    viewConversions: 0,
    spend: 1,
    exampleData: true,
  };
  const pinecrest: CtvLiveDay = {
    clientId: "pine",
    date: "2026-11-02",
    campaignId: "camp-pine",
    campaignName: "Pinecrest late slate",
    channelType: "CTV",
    impressions: 33,
    uniqueImpressions: 40,
    frequency: 1,
    videoStarts: 70,
    completion25: 0,
    completion50: 0,
    completion75: 0,
    completion100: 0,
    clickConversions: 0,
    viewConversions: 0,
    spend: 12,
    exampleData: false,
  };
  const store = memoryCtvLiveStore([], [example, pinecrest]);
  const saved = await runStackAdaptCtvSync({
    env: LIVE,
    now: new Date("2026-11-04T15:00:00.000Z"),
    store,
    advertisers: [
      { id: "north", stackadaptAdvertiserIds: [ADVERTISER], stackadaptLiveRead: true, stackadaptCampaignNameContains: "Northwind" },
      { id: "pine", stackadaptAdvertiserIds: [ADVERTISER], stackadaptLiveRead: true, stackadaptCampaignNameContains: "Pinecrest" },
      { id: "closed", stackadaptAdvertiserIds: [OTHER], stackadaptLiveRead: false },
    ],
    fetchImpl: async (url, init) => {
      const body = String(init?.body || "");
      seen.push({ url: String(url), method: String(init?.method), body });
      const variables = JSON.parse(body).variables as { after?: string; advertiserIds?: string[] };
      assert.deepEqual(variables.advertiserIds, [ADVERTISER]);
      if (!variables.after) {
        return Response.json(page([
          node({}),
          node({
            campaign: { id: "camp-display", name: "CTV special", channelType: "DISPLAY", advertiser: { id: ADVERTISER }, campaignStatus: { state: "LIVE" } },
            metrics: { impressionsBigint: "77", cost: "5" },
          }),
        ], { hasNextPage: true, endCursor: "page-2" }));
      }
      return Response.json(page([], { hasNextPage: false }));
    },
  });
  assert.equal(saved.status, "succeeded");
  assert.equal(saved.outbound, 2);
  assert.ok(seen.every((row) => row.method === "POST" && row.url === "https://api.stackadapt.com/graphql"));
  assert.equal(seen.some((row) => row.body.includes(OTHER)), false);
  assert.equal(store.examplesCleared, true);
  assert.equal(store.days.some((row) => row.exampleData), false);
  assert.equal(store.days.find((row) => row.clientId === "pine")?.impressions, 33);
  const north = store.days.find((row) => row.clientId === "north");
  assert.equal(north?.impressions, 5000);
  assert.equal(north?.videoStarts, 4800);
  assert.equal(north?.spend, 812.4);
  assert.equal(store.days.some((row) => row.campaignId === "camp-display"), false);
  assert.equal(store.campaigns.find((row) => row.externalId === "camp-north")?.channelType, "CTV");
  assert.equal(store.campaigns.find((row) => row.externalId === "camp-display")?.channelType, "DISPLAY");
  const built = buildCtvChannelPage({
    showMoney: false,
    staff: false,
    clientId: "north",
    clientName: "Northwind Studio",
    days: 14,
    status: "active",
    endDate: "2026-11-04",
    campaigns: [
      { id: "row-north", externalId: "camp-north", name: "Northwind evening slate", clientId: "north", status: "active", channelType: "CTV" },
      { id: "row-pine", externalId: "camp-pine", name: "Pinecrest late slate", clientId: "pine", status: "active", channelType: "CTV" },
      { id: "row-display", externalId: "camp-display", name: "CTV special", clientId: "north", status: "active", channelType: "DISPLAY" },
      { id: "row-paused", externalId: "camp-paused", name: "Northwind paused slate", clientId: "north", status: "paused", channelType: "CTV" },
    ],
    daysRows: [
      ...store.days,
      { clientId: "north", campaignId: "camp-paused", date: "2026-11-02", impressions: 15, uniqueImpressions: 0, frequency: 0, videoStarts: 0, completion25: 0, completion50: 0, completion75: 0, completion100: 0, clickConversions: 0, viewConversions: 0 },
      { clientId: "north", campaignId: "camp-north", date: "2026-10-01", impressions: 15, uniqueImpressions: 0, frequency: 0, videoStarts: 0, completion25: 0, completion50: 0, completion75: 0, completion100: 0, clickConversions: 0, viewConversions: 0 },
    ],
  });
  assert.deepEqual(built.rows.map((row) => row.name), ["Northwind evening slate"]);
  assert.equal(built.totals.impressions, 5000);
  assert.equal(JSON.stringify(built).includes("33"), false);
  assert.equal(built.note, "Event-level exposures and households are not available yet.");
  assert.equal("exposures" in built, false);
});

test("client, share, plan, export, and staff without cost lose spend and rates", async () => {
  const pageModel = buildCtvChannelPage({
    showMoney: true,
    staff: true,
    clientId: "north",
    clientName: "Northwind Studio",
    days: 14,
    status: "active",
    path: "/c/north/ctv",
    endDate: "2026-11-04",
    campaigns: [{ id: "row-north", externalId: "camp-north", name: "Northwind evening slate", clientId: "north", status: "active", channelType: "CTV" }],
    daysRows: [{
      clientId: "north",
      campaignId: "camp-north",
      date: "2026-11-02",
      impressions: 5000,
      uniqueImpressions: 2100,
      frequency: 2.4,
      videoStarts: 4800,
      completion25: 4000,
      completion50: 3000,
      completion75: 2000,
      completion100: 1500,
      clickConversions: 6,
      viewConversions: 2,
      spend: 812.4,
    }],
  });
  const poisoned = { ...pageModel, cost: 1, ecpm: 2, ecpv: 3, cpa: 4, cpl: 5, roas: 6, budget: 7, bid: 8, budgetAmount: 9 };
  for (const surface of ["client", "share", "plan", "export", "staff_nocost"] as const) {
    const released = releaseCtvChannel(poisoned, surface);
    const names = keysOf(released);
    for (const key of ["spend", "cost", "ecpm", "ecpv", "cpa", "cpl", "roas", "budget", "budgetamount", "bid"]) {
      assert.equal(names.includes(key), false, `${surface} ${key}`);
    }
    assert.equal(JSON.stringify(released).includes("812.4"), false, surface);
    assert.equal(ctvMoneyKeys(released).length, 0, surface);
  }
  assert.equal(releaseCtvChannel(poisoned, "staff").totals.spend, 812.4);
  const view = { delivery: { spend: 812.4, cost: 1, cpm: 2, cpa: 4, cpl: 5, roas: 6 }, ecpm: 2, ecpv: 3, budget: 7, bid: 8 } as unknown as CtvView;
  const clientApi = answerCtvRequest({ enabled: true, kind: "client_owner", seesCost: false, role: "owner", view, channel: poisoned });
  const viewerApi = answerCtvRequest({ enabled: true, kind: "client_viewer", seesCost: false, role: "client_viewer", view, channel: poisoned });
  const quietApi = answerCtvRequest({ enabled: true, kind: "all_clients_viewer", seesCost: false, role: "all_clients_viewer", view, channel: poisoned });
  const staffApi = answerCtvRequest({ enabled: true, kind: "super_admin", seesCost: true, role: "super_admin", view, channel: poisoned });
  assert.equal(clientApi.status, 403);
  assert.equal(viewerApi.status, 403);
  assert.equal(JSON.stringify(clientApi.body).includes("812.4"), false);
  assert.equal(JSON.stringify(viewerApi.body).includes("812.4"), false);
  assert.equal(quietApi.status, 200);
  assert.equal(JSON.stringify(quietApi.body).includes("812.4"), false);
  assert.equal(keysOf(quietApi.body).includes("ecpv"), false);
  assert.equal(staffApi.status, 200);
  assert.equal(JSON.stringify(staffApi.body).includes("812.4"), true);
  const shared = await attachShareCtv({ campaigns: [] }, { ...LIVE, CTV_ATTRIBUTION: "off" }, async () => poisoned);
  assert.equal(JSON.stringify(shared).includes("812.4"), false);
  assert.equal(keysOf(shared.ctvChannel).includes("spend"), false);
  const csv = ctvExportCsv(poisoned);
  assert.match(csv, /Northwind evening slate/);
  assert.equal(csv.includes("812.4"), false);
  assert.doesNotMatch(csv, /spend|cost|ecpm|ecpv|cpa|cpl|roas|budget|bid/i);
  const apiSource = readFileSync(path.join(ROOT, "app/api/marketing/ctv/route.ts"), "utf8");
  const shareSource = readFileSync(path.join(ROOT, "app/api/share/[token]/route.ts"), "utf8");
  const planSource = readFileSync(path.join(ROOT, "app/plan/[code]/page.tsx"), "utf8");
  assert.match(apiSource, /answerCtvRequest/);
  assert.match(shareSource, /attachShareCtv/);
  assert.match(shareSource, /ctvExportCsv/);
  assert.match(planSource, /loadPlanCtv/);
});

test("the client page renders stored rows and hides the other client's numbers", () => {
  const model = releaseCtvChannel(buildCtvChannelPage({
    showMoney: true,
    staff: false,
    clientId: "north",
    clientName: "Northwind Studio",
    days: 14,
    status: "active",
    path: "/c/north/ctv",
    endDate: "2026-11-04",
    campaigns: [
      { id: "row-north", externalId: "camp-north", name: "Northwind evening slate", clientId: "north", status: "active", channelType: "CTV" },
      { id: "row-pine", externalId: "camp-pine", name: "Pinecrest late slate", clientId: "pine", status: "active", channelType: "CTV" },
    ],
    daysRows: [
      { clientId: "north", campaignId: "camp-north", date: "2026-11-02", impressions: 5000, uniqueImpressions: 2100, frequency: 2.4, videoStarts: 4800, completion25: 4000, completion50: 3000, completion75: 2000, completion100: 1500, clickConversions: 6, viewConversions: 2, spend: 812.4 },
      { clientId: "pine", campaignId: "camp-pine", date: "2026-11-02", impressions: 33, uniqueImpressions: 40, frequency: 1, videoStarts: 70, completion25: 0, completion50: 0, completion75: 0, completion100: 0, clickConversions: 0, viewConversions: 0, spend: 12 },
    ],
  }), "client");
  const html = renderToStaticMarkup(createElement(ClientChannel, { channel: "ctv", ctv: model }));
  assert.match(html, /Northwind evening slate/);
  assert.match(html, /5,000/);
  assert.match(html, /not available yet/);
  assert.equal(html.includes("Pinecrest"), false);
  assert.equal(html.includes("EXAMPLE DATA"), false);
  assert.equal(html.includes("Harbor Dental"), false);
  assert.equal(html.includes("812.40"), false);
  assert.equal(html.includes("StackAdapt"), false);
  assert.equal(/\b33\b/.test(html), false);
  const staff = buildCtvChannelPage({
    showMoney: true,
    staff: true,
    clientId: "north",
    clientName: "Northwind Studio",
    days: 14,
    status: "active",
    path: "/c/north/ctv",
    endDate: "2026-11-04",
    campaigns: [{ id: "row-north", externalId: "camp-north", name: "Northwind evening slate", clientId: "north", status: "active", channelType: "CTV" }],
    daysRows: [{ clientId: "north", campaignId: "camp-north", date: "2026-11-02", impressions: 5000, uniqueImpressions: 2100, frequency: 2.4, videoStarts: 4800, completion25: 4000, completion50: 3000, completion75: 2000, completion100: 1500, clickConversions: 6, viewConversions: 2, spend: 812.4 }],
  });
  const staffHtml = renderToStaticMarkup(createElement(ChannelDetail, { channel: "ctv", ctv: staff }));
  assert.match(staffHtml, /\$812\.40/);
  assert.match(staffHtml, /Active/);
  const paint = readFileSync(path.join(ROOT, "components/jarvis/ctv-live.tsx"), "utf8");
  assert.equal(/blue|teal|purple|#0000ff|#00f\b|#008080|#800080/i.test(paint), false);
});

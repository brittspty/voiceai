import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CtvAttributionLive } from "../../../components/ctv-attribution-live";
import { brandTokens } from "../../brand/tokens";
import { StackAdaptWriteBlockedError, stackAdaptGraphql } from "../connectors/stackadapt-client";
import {
  BREAKDOWN_UNAVAILABLE,
  PIXEL_UNAVAILABLE,
  STACKADAPT_CTV_BREAKDOWN_QUERY,
  STACKADAPT_CTV_CONVERSION_QUERY,
  STACKADAPT_CTV_CONVERSION_VERIFIED_QUERY,
  STACKADAPT_CTV_PIXEL_QUERY,
  STACKADAPT_CTV_UNVERIFIED_FIELDS,
  VIEW_THROUGH_LABEL,
  pullStackAdaptCtvAttribution,
} from "./attribution-graphql";
import { parseCtvBreakdownNode, parseCtvConversionNode, parseCtvPixelNode } from "./attribution-parse";
import { buildCtvAttributionPage, ctvAttributionCsv, releaseCtvAttribution } from "./attribution";
import { memoryCtvAttributionStore, runStackAdaptCtvAttribution, type CtvAttributionRow } from "./attribution-sync";
import { answerCtvRequest } from "./http";
import { attachShareCtv, ctvViewWithoutExample } from "./sync";
import type { CtvView } from "./report";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const ADVERTISER = "1001";
const OTHER = "2002";
const KEY = "ctv-attribution-test-key";

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

function deliveryNode(partial: Record<string, unknown> = {}) {
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
      clickConversionsBigint: "6",
      impressionConversionsBigint: "2",
      ipConversionsBigint: "4",
      cookieConversionsBigint: "3",
      cost: "812.4",
      budget: "424242",
      bid: "77",
    },
    ...partial,
  };
}

function pixelNode() {
  return {
    campaign: {
      id: "camp-north",
      name: "Northwind evening slate",
      channelType: "CTV",
      advertiser: { id: ADVERTISER },
    },
    attributes: {
      date: "2026-11-02",
      conversionPixel: { id: "px-visit", name: "Northwind site visit" },
    },
    metrics: {
      impressions: 5000,
      clickConversions: 6,
      impressionConversions: 2,
      cookieConversions: 1,
      cost: "812.4",
      budget: "9",
      bid: "3",
    },
  };
}

function page(root: "campaignDelivery" | "campaignInsight", body: unknown, cursor: { hasNextPage: boolean; endCursor?: string }) {
  return {
    data: {
      [root]: {
        records: {
          pageInfo: cursor,
          nodes: Array.isArray(body) ? body : [body],
        },
      },
    },
  };
}

const QUERIES = [STACKADAPT_CTV_CONVERSION_QUERY, STACKADAPT_CTV_CONVERSION_VERIFIED_QUERY, STACKADAPT_CTV_PIXEL_QUERY, STACKADAPT_CTV_BREAKDOWN_QUERY];

test("the attribution switch stays off and makes no outbound call", async () => {
  let calls = 0;
  const skipped = await runStackAdaptCtvAttribution({
    env: OFF,
    fetchImpl: async () => {
      calls += 1;
      return Response.json({});
    },
  });
  assert.equal(skipped.status, "skipped");
  assert.equal(skipped.outbound, 0);
  assert.equal(calls, 0);
  const closed = await runStackAdaptCtvAttribution({
    env: { ...LIVE, STACKADAPT_SYNC: "off" },
    fetchImpl: async () => {
      calls += 1;
      return Response.json({});
    },
  });
  assert.equal(closed.outbound, 0);
  assert.equal(calls, 0);
  const pageSource = readFileSync(path.join(ROOT, "app/(app)/marketing/ctv/page.tsx"), "utf8");
  assert.ok(pageSource.indexOf("stackAdaptCtvLiveEnabled()") < pageSource.indexOf("<CtvAttributionView"));
  assert.equal(JSON.stringify(ctvViewWithoutExample()).includes("Example Streaming App"), false);
});

test("the conversion query is read-only, paged, and requires one advertiser", async () => {
  for (const query of QUERIES) {
    assert.match(query, /\bquery\b/);
    assert.doesNotMatch(query, /\bmutation\b/i);
    assert.doesNotMatch(query, /\bbudget\b/i);
    assert.doesNotMatch(query, /\bbid\b/i);
    assert.match(query, /advertiserIds/);
  }
  assert.match(STACKADAPT_CTV_CONVERSION_QUERY, /clickConversionsBigint/);
  assert.match(STACKADAPT_CTV_CONVERSION_QUERY, /impressionConversionsBigint/);
  assert.match(STACKADAPT_CTV_CONVERSION_QUERY, /ipConversionsBigint/);
  assert.match(STACKADAPT_CTV_CONVERSION_QUERY, /cookieConversionsBigint/);
  assert.doesNotMatch(STACKADAPT_CTV_CONVERSION_VERIFIED_QUERY, /ipConversionsBigint/);
  assert.match(STACKADAPT_CTV_PIXEL_QUERY, /conversionPixel/);
  assert.match(STACKADAPT_CTV_BREAKDOWN_QUERY, /campaignInsight/);
  assert.equal(STACKADAPT_CTV_UNVERIFIED_FIELDS.includes("metrics.ipConversionsBigint"), true);
  assert.equal(STACKADAPT_CTV_UNVERIFIED_FIELDS.includes("campaignInsight"), true);
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return Response.json({});
  };
  await assert.rejects(
    () => pullStackAdaptCtvAttribution({ apiKey: KEY, from: "2026-11-01", to: "2026-11-04", advertiserId: "", fetchImpl }),
    /advertiser/,
  );
  await assert.rejects(
    () => stackAdaptGraphql({ apiKey: KEY, query: STACKADAPT_CTV_CONVERSION_QUERY, variables: {}, fetchImpl }),
    /advertiser/,
  );
  await assert.rejects(
    () => stackAdaptGraphql({ apiKey: KEY, query: STACKADAPT_CTV_PIXEL_QUERY, variables: {}, fetchImpl }),
    /advertiser/,
  );
  await assert.rejects(
    () => stackAdaptGraphql({
      apiKey: KEY,
      query: STACKADAPT_CTV_CONVERSION_QUERY.replace("query", "mutation"),
      variables: { advertiserIds: [ADVERTISER] },
      fetchImpl,
    }),
    StackAdaptWriteBlockedError,
  );
  assert.equal(calls, 0);
});

test("conversion, pixel, and breakdown rows parse and ignore budget", () => {
  const parsed = parseCtvConversionNode(deliveryNode(), ADVERTISER);
  assert.ok(parsed);
  assert.equal(parsed.channelType, "CTV");
  assert.equal(parsed.campaignName, "Northwind evening slate");
  assert.equal(parsed.impressions, 5000);
  assert.equal(parsed.clickConversions, 6);
  assert.equal(parsed.viewConversions, 2);
  assert.equal(parsed.ipConversions, 4);
  assert.equal(parsed.cookieConversions, 3);
  assert.equal(parsed.spend, 812.4);
  assert.equal(JSON.stringify(parsed).includes("424242"), false);
  assert.equal(JSON.stringify(parsed).includes("\"bid\""), false);
  assert.equal(parseCtvConversionNode(deliveryNode(), OTHER), null);
  const pixel = parseCtvPixelNode(pixelNode(), ADVERTISER);
  assert.equal(pixel?.pixelName, "Northwind site visit");
  assert.equal(pixel?.viewConversions, 2);
  assert.equal(JSON.stringify(pixel).includes("\"9\""), false);
  const parts = parseCtvBreakdownNode({
    campaign: { id: "camp-north", name: "Northwind evening slate", channelType: "CTV", advertiser: { id: ADVERTISER } },
    attributes: {
      date: "2026-11-02",
      supplySource: { id: "src-1", name: "Northwind Stream" },
      app: { title: "Northwind Player" },
      deviceType: "CONNECTED_TV",
      country: { name: "North Dakota", code: "ND" },
    },
    metrics: { impressions: 5000, clickConversions: 6, impressionConversions: 2, cost: "10" },
  }, ADVERTISER);
  assert.deepEqual(parts.map((row) => row.kind).sort(), ["app", "device", "geo", "publisher"]);
  assert.equal(parts.find((row) => row.kind === "publisher")?.name, "Northwind Stream");
});

test("a schema error on the optional breakdown leaves the conversion rows", async () => {
  const pulled = await pullStackAdaptCtvAttribution({
    apiKey: KEY,
    from: "2026-10-22",
    to: "2026-11-04",
    advertiserId: ADVERTISER,
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(String(init?.body || "{}")) as { query?: string; variables?: { after?: string } };
      const query = body.query || "";
      if (query.includes("SUPPLY_SOURCE")) {
        return Response.json({ errors: [{ message: 'Cannot query field "app" on type "InsightAttributes".' }] });
      }
      if (query.includes("CONVERSION_PIXEL")) return Response.json(page("campaignInsight", pixelNode(), { hasNextPage: false }));
      if (!body.variables?.after) {
        return Response.json(page("campaignDelivery", [
          deliveryNode(),
          deliveryNode({
            campaign: { id: "camp-display", name: "CTV special", channelType: "DISPLAY", advertiser: { id: ADVERTISER }, campaignStatus: { state: "LIVE" } },
          }),
          deliveryNode({
            campaign: { id: "camp-other", name: "Other client slate", channelType: "CTV", advertiser: { id: OTHER }, campaignStatus: { state: "LIVE" } },
          }),
        ], { hasNextPage: true, endCursor: "page-2" }));
      }
      return Response.json(page("campaignDelivery", [], { hasNextPage: false }));
    },
  });
  assert.equal(pulled.breakdownNote, BREAKDOWN_UNAVAILABLE);
  assert.equal(pulled.pixelAvailable, true);
  assert.equal(pulled.pixels[0]?.pixelName, "Northwind site visit");
  assert.equal(pulled.rows.filter((row) => row.campaignId === "camp-north").length, 1);
  assert.equal(pulled.rows.some((row) => row.campaignId === "camp-other"), false);
  assert.equal(pulled.ipSplitAvailable, true);
});

test("a schema error on the IP split falls back to the verified conversion fields", async () => {
  let sawVerified = false;
  const pulled = await pullStackAdaptCtvAttribution({
    apiKey: KEY,
    from: "2026-11-01",
    to: "2026-11-04",
    advertiserId: ADVERTISER,
    fetchImpl: async (_url, init) => {
      const query = String(JSON.parse(String(init?.body || "{}")).query || "");
      if (query.includes("ipConversionsBigint")) {
        return Response.json({ errors: [{ message: 'Cannot query field "ipConversionsBigint" on type "DeliveryStatsRecord".' }] });
      }
      if (query.includes("campaignDelivery")) {
        sawVerified = true;
        return Response.json(page("campaignDelivery", deliveryNode({
          metrics: { impressionsBigint: "5000", clickConversionsBigint: "6", impressionConversionsBigint: "2", cost: "812.4" },
        }), { hasNextPage: false }));
      }
      return Response.json(page("campaignInsight", [], { hasNextPage: false }));
    },
  });
  assert.equal(sawVerified, true);
  assert.equal(pulled.ipSplitAvailable, false);
  assert.equal(pulled.rows[0]?.clickConversions, 6);
  assert.equal(pulled.rows[0]?.viewConversions, 2);
  assert.equal(pulled.rows[0]?.ipConversions, 0);
});

test("a live read keeps the other client's numbers and clears example rows", async () => {
  const example: CtvAttributionRow = {
    clientId: "north",
    date: "2026-11-02",
    campaignId: "camp-example",
    campaignName: "Sample evening slate",
    grain: "campaign",
    pixelId: "",
    pixelName: "",
    breakdown: "",
    breakdownName: "",
    impressions: 9,
    clickConversions: 0,
    viewConversions: 0,
    ipConversions: 0,
    cookieConversions: 0,
    spend: 1,
    exampleData: true,
  };
  const pine: CtvAttributionRow = {
    clientId: "pine",
    date: "2026-11-02",
    campaignId: "camp-pine",
    campaignName: "Pinecrest late slate",
    grain: "campaign",
    pixelId: "",
    pixelName: "",
    breakdown: "",
    breakdownName: "",
    impressions: 33,
    clickConversions: 1,
    viewConversions: 1,
    ipConversions: 0,
    cookieConversions: 0,
    spend: 12,
    exampleData: false,
  };
  const store = memoryCtvAttributionStore({ rows: [example, pine], segments: [{ exampleData: true }] });
  const seen: string[] = [];
  const saved = await runStackAdaptCtvAttribution({
    env: LIVE,
    now: new Date("2026-11-04T15:00:00.000Z"),
    store,
    advertisers: [
      { id: "north", stackadaptAdvertiserIds: [ADVERTISER], stackadaptLiveRead: true, stackadaptCampaignNameContains: "Northwind" },
      { id: "pine", stackadaptAdvertiserIds: [ADVERTISER], stackadaptLiveRead: true, stackadaptCampaignNameContains: "Pinecrest" },
      { id: "closed", stackadaptAdvertiserIds: [OTHER], stackadaptLiveRead: false },
    ],
    fetchImpl: async (url, init) => {
      const body = JSON.parse(String(init?.body || "{}")) as { query?: string; variables?: { after?: string; advertiserIds?: string[] } };
      seen.push(String(body.query || ""));
      assert.equal(init?.method, "POST");
      assert.equal(String(url), "https://api.stackadapt.com/graphql");
      assert.deepEqual(body.variables?.advertiserIds, [ADVERTISER]);
      assert.equal(JSON.stringify(body).includes(OTHER), false);
      const query = body.query || "";
      if (query.includes("SUPPLY_SOURCE")) {
        return Response.json({ errors: [{ message: 'Cannot query field "deviceType" on type "InsightAttributes".' }] });
      }
      if (query.includes("CONVERSION_PIXEL")) return Response.json(page("campaignInsight", pixelNode(), { hasNextPage: false }));
      if (!body.variables?.after) {
        return Response.json(page("campaignDelivery", [
          deliveryNode(),
          deliveryNode({
            campaign: { id: "camp-display", name: "CTV special", channelType: "DISPLAY", advertiser: { id: ADVERTISER }, campaignStatus: { state: "LIVE" } },
            metrics: { impressionsBigint: "77", cost: "5" },
          }),
        ], { hasNextPage: true, endCursor: "page-2" }));
      }
      return Response.json(page("campaignDelivery", [], { hasNextPage: false }));
    },
  });
  assert.equal(saved.status, "succeeded");
  assert.equal(saved.outbound, 4);
  assert.equal(store.examplesCleared, true);
  assert.equal(store.rows.some((row) => row.exampleData), false);
  assert.equal(store.segments.length, 0);
  assert.equal(store.rows.find((row) => row.clientId === "pine")?.impressions, 33);
  const north = store.rows.find((row) => row.clientId === "north" && row.grain === "campaign");
  assert.equal(north?.impressions, 5000);
  assert.equal(north?.viewConversions, 2);
  assert.equal(north?.clickConversions, 6);
  assert.equal(north?.spend, 812.4);
  assert.equal(store.rows.find((row) => row.grain === "pixel")?.pixelName, "Northwind site visit");
  assert.equal(store.rows.some((row) => row.campaignId === "camp-display"), false);
  assert.equal(store.metas.find((row) => row.clientId === "north")?.breakdownNote, BREAKDOWN_UNAVAILABLE);
  assert.equal(store.campaigns.find((row) => row.externalId === "camp-north")?.channelType, "CTV");
  assert.equal(store.campaigns.find((row) => row.externalId === "camp-display")?.channelType, "DISPLAY");
  assert.equal(seen.some((query) => /\bbudget\b|\bbid\b/i.test(query)), false);
  const built = buildCtvAttributionPage({
    showMoney: false,
    staff: true,
    clientId: "north",
    clientName: "Northwind Studio",
    days: 14,
    status: "active",
    endDate: "2026-11-04",
    ipSplitAvailable: true,
    pixelAvailable: true,
    breakdownNote: BREAKDOWN_UNAVAILABLE,
    campaigns: [
      { id: "row-north", externalId: "camp-north", name: "Northwind evening slate", clientId: "north", status: "active", channelType: "CTV" },
      { id: "row-pine", externalId: "camp-pine", name: "Pinecrest late slate", clientId: "pine", status: "active", channelType: "CTV" },
      { id: "row-display", externalId: "camp-display", name: "CTV special", clientId: "north", status: "active", channelType: "DISPLAY" },
      { id: "row-paused", externalId: "camp-paused", name: "Northwind paused slate", clientId: "north", status: "paused", channelType: "CTV" },
    ],
    rows: [
      ...store.rows,
      { clientId: "north", campaignId: "camp-paused", date: "2026-11-02", grain: "campaign", pixelId: "", pixelName: "", breakdown: "", breakdownName: "", impressions: 15, clickConversions: 0, viewConversions: 0, ipConversions: 0, cookieConversions: 0, spend: 0 },
      { clientId: "north", campaignId: "camp-north", date: "2026-10-01", grain: "campaign", pixelId: "", pixelName: "", breakdown: "", breakdownName: "", impressions: 15, clickConversions: 0, viewConversions: 0, ipConversions: 0, cookieConversions: 0, spend: 0 },
    ],
  });
  assert.deepEqual(built.campaigns.map((row) => row.name), ["Northwind evening slate"]);
  assert.equal(built.totals.impressions, 5000);
  assert.equal(built.totals.viewConversions, 2);
  assert.equal(built.totals.perThousand, 1.6);
  assert.equal(built.pixels[0]?.name, "Northwind site visit");
  assert.equal(built.breakdownNote, BREAKDOWN_UNAVAILABLE);
  assert.equal(built.viewThroughLabel, VIEW_THROUGH_LABEL);
  assert.equal(JSON.stringify(built).includes("33"), false);
  assert.equal(JSON.stringify(built).includes("Example Streaming App"), false);
  assert.equal("spend" in built.totals, false);
});

test("client, share, plan, export, and staff without cost lose attribution spend", async () => {
  const pageModel = buildCtvAttributionPage({
    showMoney: true,
    staff: true,
    clientId: "north",
    clientName: "Northwind Studio",
    days: 14,
    status: "active",
    path: "/marketing/ctv",
    endDate: "2026-11-04",
    ipSplitAvailable: true,
    pixelAvailable: true,
    campaigns: [{ id: "row-north", externalId: "camp-north", name: "Northwind evening slate", clientId: "north", status: "active", channelType: "CTV" }],
    rows: [{
      clientId: "north",
      campaignId: "camp-north",
      date: "2026-11-02",
      grain: "campaign",
      pixelId: "",
      pixelName: "",
      breakdown: "",
      breakdownName: "",
      impressions: 5000,
      clickConversions: 6,
      viewConversions: 2,
      ipConversions: 4,
      cookieConversions: 3,
      spend: 812.4,
    }, {
      clientId: "north",
      campaignId: "camp-north",
      date: "2026-11-02",
      grain: "pixel",
      pixelId: "px-visit",
      pixelName: "Northwind site visit",
      breakdown: "",
      breakdownName: "",
      impressions: 5000,
      clickConversions: 6,
      viewConversions: 2,
      ipConversions: 0,
      cookieConversions: 1,
      spend: 812.4,
    }],
  });
  const poisoned = { ...pageModel, cost: 1, ecpm: 2, ecpv: 3, cpa: 4, cpl: 5, roas: 6, budget: 7, bid: 8 };
  for (const surface of ["client", "share", "plan", "export", "staff_nocost"] as const) {
    const released = releaseCtvAttribution(poisoned, surface);
    const names = keysOf(released);
    for (const key of ["spend", "cost", "ecpm", "ecpv", "cpa", "cpl", "roas", "budget", "bid"]) {
      assert.equal(names.includes(key), false, `${surface} ${key}`);
    }
    assert.equal(JSON.stringify(released).includes("812.4"), false, surface);
  }
  assert.equal(releaseCtvAttribution(poisoned, "staff").totals.spend, 812.4);
  const view = { delivery: { spend: 812.4, cpa: 4 } } as unknown as CtvView;
  const clientApi = answerCtvRequest({ enabled: true, kind: "client_owner", seesCost: false, role: "owner", view, attribution: poisoned });
  const viewerApi = answerCtvRequest({ enabled: true, kind: "client_viewer", seesCost: false, role: "client_viewer", view, attribution: poisoned });
  const quietApi = answerCtvRequest({ enabled: true, kind: "all_clients_viewer", seesCost: false, role: "all_clients_viewer", view, attribution: poisoned });
  const staffApi = answerCtvRequest({ enabled: true, kind: "super_admin", seesCost: true, role: "super_admin", view, attribution: poisoned });
  assert.equal(clientApi.status, 403);
  assert.equal(viewerApi.status, 403);
  assert.equal(JSON.stringify(clientApi.body).includes("812.4"), false);
  assert.equal(quietApi.status, 200);
  assert.equal(JSON.stringify(quietApi.body).includes("812.4"), false);
  assert.equal(keysOf(quietApi.body).includes("spend"), false);
  assert.equal(keysOf(quietApi.body).includes("ecpv"), false);
  assert.equal(staffApi.status, 200);
  assert.equal(JSON.stringify(staffApi.body).includes("812.4"), true);
  const shared = await attachShareCtv({ campaigns: [] }, { ...LIVE, CTV_ATTRIBUTION: "on" }, async () => null, async () => poisoned);
  assert.equal(JSON.stringify(shared).includes("812.4"), false);
  assert.equal(JSON.stringify(shared).includes("Example Streaming App"), false);
  assert.equal(keysOf(shared.ctvAttribution).includes("spend"), false);
  const csv = ctvAttributionCsv(poisoned);
  assert.match(csv, /Northwind evening slate/);
  assert.match(csv, /pixel-tracked site visits/);
  assert.equal(csv.includes("812.4"), false);
  assert.doesNotMatch(csv, /spend|cost|ecpm|ecpv|cpa|cpl|roas|budget|bid/i);
  assert.match(readFileSync(path.join(ROOT, "app/api/marketing/ctv/route.ts"), "utf8"), /answerCtvRequest/);
  assert.match(readFileSync(path.join(ROOT, "app/api/share/[token]/route.ts"), "utf8"), /ctvAttributionCsv/);
  assert.match(readFileSync(path.join(ROOT, "app/plan/[code]/page.tsx"), "utf8"), /loadPlanAttribution/);
  assert.equal(PIXEL_UNAVAILABLE.includes("not available"), true);
});

test("the attribution page renders stored pixels and hides the other client's numbers", () => {
  const model = releaseCtvAttribution(buildCtvAttributionPage({
    showMoney: true,
    staff: false,
    clientId: "north",
    clientName: "Northwind Studio",
    days: 14,
    status: "active",
    path: "/marketing/ctv",
    endDate: "2026-11-04",
    ipSplitAvailable: true,
    pixelAvailable: true,
    breakdownNote: BREAKDOWN_UNAVAILABLE,
    campaigns: [
      { id: "row-north", externalId: "camp-north", name: "Northwind evening slate", clientId: "north", status: "active", channelType: "CTV" },
      { id: "row-pine", externalId: "camp-pine", name: "Pinecrest late slate", clientId: "pine", status: "active", channelType: "CTV" },
    ],
    rows: [
      { clientId: "north", campaignId: "camp-north", date: "2026-11-02", grain: "campaign", pixelId: "", pixelName: "", breakdown: "", breakdownName: "", impressions: 5000, clickConversions: 6, viewConversions: 2, ipConversions: 4, cookieConversions: 3, spend: 812.4 },
      { clientId: "north", campaignId: "camp-north", date: "2026-11-02", grain: "pixel", pixelId: "px-visit", pixelName: "Northwind site visit", breakdown: "", breakdownName: "", impressions: 5000, clickConversions: 6, viewConversions: 2, ipConversions: 0, cookieConversions: 0, spend: 812.4 },
      { clientId: "pine", campaignId: "camp-pine", date: "2026-11-02", grain: "campaign", pixelId: "", pixelName: "", breakdown: "", breakdownName: "", impressions: 33, clickConversions: 1, viewConversions: 1, ipConversions: 0, cookieConversions: 0, spend: 12 },
    ],
  }), "client");
  const html = renderToStaticMarkup(createElement(CtvAttributionLive, { model }));
  assert.match(html, /Northwind evening slate/);
  assert.match(html, /Northwind site visit/);
  assert.match(html, /pixel-tracked site visits after a CTV impression/);
  assert.match(html, /5,000/);
  assert.match(html, /not available/);
  assert.equal(html.includes("Pinecrest"), false);
  assert.equal(html.includes("EXAMPLE DATA"), false);
  assert.equal(html.includes("Example Streaming App"), false);
  assert.equal(html.includes("812.40"), false);
  assert.equal(/\b33\b/.test(html), false);
  const staff = buildCtvAttributionPage({
    showMoney: true,
    staff: true,
    clientId: "north",
    clientName: "Northwind Studio",
    clients: [{ id: "north", name: "Northwind Studio" }],
    days: 14,
    status: "active",
    path: "/marketing/ctv",
    endDate: "2026-11-04",
    ipSplitAvailable: false,
    pixelAvailable: false,
    pixelNote: PIXEL_UNAVAILABLE,
    campaigns: [{ id: "row-north", externalId: "camp-north", name: "Northwind evening slate", clientId: "north", status: "active", channelType: "CTV" }],
    rows: [{ clientId: "north", campaignId: "camp-north", date: "2026-11-02", grain: "campaign", pixelId: "", pixelName: "", breakdown: "", breakdownName: "", impressions: 5000, clickConversions: 6, viewConversions: 2, ipConversions: 4, cookieConversions: 3, spend: 812.4 }],
  });
  const staffHtml = renderToStaticMarkup(createElement(CtvAttributionLive, { model: staff }));
  assert.match(staffHtml, /\$812\.40/);
  assert.match(staffHtml, /Active/);
  assert.match(staffHtml, /All clients/);
  assert.equal(staffHtml.includes(PIXEL_UNAVAILABLE), true);
  const paint = readFileSync(path.join(ROOT, "components/ctv-attribution-live.tsx"), "utf8");
  assert.equal(brandTokens.light.brand, "#FF5800");
  assert.match(paint, /border-l-brand/);
  assert.match(paint, /text-brand/);
  assert.match(paint, /bg-ink/);
  assert.equal(/blue|teal|purple|#0000ff|#00f\b|#008080|#800080|#[0-9a-fA-F]{3,8}/i.test(paint), false);
});

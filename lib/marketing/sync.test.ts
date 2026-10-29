import assert from "node:assert/strict";
import test from "node:test";
import { mergeSnapshots, normalizeMetaBundle } from "./connectors/meta-map";
import { mockMetaBundle } from "./connectors/fixtures";
import type { FetchLike } from "./connectors/meta-client";
import { createMemoryStore } from "./store";
import { runMarketingSync } from "./sync";
import type { NormalizedAccount } from "./types";

const NOW = new Date("2026-10-07T15:00:00.000Z");
const TZ = "America/New_York";

function mockEnv(extra: Record<string, string> = {}) {
  return { MARKETING_SYNC_MODE: "mock", ...extra };
}

test("missing credentials skip without writing", async () => {
  const store = createMemoryStore();
  const result = await runMarketingSync({ env: {}, store, now: NOW, timezone: TZ });
  assert.equal(result.status, "skipped");
  assert.match(result.reason ?? "", /META_ACCESS_TOKEN/);
  assert.equal(store.dump().runs, 0);
  assert.equal(store.dump().accounts, 0);
});

test("live mode without the app secret skips", async () => {
  const result = await runMarketingSync({
    env: { MARKETING_SYNC_MODE: "live", META_ACCESS_TOKEN: "token", META_APP_ID: "app", META_AD_ACCOUNT_IDS: "act_111" },
    store: createMemoryStore(),
    now: NOW,
    timezone: TZ,
  });
  assert.equal(result.status, "skipped");
  assert.match(result.reason ?? "", /META_APP_SECRET/);
});

test("off mode skips even when credentials exist", async () => {
  const result = await runMarketingSync({
    env: {
      MARKETING_SYNC_MODE: "off",
      META_ACCESS_TOKEN: "token",
      META_APP_ID: "app",
      META_APP_SECRET: "secret",
      META_AD_ACCOUNT_IDS: "act_111",
    },
    store: createMemoryStore(),
    now: NOW,
    timezone: TZ,
  });
  assert.equal(result.status, "skipped");
});

test("mock sync is idempotent and refreshes the source pull", async () => {
  const store = createMemoryStore();
  const first = await runMarketingSync({ env: mockEnv(), store, now: NOW, timezone: TZ });
  const dump1 = store.dump();
  const second = await runMarketingSync({ env: mockEnv(), store, now: NOW, timezone: TZ });
  const dump2 = store.dump();
  assert.equal(first.status, "succeeded");
  assert.equal(first.mode, "mock");
  assert.equal(second.status, "succeeded");
  assert.equal(dump1.accounts, 1);
  assert.equal(dump2.accounts, 1);
  assert.equal(dump1.campaigns, 2);
  assert.equal(dump2.campaigns, 2);
  assert.equal(dump1.ads, 3);
  assert.equal(dump2.ads, 3);
  assert.equal(dump1.metrics, 9);
  assert.equal(dump2.metrics, 9);
  assert.equal(dump1.links, 3);
  assert.equal(dump2.links, 3);
  assert.equal(dump2.runs, 2);
  assert.equal(dump1.connections, 1);
  assert.deepEqual(dump1.metricSpend, dump2.metricSpend);
  assert.deepEqual(dump1.versionLabels, dump2.versionLabels);
  const labels = Object.values(dump2.versionLabels).sort();
  assert.deepEqual(labels, ["v1", "v1", "v2"]);
  const pulls1 = new Set(Object.values(dump1.metricPulls));
  const pulls2 = new Set(Object.values(dump2.metricPulls));
  assert.equal(pulls1.size, 1);
  assert.equal(pulls2.size, 1);
  assert.notEqual([...pulls1][0], [...pulls2][0]);
});

test("a later sync updates spend in place", async () => {
  const store = createMemoryStore();
  const snapshot = normalizeMetaBundle(mockMetaBundle(NOW, TZ), { attributionWindow: "7d_click_1d_view" });
  await runMarketingSync({ env: mockEnv(), store, now: NOW, timezone: TZ, snapshot });
  const changed = structuredClone(snapshot);
  const target = changed.metrics[0];
  assert.ok(target);
  target.spend = "99.0000";
  await runMarketingSync({ env: mockEnv(), store, now: NOW, timezone: TZ, snapshot: changed });
  const dump = store.dump();
  assert.equal(dump.metrics, snapshot.metrics.length);
  assert.equal(dump.metricSpend[`${target.adExternalId}|${target.date}`], "99.0000");
});

test("a different attribution window is a new row", async () => {
  const store = createMemoryStore();
  const snapshot = normalizeMetaBundle(mockMetaBundle(NOW, TZ), { attributionWindow: "7d_click_1d_view" });
  await runMarketingSync({ env: mockEnv(), store, now: NOW, timezone: TZ, snapshot });
  const other = structuredClone(snapshot);
  for (const metric of other.metrics) metric.attributionWindow = "1d_click";
  await runMarketingSync({ env: mockEnv(), store, now: NOW, timezone: TZ, snapshot: other });
  assert.equal(store.dump().metrics, snapshot.metrics.length * 2);
});

test("two accounts stay idempotent", async () => {
  const first = normalizeMetaBundle(mockMetaBundle(NOW, TZ), { attributionWindow: "7d_click_1d_view" });
  const raw = JSON.stringify(mockMetaBundle(NOW, TZ))
    .replaceAll("act_000000000000001", "act_000000000000002")
    .replaceAll("c_mock_", "c_two_")
    .replaceAll("as_mock_", "as_two_")
    .replaceAll("ad_mock_", "ad_two_")
    .replaceAll("cr_mock_", "cr_two_")
    .replaceAll("aud_mock_", "aud_two_");
  const snapshot = mergeSnapshots([first, normalizeMetaBundle(JSON.parse(raw), { attributionWindow: "7d_click_1d_view" })]);
  const store = createMemoryStore();
  await runMarketingSync({ env: mockEnv(), store, now: NOW, timezone: TZ, snapshot });
  const before = store.dump();
  await runMarketingSync({ env: mockEnv(), store, now: NOW, timezone: TZ, snapshot });
  const after = store.dump();
  assert.equal(before.accounts, 2);
  assert.equal(after.accounts, 2);
  assert.equal(before.metrics, 18);
  assert.equal(after.metrics, 18);
  assert.deepEqual(before.metricSpend, after.metricSpend);
});

test("an empty env list falls back to syncEnabled accounts and ignores others", async () => {
  const store = createMemoryStore();
  const seed = (externalId: string, syncEnabled: boolean): NormalizedAccount & { workspaceId: string; connectionId: string } => ({
    platform: "meta",
    externalId,
    name: externalId,
    currency: "USD",
    timezone: "America/New_York",
    status: "unknown",
    syncEnabled,
    workspaceId: "org",
    connectionId: "seed",
  });
  await store.upsertAccount(seed("act_222", true));
  await store.upsertAccount(seed("act_333", false));
  const urls: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    urls.push(url);
    const path = new URL(url).pathname;
    if (path.endsWith("/act_222")) {
      return Response.json({
        id: "act_222",
        name: "Stored account",
        currency: "USD",
        timezone_name: "America/New_York",
        account_status: 1,
      });
    }
    return Response.json({ data: [] });
  };
  const env = {
    MARKETING_SYNC_MODE: "live",
    META_ACCESS_TOKEN: "token-value",
    META_APP_ID: "app-id",
    META_APP_SECRET: "app-secret",
    META_AD_ACCOUNT_IDS: "",
  };
  const result = await runMarketingSync({ env, store, fetchImpl, now: NOW, timezone: TZ });
  assert.equal(result.status, "succeeded");
  assert.equal(result.accounts, 1);
  assert.ok(urls.some((url) => url.includes("/act_222")));
  assert.equal(urls.some((url) => url.includes("act_333")), false);
  assert.ok(urls.some((url) => url.includes("appsecret_proof=")));
  const again = await runMarketingSync({ env, store, fetchImpl, now: NOW, timezone: TZ });
  assert.equal(again.status, "succeeded");
  assert.equal(store.dump().accounts, 2);
});

test("the env allow-list is exclusive", async () => {
  const store = createMemoryStore();
  await store.upsertAccount({
    platform: "meta",
    externalId: "act_222",
    name: "Stored",
    currency: "USD",
    timezone: "UTC",
    status: "unknown",
    syncEnabled: true,
    workspaceId: "org",
    connectionId: "seed",
  });
  const urls: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    urls.push(String(url));
    const path = new URL(url).pathname;
    if (path.endsWith("/act_111")) {
      return Response.json({ id: "act_111", name: "Env account", currency: "USD", timezone_name: "UTC", account_status: 1 });
    }
    return Response.json({ data: [] });
  };
  const result = await runMarketingSync({
    env: {
      MARKETING_SYNC_MODE: "live",
      META_ACCESS_TOKEN: "token-value",
      META_APP_ID: "app-id",
      META_APP_SECRET: "app-secret",
      META_AD_ACCOUNT_IDS: "111",
    },
    store,
    fetchImpl,
    now: NOW,
    timezone: TZ,
  });
  assert.equal(result.status, "succeeded");
  assert.ok(urls.some((url) => url.includes("/act_111")));
  assert.equal(urls.some((url) => url.includes("act_222")), false);
});

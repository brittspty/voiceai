import assert from "node:assert/strict";
import test from "node:test";
import { conceptKey, creativeFingerprint, landingPath, nextVersionLabel } from "./creative";
import {
  attributionWindowLabel,
  decideSync,
  graphVersion,
  parseAdAccountIds,
  resolveAccountIds,
  routeMetaAccounts,
} from "./config";
import { appSecretProof, graphGet, graphList, type FetchLike } from "./connectors/meta-client";
import { mockMetaBundle } from "./connectors/fixtures";
import {
  mapBudget,
  mapMetaAccountStatus,
  mapMetaObjective,
  mapMetaStatus,
  mapPlatformLeads,
  mergeSnapshots,
  normalizeMetaBundle,
} from "./connectors/meta-map";
import { minorToMajor } from "./money";
import { createHmac } from "node:crypto";

const NOW = new Date("2026-10-07T15:00:00.000Z");

test("does not invent an ad account when the env list is empty", () => {
  assert.deepEqual(parseAdAccountIds(undefined), []);
  assert.deepEqual(parseAdAccountIds(""), []);
  assert.deepEqual(parseAdAccountIds("  ,  "), []);
  assert.deepEqual(decideSync({}).action, "skip");
  const live = decideSync({
    MARKETING_SYNC_MODE: "live",
    META_ACCESS_TOKEN: "token",
    META_APP_ID: "app",
    META_APP_SECRET: "secret",
  });
  assert.equal(live.action, "live");
  if (live.action === "live") {
    assert.deepEqual(live.accountIds, []);
    assert.equal(live.connections.length, 1);
    assert.equal(live.connections[0]?.name, "primary");
    assert.equal(live.connections[0]?.accessToken, "token");
    assert.equal(live.connections[0]?.tokenEnv, "META_ACCESS_TOKEN");
    assert.deepEqual(live.skipped, []);
  }
});

test("parses a comma-separated ad account allow-list", () => {
  assert.deepEqual(parseAdAccountIds("111, act_222, 111, not-an-id"), ["act_111", "act_222"]);
  assert.deepEqual(resolveAccountIds(["act_111"], ["act_999"]), ["act_111"]);
  assert.deepEqual(resolveAccountIds([], ["act_999", "999"]), ["act_999"]);
});

test("maps Meta objectives, statuses, and minor-unit budgets", () => {
  assert.equal(mapMetaObjective("OUTCOME_LEADS"), "leads");
  assert.equal(mapMetaObjective("LINK_CLICKS"), "traffic");
  assert.equal(mapMetaObjective("OUTCOME_SALES"), "conversions");
  assert.equal(mapMetaObjective("OUTCOME_AWARENESS"), "awareness");
  assert.equal(mapMetaObjective("SOMETHING_NEW"), "other");
  assert.equal(mapMetaStatus("ACTIVE"), "active");
  assert.equal(mapMetaStatus("CAMPAIGN_PAUSED"), "paused");
  assert.equal(mapMetaStatus("ARCHIVED"), "archived");
  assert.equal(mapMetaAccountStatus(1), "active");
  assert.equal(mapMetaAccountStatus(101), "deleted");
  assert.equal(mapMetaAccountStatus(3), "paused");
  assert.deepEqual(mapBudget({ daily_budget: "5000" }, "USD"), { budgetType: "daily", budgetAmount: "50.0000" });
  assert.deepEqual(mapBudget({ lifetime_budget: "25000" }, "USD"), { budgetType: "lifetime", budgetAmount: "250.0000" });
  assert.equal(minorToMajor("150", "JPY"), "150.0000");
  assert.equal(minorToMajor("1234", "KWD"), "1.2340");
  assert.equal(minorToMajor("", "USD"), null);
});

test("lead actions use the max overlapping bucket", () => {
  const leads = mapPlatformLeads([
    { action_type: "lead", value: "4" },
    { action_type: "onsite_conversion.lead_grouped", value: "4" },
    { action_type: "link_click", value: "20" },
  ]);
  assert.equal(leads, "4.0000");
});

test("fingerprint ignores the query string and changes when copy changes", () => {
  const base = {
    headline: "Storm damage",
    body: "Call today",
    description: "Roof",
    cta: "LEARN_MORE",
    mediaRef: "hash_a",
    landingUrl: "https://example.com/mock/offer?utm_source=facebook",
  };
  assert.equal(creativeFingerprint(base), creativeFingerprint({ ...base, landingUrl: "https://example.com/mock/offer?utm_campaign=x" }));
  assert.notEqual(creativeFingerprint(base), creativeFingerprint({ ...base, headline: "See the photos" }));
  assert.equal(landingPath("https://example.com/mock/offer?utm_source=facebook"), "/mock/offer");
  assert.equal(conceptKey("MOCK Roof storm v2", "hash", "abc"), conceptKey("MOCK Roof storm", "hash", "abc"));
  assert.equal(nextVersionLabel(["v1", "v2", "draft"]), "v3");
});

test("normalizes the mock bundle into canonical rows", () => {
  const snapshot = normalizeMetaBundle(mockMetaBundle(NOW, "America/New_York"), { attributionWindow: "7d_click_1d_view" });
  assert.equal(snapshot.accounts.length, 1);
  assert.equal(snapshot.accounts[0]?.externalId, "act_000000000000001");
  assert.equal(snapshot.accounts[0]?.name.startsWith("MOCK"), true);
  assert.equal(snapshot.campaigns.length, 2);
  assert.equal(snapshot.campaigns.find((row) => row.externalId === "c_mock_leads")?.objective, "leads");
  assert.equal(snapshot.campaigns.find((row) => row.externalId === "c_mock_leads")?.budgetAmount, "50.0000");
  assert.equal(snapshot.adGroups.length, 2);
  assert.equal(snapshot.ads.length, 3);
  assert.equal(snapshot.creatives.length, 3);
  const roof = snapshot.creatives.filter((row) => row.conceptKey === "name:mock roof storm");
  assert.equal(roof.length, 2);
  assert.equal(new Set(roof.map((row) => row.fingerprint)).size, 2);
  assert.equal(snapshot.audiences.length, 3);
  assert.equal(snapshot.adGroupAudiences.length, 3);
  assert.equal(snapshot.metrics.length, 9);
  assert.equal(snapshot.metrics[0]?.attributionWindow, "7d_click_1d_view");
  assert.equal(snapshot.metrics.every((row) => row.platformLeads === row.platformLeads), true);
  assert.ok(snapshot.metrics.some((row) => row.videoViews3s !== null));
  assert.equal(graphVersion({}), "v23.0");
  assert.equal(attributionWindowLabel(["7d_click", "1d_view"]), "7d_click_1d_view");
});

test("keeps two ad accounts distinct", () => {
  const first = normalizeMetaBundle(mockMetaBundle(NOW), { attributionWindow: "7d_click_1d_view" });
  const raw = JSON.stringify(mockMetaBundle(NOW))
    .replaceAll("act_000000000000001", "act_000000000000002")
    .replaceAll("c_mock_", "c_two_")
    .replaceAll("as_mock_", "as_two_")
    .replaceAll("ad_mock_", "ad_two_")
    .replaceAll("cr_mock_", "cr_two_")
    .replaceAll("aud_mock_", "aud_two_");
  const second = normalizeMetaBundle(JSON.parse(raw), { attributionWindow: "7d_click_1d_view" });
  const merged = mergeSnapshots([first, second]);
  assert.equal(merged.accounts.length, 2);
  assert.equal(merged.campaigns.length, 4);
  assert.equal(merged.metrics.length, 18);
});

test("skips insights that do not match an ad", () => {
  const bundle = mockMetaBundle(NOW);
  bundle.insights.push({ ad_id: "missing", date_start: "2026-10-07", spend: "1" });
  const snapshot = normalizeMetaBundle(bundle, { attributionWindow: "7d_click_1d_view" });
  assert.equal(snapshot.metrics.length, 9);
  assert.ok(snapshot.warnings.some((warning) => warning.includes("missing")));
});

test("pages a Graph list and redacts the token from errors", async () => {
  const token = "super-secret-token";
  let calls = 0;
  const fetchImpl: FetchLike = async (url) => {
    calls += 1;
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("access_token"), token);
    assert.equal(parsed.searchParams.get("appsecret_proof")?.length, 64);
    if (!parsed.searchParams.get("after")) {
      return Response.json({
        data: [{ id: "c1" }],
        paging: { next: `https://graph.facebook.com/next?access_token=${token}`, cursors: { after: "cursor-1" } },
      });
    }
    return Response.json({ data: [{ id: "c2" }] });
  };
  const rows = await graphList({
    version: "v23.0",
    path: "act_1/campaigns",
    token,
    appSecret: "app-secret-value",
    fetchImpl,
  });
  assert.equal(rows.length, 2);
  assert.equal(calls, 2);

  const failing: FetchLike = async () => new Response(JSON.stringify({ error: { message: `bad ${token}` } }), { status: 400 });
  await assert.rejects(
    () => graphGet({ version: "v23.0", path: "act_1", token, appSecret: "app-secret-value", fetchImpl: failing }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message.includes(token), false);
      assert.match(error.message, /\[redacted\]/);
      return true;
    },
  );
});

test("appsecret_proof is the hmac of the token", () => {
  const proof = appSecretProof("token-value", "secret-value");
  assert.equal(proof, createHmac("sha256", "secret-value").update("token-value").digest("hex"));
});

function metaEnv(extra: Record<string, string> = {}) {
  return {
    MARKETING_SYNC_MODE: "live",
    META_ACCESS_TOKEN: "primary-token",
    META_APP_ID: "primary-app",
    META_APP_SECRET: "primary-secret",
    META_AD_ACCOUNT_IDS: "act_111",
    ...extra,
  };
}

test("two Meta connections keep disjoint accounts on their own tokens", () => {
  const decision = decideSync(
    metaEnv({
      META_EXTRA_CONNECTIONS: "befound",
      META_BEFOUND_ACCESS_TOKEN: "befound-token",
      META_BEFOUND_APP_ID: "befound-app",
      META_BEFOUND_APP_SECRET: "befound-secret",
      META_BEFOUND_AD_ACCOUNT_IDS: "2897217887308756",
    }),
  );
  assert.equal(decision.action, "live");
  if (decision.action !== "live") return;
  assert.equal(decision.accessToken, "primary-token");
  assert.deepEqual(decision.accountIds, ["act_111"]);
  assert.deepEqual(
    decision.connections.map((connection) => ({
      name: connection.name,
      tokenEnv: connection.tokenEnv,
      accessToken: connection.accessToken,
      accountIds: connection.accountIds,
    })),
    [
      { name: "primary", tokenEnv: "META_ACCESS_TOKEN", accessToken: "primary-token", accountIds: ["act_111"] },
      {
        name: "befound",
        tokenEnv: "META_BEFOUND_ACCESS_TOKEN",
        accessToken: "befound-token",
        accountIds: ["act_2897217887308756"],
      },
    ],
  );
  const routed = routeMetaAccounts(decision);
  assert.equal(routed.ok, true);
  if (!routed.ok) return;
  assert.deepEqual(
    routed.pulls.map((pull) => ({ name: pull.name, accessToken: pull.accessToken, accountIds: pull.accountIds })),
    [
      { name: "primary", accessToken: "primary-token", accountIds: ["act_111"] },
      { name: "befound", accessToken: "befound-token", accountIds: ["act_2897217887308756"] },
    ],
  );
  const oneAccount = routeMetaAccounts(decision, { accounts: ["act_2897217887308756"] });
  assert.equal(oneAccount.ok, true);
  if (!oneAccount.ok) return;
  assert.equal(oneAccount.pulls.length, 1);
  assert.equal(oneAccount.pulls[0]?.accessToken, "befound-token");
  const named = routeMetaAccounts(decision, { connection: "befound" });
  assert.equal(named.ok, true);
  if (!named.ok) return;
  assert.deepEqual(named.pulls[0]?.accountIds, ["act_2897217887308756"]);
  assert.equal(named.pulls[0]?.accessToken, "befound-token");
  const unlisted = routeMetaAccounts(decision, { accounts: ["act_999"] });
  assert.equal(unlisted.ok, false);
});

test("a missing extra Meta connection does not drop the primary token", () => {
  const decision = decideSync(
    metaEnv({
      META_EXTRA_CONNECTIONS: "befound, befound, not a name",
      META_BEFOUND_ACCESS_TOKEN: "befound-token",
    }),
  );
  assert.equal(decision.action, "live");
  if (decision.action !== "live") return;
  assert.equal(decision.connections.length, 1);
  assert.equal(decision.connections[0]?.accessToken, "primary-token");
  assert.deepEqual(decision.connections[0]?.accountIds, ["act_111"]);
  const befound = decision.skipped.find((row) => row.name === "befound");
  assert.match(befound?.reason ?? "", /META_BEFOUND_APP_ID/);
  assert.match(befound?.reason ?? "", /META_BEFOUND_APP_SECRET/);
  assert.equal(decision.skipped.some((row) => row.reason.includes("not a name")), true);
  assert.equal(JSON.stringify(decision.skipped).includes("befound-token"), false);
  assert.equal(JSON.stringify(decision.skipped).includes("primary-token"), false);
  const routed = routeMetaAccounts(decision);
  assert.equal(routed.ok, true);
  if (!routed.ok) return;
  assert.deepEqual(routed.pulls.map((pull) => pull.accessToken), ["primary-token"]);
});

test("an extra Meta connection with no account ids is skipped", () => {
  const decision = decideSync(
    metaEnv({
      META_EXTRA_CONNECTIONS: "befound",
      META_BEFOUND_ACCESS_TOKEN: "befound-token",
      META_BEFOUND_APP_ID: "befound-app",
      META_BEFOUND_APP_SECRET: "befound-secret",
      META_BEFOUND_AD_ACCOUNT_IDS: "not-an-account",
    }),
  );
  assert.equal(decision.action, "live");
  if (decision.action !== "live") return;
  assert.equal(decision.connections.length, 1);
  assert.match(decision.skipped.find((row) => row.name === "befound")?.reason ?? "", /META_BEFOUND_AD_ACCOUNT_IDS/);
});

test("an account listed twice is read with the earlier Meta connection", () => {
  const decision = decideSync(
    metaEnv({
      META_AD_ACCOUNT_IDS: "act_111, act_222",
      META_EXTRA_CONNECTIONS: "befound",
      META_BEFOUND_ACCESS_TOKEN: "befound-token",
      META_BEFOUND_APP_ID: "befound-app",
      META_BEFOUND_APP_SECRET: "befound-secret",
      META_BEFOUND_AD_ACCOUNT_IDS: "act_222, act_333",
    }),
  );
  const routed = routeMetaAccounts(decision);
  assert.equal(routed.ok, true);
  if (!routed.ok) return;
  assert.deepEqual(routed.pulls[0]?.accountIds, ["act_111", "act_222"]);
  assert.equal(routed.pulls[0]?.accessToken, "primary-token");
  assert.deepEqual(routed.pulls[1]?.accountIds, ["act_333"]);
  assert.equal(routed.pulls[1]?.accessToken, "befound-token");
  assert.match(routed.warnings.join(" "), /act_222/);
});

test("stored accounts owned by an extra connection stay off the primary token", () => {
  const decision = decideSync(
    metaEnv({
      META_AD_ACCOUNT_IDS: "",
      META_EXTRA_CONNECTIONS: "befound",
      META_BEFOUND_ACCESS_TOKEN: "befound-token",
      META_BEFOUND_APP_ID: "befound-app",
      META_BEFOUND_APP_SECRET: "befound-secret",
      META_BEFOUND_AD_ACCOUNT_IDS: "act_333",
    }),
  );
  const routed = routeMetaAccounts(decision, { dbEnabledIds: ["act_111", "act_333", "act_444"] });
  assert.equal(routed.ok, true);
  if (!routed.ok) return;
  assert.deepEqual(routed.pulls[0]?.accountIds, ["act_111", "act_444"]);
  assert.equal(routed.pulls[0]?.accessToken, "primary-token");
  assert.deepEqual(routed.pulls[1]?.accountIds, ["act_333"]);
  assert.equal(routed.pulls[1]?.accessToken, "befound-token");
});

test("a ready extra Meta connection still syncs when the primary credentials are missing", () => {
  const decision = decideSync({
    MARKETING_SYNC_MODE: "live",
    META_ACCESS_TOKEN: "primary-token",
    META_APP_ID: "primary-app",
    META_EXTRA_CONNECTIONS: "BeFound",
    META_BEFOUND_ACCESS_TOKEN: "befound-token",
    META_BEFOUND_APP_ID: "befound-app",
    META_BEFOUND_APP_SECRET: "befound-secret",
    META_BEFOUND_AD_ACCOUNT_IDS: "act_2897217887308756",
  });
  assert.equal(decision.action, "live");
  if (decision.action !== "live") return;
  assert.equal(decision.connections.length, 1);
  assert.equal(decision.connections[0]?.name, "befound");
  assert.equal(decision.accessToken, "befound-token");
  assert.deepEqual(decision.accountIds, ["act_2897217887308756"]);
  assert.match(decision.skipped.find((row) => row.name === "primary")?.reason ?? "", /META_APP_SECRET/);
  assert.equal(JSON.stringify(decision.skipped).includes("primary-token"), false);
});

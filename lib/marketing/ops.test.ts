import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import type { FetchLike } from "./connectors/meta-client";
import {
  FULL_SYNC_INTERVAL_MS,
  INTRADAY_SYNC_INTERVAL_MS,
  clientLinksEnabled,
  dashboardsV2Enabled,
  digestDeliveryEnabled,
  googleAdsEnabled,
  digestEnabled,
  intradaySyncEnabled,
  marketingSyncIntervalMs,
  monitorEnabled,
} from "./config";
import { accessFromUser, canEditCampaignBudget, plannedSuperAdmins, superAdminEmails } from "./access";
import { setCampaignBudget } from "./budget";
import { buildClientShare, clientShareCsv, clientShareHasMoney, clientShareText, forbiddenClientKeys } from "./client-view";
import { batchApproveAllowed, budgetCardCopy, budgetCopyIsClean } from "./decision-ui";
import { compareClients } from "./compare";
import { skillIsSafe, OFFERED_SKILL } from "./skills";
import { platformBrand } from "../brand";
import { buildManagerDigest, digestDeliveryPlan } from "./digest";
import { evaluateAds, type MetricPoint } from "./monitor";
import { decideRecommendation, verifyRecommendation } from "./recommendations";
import { clientViewEvent, hashShareToken, newShareToken, shareLinkState } from "./share-link";
import { createMemoryStore } from "./store";
import { runMarketingSync } from "./sync";

const NOW = new Date("2026-10-07T15:00:00.000Z");
const TZ = "America/New_York";
const ROOT = path.resolve(import.meta.dirname, "../..");

function point(overrides: Partial<MetricPoint> & Pick<MetricPoint, "id" | "adId" | "date">): MetricPoint {
  return {
    adName: "Ad",
    adGroupId: "ag1",
    campaignId: "c1",
    adAccountId: "a1",
    objective: "leads",
    ingestedAt: NOW.toISOString(),
    spend: 10,
    impressions: 2000,
    clicks: 40,
    linkClicks: 30,
    reach: 1000,
    leads: 2,
    conversions: 2,
    conversionValue: 20,
    ...overrides,
  };
}

test("feature flags default off and the sync interval stays at 6 hours", () => {
  assert.equal(intradaySyncEnabled({}), false);
  assert.equal(monitorEnabled({}), false);
  assert.equal(digestEnabled({}), false);
  assert.equal(digestDeliveryEnabled({}), false);
  assert.equal(clientLinksEnabled({}), false);
  assert.equal(dashboardsV2Enabled({}), false);
  assert.equal(googleAdsEnabled({}), false);
  assert.equal(marketingSyncIntervalMs({}), FULL_SYNC_INTERVAL_MS);
  assert.equal(marketingSyncIntervalMs({ MARKETING_INTRADAY_SYNC: "on" }), INTRADAY_SYNC_INTERVAL_MS);
  assert.equal(marketingSyncIntervalMs({ MARKETING_INTRADAY_SYNC: "on", MARKETING_SYNC_INTERVAL_MS: "120000" }), 120000);
});

test("a running sync is skipped and a stale one is allowed to continue", async () => {
  const store = createMemoryStore();
  const claimed = await store.startRun({
    workspaceId: "org",
    connectionId: "c",
    platform: "meta",
    kind: "full",
    mode: "mock",
    windowStart: "2026-10-01",
    windowEnd: "2026-10-07",
    requestedAccounts: [],
  });
  const skipped = await runMarketingSync({ env: { MARKETING_SYNC_MODE: "mock" }, store, now: NOW, timezone: TZ });
  assert.equal(skipped.status, "skipped");
  assert.match(skipped.reason ?? "", /still running/);
  store.setRunStartedAt(claimed.id, new Date(NOW.getTime() - 21 * 60 * 1000));
  const continued = await runMarketingSync({ env: { MARKETING_SYNC_MODE: "mock" }, store, now: NOW, timezone: TZ });
  assert.equal(continued.status, "succeeded");
  assert.equal(continued.cadence, "full");
});

test("intraday sync is today and yesterday insights only after a full run today", async () => {
  const store = createMemoryStore();
  const env = { MARKETING_SYNC_MODE: "mock", MARKETING_INTRADAY_SYNC: "on" };
  const first = await runMarketingSync({ env, store, now: NOW, timezone: TZ });
  assert.equal(first.cadence, "full");
  const second = await runMarketingSync({ env, store, now: NOW, timezone: TZ });
  assert.equal(second.cadence, "intraday");
  assert.equal(second.since, "2026-10-06");
  assert.equal(second.until, "2026-10-07");
  assert.equal(store.dump().metrics, 9);

  const urls: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    urls.push(String(url));
    const pathName = new URL(url).pathname;
    if (pathName.endsWith("/act_111")) {
      return Response.json({ id: "act_111", name: "Env", currency: "USD", timezone_name: "America/New_York", account_status: 1 });
    }
    return Response.json({ data: [] });
  };
  const live = {
    MARKETING_SYNC_MODE: "live",
    MARKETING_INTRADAY_SYNC: "on",
    META_ACCESS_TOKEN: "token-value",
    META_APP_ID: "app-id",
    META_APP_SECRET: "app-secret",
    META_AD_ACCOUNT_IDS: "act_111",
  };
  await runMarketingSync({ env: { ...live, MARKETING_INTRADAY_SYNC: "off" }, store: createMemoryStore(), fetchImpl, now: NOW, timezone: TZ });
  urls.length = 0;
  const seeded = createMemoryStore();
  await runMarketingSync({ env: { ...live, MARKETING_INTRADAY_SYNC: "off" }, store: seeded, fetchImpl: async () => Response.json({ data: [] }), now: NOW, timezone: TZ });
  const intraday = await runMarketingSync({ env: live, store: seeded, fetchImpl, now: NOW, timezone: TZ });
  assert.equal(intraday.cadence, "intraday");
  assert.equal(urls.some((url) => url.includes("/campaigns")), false);
  assert.equal(urls.some((url) => url.includes("/adsets")), false);
  assert.ok(urls.some((url) => url.includes("/insights")));
  assert.equal(readFileSync(path.join(ROOT, "lib/marketing/sync.ts"), "utf8").includes("ads_management"), false);
});

test("monitor flags weak ads and bad traffic within 30 minutes of landing", () => {
  const rows = [
    point({ id: "new", adId: "ad-weak", date: "2026-10-07", impressions: 8000, clicks: 40, spend: 200, leads: 1, conversions: 1 }),
    point({ id: "base", adId: "ad-other", date: "2026-10-01", impressions: 8000, clicks: 400, spend: 80, leads: 8, conversions: 8, ingestedAt: "2026-10-01T12:00:00.000Z" }),
  ];
  const fresh = evaluateAds({
    rows,
    hours: [
      { adId: "ad-weak", hour: 2, clicks: 30, impressions: 40, conversions: 0 },
      { adId: "ad-weak", hour: 14, clicks: 10, impressions: 20, conversions: 1 },
    ],
    budgets: [{ campaignId: "c1", amount: 100, period: "daily", currency: "USD" }],
    now: NOW,
    today: "2026-10-07",
    yesterday: "2026-10-06",
    baselineDays: 7,
    alertMinImpressions: 200,
    benchmarks: { leads: { ctr: 0.02 } },
  });
  assert.ok(fresh.alerts.some((alert) => alert.code === "ctr_off"));
  assert.ok(fresh.alerts.some((alert) => alert.code === "odd_hours"));
  assert.ok(fresh.drafts.some((draft) => draft.type === "budget_change"));
  assert.ok(fresh.drafts.some((draft) => draft.type === "roi" && draft.proposedBudgetAmount === null));
  const landed = Date.parse(fresh.alerts[0]?.dataLandedAt ?? "");
  assert.ok(NOW.getTime() - landed <= 30 * 60 * 1000);

  const stale = evaluateAds({
    rows: [point({ id: "old", adId: "ad-weak", date: "2026-10-07", ingestedAt: new Date(NOW.getTime() - 31 * 60 * 1000).toISOString() })],
    now: NOW,
    today: "2026-10-07",
    yesterday: "2026-10-06",
    baselineDays: 7,
    alertMinImpressions: 200,
    benchmarks: {},
  });
  assert.equal(stale.alerts.length, 0);
});

test("suggestions stay draft until a second check confirms the sample", () => {
  const draft = evaluateAds({
    rows: [
      point({ id: "new", adId: "ad-weak", date: "2026-10-07", impressions: 8000, clicks: 40, spend: 200, leads: 1, conversions: 1 }),
      point({ id: "base", adId: "ad-other", date: "2026-10-01", impressions: 8000, clicks: 400, spend: 80, leads: 8, conversions: 8 }),
    ],
    budgets: [{ campaignId: "c1", amount: 100, period: "daily", currency: "USD" }],
    now: NOW,
    today: "2026-10-07",
    yesterday: "2026-10-06",
    baselineDays: 7,
    alertMinImpressions: 200,
    benchmarks: {},
  }).drafts.find((item) => item.metric === "ctr");
  assert.ok(draft);
  const confirmed = verifyRecommendation(draft, [
    point({ id: "new", adId: "ad-weak", date: "2026-10-07", impressions: 8000, clicks: 40, spend: 200 }),
    point({ id: "base", adId: "ad-other", date: "2026-10-01", impressions: 8000, clicks: 400, spend: 80 }),
  ], { minImpressions: 1000, minClicks: 20, today: "2026-10-07", yesterday: "2026-10-06" });
  assert.equal(confirmed.status, "verified");
  const small = verifyRecommendation(draft, [
    point({ id: "new", adId: "ad-weak", date: "2026-10-07", impressions: 100, clicks: 2, spend: 5 }),
  ], { minImpressions: 1000, minClicks: 20, today: "2026-10-07", yesterday: "2026-10-06" });
  assert.equal(small.status, "draft");
  const recovered = verifyRecommendation(draft, [
    point({ id: "new", adId: "ad-weak", date: "2026-10-07", impressions: 8000, clicks: 400, spend: 40 }),
  ], { minImpressions: 1000, minClicks: 20, today: "2026-10-07", yesterday: "2026-10-06" });
  assert.equal(recovered.status, "draft");
});

test("only a human can write a budget, and accepting a suggestion does not call an ad platform", async () => {
  const writes: string[] = [];
  const store = { write: async () => { writes.push("write"); } };
  const input = { campaignId: "c1", adAccountId: "a1", amount: "40", period: "daily" as const, currency: "USD", source: "human_edit" as const };
  for (const kind of ["worker", "monitor", "bot", "sync"]) {
    await assert.rejects(() => setCampaignBudget({ kind }, input, store), /person/);
  }
  assert.equal(writes.length, 0);
  const manager = accessFromUser(
    { id: "u1", email: "sam@example.com", role: "account_manager" },
    [{ workspaceId: "org", scopeKind: "campaign", adAccountId: "a1", campaignId: "c1" }],
  );
  assert.equal(canEditCampaignBudget(manager, { adAccountId: "a1", campaignId: "c1" }), true);
  assert.equal(canEditCampaignBudget(manager, { adAccountId: "a1", campaignId: "c2" }), false);
  await setCampaignBudget({ kind: "human", access: manager }, input, store);
  assert.equal(writes.length, 1);

  const budgetDraft = {
    id: "rec1",
    type: "budget_change",
    status: "verified",
    campaignId: "c1",
    adAccountId: "a1",
    proposedBudgetAmount: "80.0000",
    proposedBudgetPeriod: "daily" as const,
    proposedCurrency: "USD",
  };
  await assert.rejects(() => decideRecommendation({ actor: { kind: "worker" }, recommendation: budgetDraft, decision: "accept", budgetStore: store }), /person/);
  assert.equal(writes.length, 1);
  const accepted = await decideRecommendation({ actor: { kind: "human", access: manager }, recommendation: budgetDraft, decision: "accept", budgetStore: store });
  assert.equal(accepted.status, "accepted");
  assert.equal(writes.length, 1);
  const declined = await decideRecommendation({
    actor: { kind: "human", access: manager },
    recommendation: budgetDraft,
    decision: "decline",
    budgetStore: store,
  });
  assert.equal(declined.status, "declined");
  assert.equal(writes.length, 1);
  const copy = budgetCardCopy({
    id: "rec1",
    type: "budget_change",
    status: "verified",
    title: "Recommended budget",
    summary: "It ran out early.",
    rationale: "",
    metric: "budget",
    baseline: "100",
    observed: "80",
    windowStart: "2026-10-01",
    windowEnd: "2026-10-07",
    sampleSize: 2000,
    sourceCount: 4,
    currentBudgetAmount: 150,
    proposedBudgetAmount: 200,
    proposedCurrency: "USD",
    proposedBudgetPeriod: "daily",
  });
  assert.equal(budgetCopyIsClean(copy.fixed), true);
  assert.match(copy.fixed, /will not change this budget/);
  assert.equal(batchApproveAllowed([{ type: "budget_change", tier: "am" }]).ok, false);
  assert.equal(batchApproveAllowed([{ type: "pause", tier: "am" }, { type: "swap", tier: "am" }]).ok, false);

  const banned = ["worker/index.ts", "lib/marketing/sync.ts", "lib/marketing/monitor.ts", "lib/marketing/persist.ts", "lib/marketing/apply.ts", "lib/marketing/connectors/meta.ts", "lib/dialer.ts"];
  for (const file of banned) {
    const text = readFileSync(path.join(ROOT, file), "utf8");
    assert.equal(text.includes("setCampaignBudget"), false, file);
    assert.equal(text.includes("budgetSetById"), false, file);
  }
  const prismaStore = readFileSync(path.join(ROOT, "lib/marketing/prisma-store.ts"), "utf8");
  assert.equal(/^\s+budgetAmount:/m.test(prismaStore), false);
  assert.equal(prismaStore.includes("budgetSetById"), false);
  const schema = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
  assert.equal(schema.includes("budget_update"), false);
  assert.match(schema, /enum JobType \{[^}]*dial/);
});

test("client responses and exports have no cost fields", () => {
  const response = buildClientShare({
    client: "Bayou Home Services",
    adViews: 48200,
    leads: 214,
    booked: 70,
    campaigns: [{ name: "Leak Repair", channel: "Meta", leads: 120, booked: 41 }],
    sharedBy: "Dana R.",
    expires: "expires 2026-11-28",
  });
  assert.deepEqual(forbiddenClientKeys(response), []);
  assert.equal(forbiddenClientKeys({ leadValueCents: 8500, callValueCents: 14000, externalId: "act_1" }).length >= 3, true);
  assert.equal(clientShareHasMoney(response), false);
  assert.equal(JSON.stringify(response).includes("\"spend\""), false);
  const csv = clientShareCsv(response);
  assert.equal(/spend|budget|cpc|cpm|cpa|roas|cost|\$/.test(csv), false);
  assert.match(csv, /Booked calls/);
  assert.equal(response.viewOnly, true);
  assert.equal("alerts" in response, false);
  assert.match(clientShareText(response), /People who booked a call/);
  const brand = platformBrand();
  assert.equal(brand.brandColor, "#FF5800");
  assert.equal(brand.logoUrl, "/brand/specificity-mark.png");
  assert.equal(skillIsSafe(OFFERED_SKILL), true);
  assert.equal(skillIsSafe({ ...OFFERED_SKILL, can: ["Change budgets"] }), false);
  const compared = compareClients({
    clients: [
      { name: "Acme", manager: "Dana", spend: 4980, booked: 31 },
      { name: "Bayou", manager: "Dana", spend: 2870, booked: 70 },
    ],
  });
  assert.equal(compared.rows.find((row) => row.name === "Acme")?.flag, "Outlier");
  assert.equal(compared.rows.find((row) => row.name === "Bayou")?.flag, "");
});

test("share links are hashed, revocable, and off by default", () => {
  const minted = newShareToken();
  assert.ok(minted.token.length >= 43);
  assert.equal(minted.tokenHash, hashShareToken(minted.token));
  assert.notEqual(minted.tokenHash, minted.token);
  const link = {
    id: "link",
    workspaceId: "org",
    tokenHash: minted.tokenHash,
    label: "October",
    createdById: "u1",
    expiresAt: null,
    revokedAt: null,
  };
  assert.equal(shareLinkState(link, NOW, {}), "disabled");
  assert.equal(shareLinkState(link, NOW, { MARKETING_CLIENT_LINKS: "on" }), "ok");
  assert.equal(shareLinkState({ ...link, revokedAt: NOW }, NOW, { MARKETING_CLIENT_LINKS: "on" }), "revoked");
  assert.equal(shareLinkState({ ...link, expiresAt: new Date(NOW.getTime() - 1000) }, NOW, { MARKETING_CLIENT_LINKS: "on" }), "expired");
  const event = clientViewEvent({ workspaceId: "org", shareLinkId: "link", page: "/share", ip: "203.0.113.4", userAgent: "Test" });
  assert.equal(event.ip, "203.0.113.4");
  assert.equal(event.viewerUserId, null);
});

test("digests are stored and never sent", () => {
  assert.equal(digestDeliveryPlan({}).send, false);
  assert.equal(digestDeliveryPlan({ MARKETING_DIGEST: "on", MARKETING_DIGEST_DELIVERY: "on" }).send, false);
  assert.equal(buildManagerDigest({ userId: "u", accountIds: ["a1"], alerts: [], recommendations: [], periodStart: NOW, periodEnd: NOW, env: { MARKETING_DIGEST: "on" } }), null);
  const digest = buildManagerDigest({
    userId: "u",
    accountIds: ["a1"],
    alerts: [{ id: "1", title: "Clicks look weak", summary: "Compared with similar ads.", accountId: "a1" }],
    recommendations: [{ id: "2", title: "Keep the budget", summary: "Stay inside the daily budget.", accountId: "a2" }],
    periodStart: NOW,
    periodEnd: NOW,
    env: { MARKETING_DIGEST: "on" },
  });
  assert.equal(digest?.delivery, "not_sent");
  assert.equal(digest?.payload.alerts.length, 1);
  assert.equal(digest?.payload.recommendations.length, 0);
  const text = readFileSync(path.join(ROOT, "lib/marketing/digest.ts"), "utf8");
  assert.equal(text.includes("nodemailer"), false);
  assert.equal(text.includes("fetch("), false);
});

test("super admins are the placeholder names and can be replaced by email", () => {
  const people = plannedSuperAdmins({});
  assert.deepEqual(people.map((person) => person.name), ["Jason", "Brittany", "Chris"]);
  const custom = superAdminEmails({ MARKETING_SUPER_ADMIN_EMAILS: "A@Example.com, B@Example.com" });
  assert.deepEqual(custom, ["a@example.com", "b@example.com"]);
  const admin = accessFromUser({ id: "1", email: "a@example.com", role: "viewer" }, [], { MARKETING_SUPER_ADMIN_EMAILS: "a@example.com" });
  assert.equal(admin.kind, "super_admin");
  assert.equal(admin.canEditBudget, true);
  const viewer = accessFromUser({ id: "2", email: "c@example.com", role: "client_viewer" }, [{ workspaceId: "org", scopeKind: "client", adAccountId: null, campaignId: null }]);
  assert.equal(viewer.kind, "client_viewer");
  assert.equal(viewer.seesCost, false);
  assert.equal(viewer.seesAlerts, false);
  const two = accessFromUser(
    { id: "3", email: "c@example.com", role: "client_viewer" },
    [
      { workspaceId: "org", scopeKind: "client", adAccountId: null, campaignId: null },
      { workspaceId: "other", scopeKind: "client", adAccountId: null, campaignId: null },
    ],
  );
  assert.equal(two.kind, "none");
});

test("components do not hard-code colors", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (entry === "node_modules" || entry === ".next") continue;
      const info = statSync(full);
      if (info.isDirectory()) walk(full);
      else if (full.endsWith(".tsx")) files.push(full);
    }
  };
  walk(path.join(ROOT, "app"));
  walk(path.join(ROOT, "components"));
  const hex = /#[0-9a-fA-F]{3,8}/;
  for (const file of files) {
    assert.equal(hex.test(readFileSync(file, "utf8")), false, file);
  }
  assert.equal(hex.test(readFileSync(path.join(ROOT, "app/globals.css"), "utf8")), false);
});

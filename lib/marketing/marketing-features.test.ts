import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { accessFromUser } from "./access";
import { adLibraryCountries, competitorWatchEnabled, holdoutsEnabled, searchWasteEnabled } from "./config";
import { AD_LIBRARY_FIELDS, adLibraryUrl, competitorCopyIsPublic, fetchAdLibraryAds, mapAdLibraryAds } from "./connectors/ad-library";
import { MAX_COMPETITORS, cleanCompetitorInput, competitorAddDecision, competitorWeeklySummary, draftIdeaFromAd, publicGallery, presentCompetitorAd } from "./competitor-watch";
import { accountFilter, canReviewSearchWaste, canViewHoldouts, canWatchCompetitors, featureHttpStatus, holdoutListWhere } from "./feature-access";
import {
  HOLDOUT_UNDO_MS,
  assignHoldoutUnits,
  buildHoldoutDesign,
  canStartHoldout,
  canUndoHoldoutStart,
  computeLift,
  holdoutProgress,
  presentLift,
} from "./holdouts";
import { findWastedSearchTerms, groupProposals, negativeKeywordCsv, parseSearchTermsReport, presentProposal } from "./search-waste";
import { isolatedWhere, requireWorkspaceId } from "./workspace";
import type { SearchTermRow } from "./search-waste";

const ROOT = path.resolve(import.meta.dirname, "../..");

function row(overrides: Partial<SearchTermRow> = {}): SearchTermRow {
  return {
    workspaceId: "org",
    adAccountId: "acct",
    campaignId: "camp",
    adGroupId: null,
    campaignName: "Spring Tune-Up",
    adGroupName: "",
    date: "2026-10-28",
    term: "boat repair jobs",
    matchType: "broad",
    impressions: 100,
    clicks: 4,
    spend: 18,
    conversions: 0,
    qualifiedConversions: 0,
    currency: "USD",
    ...overrides,
  };
}

test("marketing feature flags default off", () => {
  assert.equal(searchWasteEnabled({}), false);
  assert.equal(competitorWatchEnabled({ MARKETING_COMPETITOR_WATCH: "off" }), false);
  assert.equal(holdoutsEnabled({ MARKETING_HOLDOUTS: "false" }), false);
  assert.equal(searchWasteEnabled({ MARKETING_SEARCH_WASTE: "on" }), true);
  assert.equal(competitorWatchEnabled({ MARKETING_COMPETITOR_WATCH: "1" }), true);
  assert.equal(holdoutsEnabled({ MARKETING_HOLDOUTS: "yes" }), true);
  assert.deepEqual(adLibraryCountries({}), ["US"]);
  const example = readFileSync(path.join(ROOT, ".env.example"), "utf8");
  assert.match(example, /MARKETING_SEARCH_WASTE=off/);
  assert.match(example, /MARKETING_COMPETITOR_WATCH=off/);
  assert.match(example, /MARKETING_HOLDOUTS=off/);
});

test("migration timestamps are unique", () => {
  const dir = path.join(ROOT, "prisma", "migrations");
  const stamps = readdirSync(dir)
    .filter((name) => name !== "migration_lock.toml")
    .map((name) => name.split("_")[0])
    .sort();
  assert.equal(new Set(stamps).size, stamps.length);
  assert.ok(stamps.includes("20261030170000"));
  assert.ok(stamps.indexOf("20261030170000") > stamps.indexOf("20261030162000"));
});

test("workspace filters are required on every feature query", () => {
  assert.deepEqual(isolatedWhere("org", { id: "1" }), { id: "1", workspaceId: "org" });
  assert.throws(() => requireWorkspaceId("  "), /workspaceId is required/);
  assert.throws(() => isolatedWhere("org", { workspaceId: "other" }), /workspace mismatch/);
  const files = [
    "lib/marketing/search-waste-store.ts",
    "lib/marketing/competitor-store.ts",
    "lib/marketing/holdout-store.ts",
    "lib/marketing/audiences/store.ts",
  ];
  for (const file of files) {
    const src = readFileSync(path.join(ROOT, file), "utf8");
    const parts = src.split(/\nexport async function /).slice(1);
    assert.ok(parts.length > 0, file);
    for (const part of parts) {
      if (!/prisma\.|tx\./.test(part)) continue;
      assert.match(part, /isolatedWhere\(/, file);
    }
  }
});

test("wasted search terms become a human CSV and never a write", () => {
  const now = new Date("2026-10-30T12:00:00.000Z");
  const found = findWastedSearchTerms(
    [
      row(),
      row({ term: "free boat wax", spend: 12, clicks: 2, date: "2026-10-29" }),
      row({ term: "acme marine jobs", spend: 40, clicks: 6 }),
      row({ term: "boat repair jobs", campaignId: "other", campaignName: "Other", conversions: 1, qualifiedConversions: 1, date: "2026-10-20" }),
      row({ workspaceId: "other-client", term: "secret jobs", spend: 500 }),
      row({ term: "bilge pump", spend: 9, clicks: 3, conversions: 0, qualifiedConversions: 0 }),
    ],
    { workspaceId: "org", now, brandTerms: ["acme marine"], otherLocations: ["tampa"] },
  );
  assert.ok(found.every((item) => item.workspaceId === "org"));
  assert.equal(found.some((item) => item.term.toLowerCase().includes("secret")), false);
  const jobs = found.find((item) => item.term === "boat repair jobs");
  assert.ok(jobs);
  assert.equal(jobs.reason, "job_seekers");
  assert.equal(jobs.defaultAction, "keep");
  assert.match(jobs.safetyNote, /Oct 20/);
  const free = found.find((item) => item.term === "free boat wax");
  assert.equal(free?.defaultAction, "block");
  assert.equal(free?.matchType, "phrase");
  const brand = found.find((item) => item.term === "acme marine jobs");
  assert.equal(brand?.defaultAction, "keep");
  assert.match(brand?.safetyNote || "", /brand name/);
  const plain = found.find((item) => item.term === "bilge pump");
  assert.equal(plain?.defaultAction, "keep");
  assert.equal(plain?.confidence, "medium");

  const views = found.map((item) => presentProposal(item, false));
  assert.equal(views.some((item) => "spend" in item), false);
  const staff = presentProposal(free!, true);
  assert.equal(staff.spend, free?.wasteSpend);
  const csv = negativeKeywordCsv(views.map((item) => ({ ...item, include: item.defaultAction === "block" })), false);
  assert.match(csv, /Phrase/);
  assert.equal(csv.includes("Cost"), false);
  assert.equal(csv.includes("$"), false);
  assert.match(negativeKeywordCsv([{ ...staff, include: true, defaultAction: "block" }], true), /Cost/);
  assert.equal(groupProposals(views).some((group) => group.label === "Job seekers"), true);

  const parsed = parseSearchTermsReport(
    "Search term,Campaign,Ad group,Match type,Impr.,Clicks,Cost,Conversions\nfree estimate,Spring,Group A,Phrase,20,2,\"$4.50\",0\n",
    { workspaceId: "org", adAccountId: "acct", date: "2026-10-30" },
  );
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].spend, 4.5);
  assert.equal(parsed[0].workspaceId, "org");
});

test("competitor watch uses the public Meta Ad Library and hides performance", async () => {
  const mapped = mapAdLibraryAds({
    data: [
      {
        id: "999",
        page_name: "Gulf Marine",
        page_id: "42",
        ad_creative_link_titles: ["Same-day service"],
        ad_creative_bodies: ["Boats ready today"],
        ad_delivery_start_time: "2026-10-02",
        ad_snapshot_url: "https://www.facebook.com/ads/library/?id=999",
        spend: { lower_bound: "100", upper_bound: "199" },
        impressions: { lower_bound: "1000" },
        currency: "USD",
      },
    ],
  }, new Date("2026-10-30T00:00:00.000Z"));
  const encoded = JSON.stringify(mapped);
  assert.equal(encoded.includes("spend"), false);
  assert.equal(encoded.includes("impression"), false);
  assert.equal(encoded.includes("USD"), false);
  assert.equal(encoded.includes("lower_bound"), false);
  assert.equal(mapped[0].source, "meta_ad_library");
  assert.equal(mapped[0].snapshotUrl.includes("ads/library"), true);
  const card = presentCompetitorAd({ competitorName: "Gulf Marine", ad: mapped[0], now: new Date("2026-11-15T00:00:00.000Z") });
  assert.equal(card.longRunning, true);
  assert.equal(competitorCopyIsPublic(card.runningSince), true);
  assert.equal(competitorCopyIsPublic("They spent $10"), false);
  const summary = competitorWeeklySummary([{ name: "Gulf Marine", ads: [{ firstSeen: "2026-10-28", headline: "Same-day service" }] }], new Date("2026-10-23T00:00:00.000Z"));
  assert.match(summary[0], /started 1 new ad/);
  assert.equal(publicGallery([card]).some((item) => JSON.stringify(item).includes("spend")), false);
  assert.equal(draftIdeaFromAd(mapped[0]).status, "draft");
  assert.equal(competitorAddDecision(MAX_COMPETITORS).ok, false);
  assert.equal(competitorAddDecision(4).ok, true);
  assert.equal(cleanCompetitorInput({ name: "Gulf", website: "https://gulf.example" }).ok, true);
  assert.equal(cleanCompetitorInput({ name: "Gulf" }).ok, false);

  let called = "";
  let method = "";
  const result = await fetchAdLibraryAds({
    version: "v23.0",
    token: "secret-token",
    appSecret: "secret-app",
    countries: ["US"],
    pageIds: ["42"],
    competitorName: "Gulf Marine",
    fetchImpl: async (input, init) => {
      called = String(input);
      method = init?.method || "GET";
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    },
  });
  assert.equal(result.ok, true);
  assert.equal(method, "GET");
  assert.match(called, /\/ads_archive\?/);
  assert.match(called, /search_page_ids/);
  assert.equal(called.includes("spend"), false);
  assert.equal(AD_LIBRARY_FIELDS.join(",").includes("spend"), false);
  const url = adLibraryUrl({ version: "v23.0", token: "t", countries: ["US"], searchTerms: "boats" });
  assert.equal(url.searchParams.get("fields")?.includes("impressions"), false);
  const denied = await fetchAdLibraryAds({
    version: "v23.0",
    token: "secret-token",
    countries: ["US"],
    pageIds: ["42"],
    competitorName: "Gulf Marine",
    fetchImpl: async () => new Response(JSON.stringify({ error: { message: "bad secret-token" } }), { status: 400 }),
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.match(denied.message, /Couldn't load ads for Gulf Marine/);
    assert.equal(denied.message.includes("secret-token"), false);
  }
});

test("holdout assignment and readout stay read-only and hide cost", () => {
  const units = Array.from({ length: 20 }, (_, index) => `geo-${index}`);
  const first = assignHoldoutUnits({ testKey: "test-1", units, holdoutPercent: 10, kind: "geo" });
  const second = assignHoldoutUnits({ testKey: "test-1", units, holdoutPercent: 10, kind: "geo" });
  assert.deepEqual(second, first);
  assert.ok(first.some((item) => item.role === "holdout"));
  assert.ok(first.some((item) => item.role === "treatment"));
  const dates = assignHoldoutUnits({
    testKey: "time",
    units: ["2026-10-03", "2026-10-01", "2026-10-02"],
    holdoutPercent: 10,
    kind: "time",
  });
  assert.deepEqual(dates[0], { unitKey: "2026-10-01", role: "holdout" });
  assert.equal(buildHoldoutDesign({ question: "", kind: "geo", metric: "leads", units: ["a", "b"], startDate: "2026-10-01", endDate: "2026-10-28" }).ok, false);

  const obvious = computeLift({
    metric: "leads",
    minSample: 30,
    assignments: [
      { unitKey: "a", role: "treatment" },
      { unitKey: "b", role: "treatment" },
      { unitKey: "c", role: "holdout" },
    ],
    observations: [
      { unitKey: "a", period: "post", outcome: 100, spend: 5700 },
      { unitKey: "b", period: "post", outcome: 100, spend: 5700 },
      { unitKey: "c", period: "post", outcome: 1, spend: 0 },
    ],
  });
  assert.equal(obvious.ready, true);
  assert.equal(obvious.method, "holdout_comparison");
  assert.equal(obvious.verdict, "clearly_helping");
  assert.ok(obvious.rangeLow !== null && obvious.rangeHigh !== null);
  assert.ok(obvious.rangeLow! < obvious.extra! && obvious.extra! < obvious.rangeHigh!);
  assert.match(obvious.sentence, /range /);
  assert.match(obvious.sentence, /90%/);
  assert.equal(obvious.sentence.includes("$"), false);

  const early = computeLift({ ...obvious, minSample: 1000, metric: "leads", assignments: [
    { unitKey: "a", role: "treatment" },
    { unitKey: "b", role: "treatment" },
    { unitKey: "c", role: "holdout" },
  ], observations: [
    { unitKey: "a", period: "post", outcome: 100 },
    { unitKey: "b", period: "post", outcome: 100 },
    { unitKey: "c", period: "post", outcome: 1 },
  ] });
  assert.equal(early.verdict, "too_early");
  assert.equal(early.rangeLow, null);
  assert.equal(early.extra, null);
  assert.equal(early.sentence, "Too early to tell");

  const flat = computeLift({
    metric: "leads",
    minSample: 1,
    assignments: [
      { unitKey: "a", role: "treatment" },
      { unitKey: "b", role: "treatment" },
      { unitKey: "c", role: "holdout" },
    ],
    observations: [
      { unitKey: "a", period: "post", outcome: 10 },
      { unitKey: "b", period: "post", outcome: 10 },
      { unitKey: "c", period: "post", outcome: 10 },
    ],
  });
  assert.equal(flat.verdict, "no_clear_effect");
  assert.ok(flat.rangeLow !== null && flat.rangeHigh !== null);

  const exposed = computeLift({
    metric: "leads",
    minSample: 1,
    assignments: [
      { unitKey: "a", role: "treatment" },
      { unitKey: "c", role: "holdout" },
    ],
    observations: [
      { unitKey: "a", period: "post", outcome: 100 },
      { unitKey: "c", period: "post", outcome: 1, impressions: 5 },
    ],
  });
  assert.equal(exposed.verdict, "invalidated");
  assert.match(exposed.sentence, /holdout group started seeing ads/);
  assert.equal(exposed.rangeLow, null);

  const did = computeLift({
    metric: "leads",
    minSample: 1,
    assignments: [
      { unitKey: "a", role: "treatment" },
      { unitKey: "b", role: "treatment" },
      { unitKey: "c", role: "holdout" },
      { unitKey: "d", role: "holdout" },
    ],
    observations: [
      { unitKey: "a", period: "pre", outcome: 10 },
      { unitKey: "b", period: "pre", outcome: 10 },
      { unitKey: "c", period: "pre", outcome: 10 },
      { unitKey: "d", period: "pre", outcome: 12 },
      { unitKey: "a", period: "post", outcome: 20 },
      { unitKey: "b", period: "post", outcome: 22 },
      { unitKey: "c", period: "post", outcome: 12 },
      { unitKey: "d", period: "post", outcome: 14 },
    ],
  });
  assert.equal(did.method, "diff_in_diff");
  assert.equal(did.ready, true);

  const synthetic = computeLift({
    metric: "leads",
    minSample: 1,
    assignments: [
      { unitKey: "t", role: "treatment" },
      { unitKey: "d1", role: "holdout" },
      { unitKey: "d2", role: "holdout" },
    ],
    observations: [
      { unitKey: "t", period: "pre", outcome: 10 },
      { unitKey: "d1", period: "pre", outcome: 10 },
      { unitKey: "d2", period: "pre", outcome: 14 },
      { unitKey: "t", period: "post", outcome: 40, spend: 800 },
      { unitKey: "d1", period: "post", outcome: 12 },
      { unitKey: "d2", period: "post", outcome: 16 },
    ],
  });
  assert.equal(synthetic.method, "synthetic_control");
  assert.ok(Math.abs((synthetic.extra || 0) - 28) < 0.001);

  const client = presentLift(obvious, false);
  assert.equal("extraLeadCost" in client, false);
  assert.equal(JSON.stringify(client).includes("$"), false);
  assert.equal(/cost|spend|cpa|roas/i.test(JSON.stringify(client)), false);
  const staff = presentLift(obvious, true);
  assert.match(staff.staffCostLine || "", /Extra lead cost \$/);

  const progress = holdoutProgress("2026-10-01", "2026-10-29", new Date("2026-10-09T00:00:00.000Z"));
  assert.equal(progress.label, "Day 9 of 28");
  const started = new Date("2026-10-30T12:00:00.000Z");
  assert.equal(canUndoHoldoutStart("running", started, new Date(started.getTime() + HOLDOUT_UNDO_MS - 1)), true);
  assert.equal(canUndoHoldoutStart("running", started, new Date(started.getTime() + HOLDOUT_UNDO_MS)), false);
  assert.equal(canStartHoldout({ kind: "super_admin" }), true);
  assert.equal(canStartHoldout({ kind: "account_manager" }), false);
});

test("cost and workspace access follow the staff roles", () => {
  const superAdmin = accessFromUser({ id: "sa", email: "sa@example.com", role: "super_admin" }, [], {});
  const manager = accessFromUser({ id: "am", email: "am@example.com", role: "account_manager" }, [{ workspaceId: "org", scopeKind: "client", adAccountId: null, campaignId: null }], {});
  const owner = accessFromUser({ id: "o", email: "o@example.com", role: "owner" }, [], {});
  const viewer = accessFromUser({ id: "v", email: "v@example.com", role: "viewer" }, [], {});
  const client = accessFromUser({ id: "c", email: "c@example.com", role: "client_viewer" }, [{ workspaceId: "org", scopeKind: "client", adAccountId: null, campaignId: null }], {});
  assert.equal(superAdmin.seesCost, true);
  assert.equal(manager.seesCost, true);
  assert.equal(owner.seesCost, false);
  assert.equal(canReviewSearchWaste(superAdmin), true);
  assert.equal(canReviewSearchWaste(manager), true);
  assert.equal(canReviewSearchWaste(owner), false);
  assert.equal(canReviewSearchWaste(client), false);
  assert.equal(canWatchCompetitors(owner), true);
  assert.equal(canWatchCompetitors(viewer), false);
  assert.equal(canViewHoldouts(client), false);
  assert.equal(featureHttpStatus({ enabled: false, allowed: true }), 404);
  assert.equal(featureHttpStatus({ enabled: true, allowed: false }), 403);
  assert.deepEqual(accountFilter(manager), "all");
  assert.equal(holdoutListWhere(manager).workspaceId, "org");
  const scoped = accessFromUser({ id: "am2", email: "am2@example.com", role: "account_manager" }, [{ workspaceId: "org", scopeKind: "ad_account", adAccountId: "acct-9", campaignId: null }], {});
  assert.deepEqual(holdoutListWhere(scoped), { workspaceId: "org", adAccountId: { in: ["acct-9"] } });
});

test("feature routes do not call an ad platform write", () => {
  const files = [
    "lib/marketing/search-waste.ts",
    "lib/marketing/search-waste-store.ts",
    "lib/marketing/connectors/ad-library.ts",
    "lib/marketing/competitor-watch.ts",
    "lib/marketing/competitor-store.ts",
    "lib/marketing/holdouts.ts",
    "lib/marketing/holdout-store.ts",
    "lib/marketing/feature-actions.ts",
    "app/api/marketing/search-waste/route.ts",
    "app/api/marketing/search-waste/export/route.ts",
    "app/api/marketing/competitors/route.ts",
    "app/api/marketing/holdouts/route.ts",
  ];
  const banned = [/googleads\.googleapis\.com/, /campaignCriteria/, /:mutate/, /UploadClickConversions/, /MARKETING_SEARCH_WASTE_APPLY/];
  for (const file of files) {
    const src = readFileSync(path.join(ROOT, file), "utf8");
    for (const pattern of banned) assert.equal(pattern.test(src), false, `${file} ${pattern}`);
  }
  const routes = [
    "app/api/marketing/search-waste/route.ts",
    "app/api/marketing/search-waste/export/route.ts",
    "app/api/marketing/competitors/route.ts",
    "app/api/marketing/holdouts/route.ts",
  ];
  for (const file of routes) {
    const src = readFileSync(path.join(ROOT, file), "utf8");
    assert.match(src, /featureHttpStatus/);
    assert.match(src, /workspaceId/);
  }
  const holdoutRoute = readFileSync(path.join(ROOT, "app/api/marketing/holdouts/route.ts"), "utf8");
  assert.match(holdoutRoute, /viewStoredLift/);
  assert.match(holdoutRoute, /seesCost/);
  const schema = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
  assert.equal(schema.includes("model SearchTerm {"), false);
  assert.match(schema, /model SearchTermMetric/);
  const store = readFileSync(path.join(ROOT, "lib/marketing/search-waste-store.ts"), "utf8");
  assert.match(store, /searchTermMetric/);
  assert.equal(store.includes("prisma.searchTerm."), false);
  assert.match(store, /googleAdsEnv/);
  const config = readFileSync(path.join(ROOT, "lib/marketing/config.ts"), "utf8");
  const client = readFileSync(path.join(ROOT, "lib/marketing/connectors/google-ads-client.ts"), "utf8");
  assert.equal((config.match(/function googleAdsApiVersion/g) || []).length, 1);
  assert.equal((client.match(/function googleAdsGuard/g) || []).length, 1);
  assert.equal(store.includes("function googleAdsApiVersion"), false);
  assert.equal(store.includes("function googleAdsGuard"), false);
  assert.match(config, /GOOGLE_ADS_CUSTOMER_IDS/);
});

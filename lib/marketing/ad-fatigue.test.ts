import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { addDaysISO } from "../time";
import {
  AD_FATIGUE_CONFIDENCE_THRESHOLD,
  AD_FATIGUE_FIXED_LINE,
  adFatiguePlatforms,
  learnResumeChecks,
  learnWindowDays,
  pickAssignee,
  planAdFatigue,
  shrinkBinomial,
  type AdFatigueAd,
  type AdFatigueCheckPoint,
  type AdFatigueRow,
} from "./ad-fatigue";
import { adFatigueEnabled } from "./config";
import { decisionVisibleText, visibleDecisionCards } from "./decision-ui";
import { decideRecommendation } from "./recommendations";

const ROOT = path.resolve(import.meta.dirname, "../..");
const COST_TEXT = /cost|spend|cpc|cpm|cpa|cpl|roas|\bbudget\b|\$/i;

function row(adId: string, date: string, overrides: Partial<AdFatigueRow> = {}): AdFatigueRow {
  return {
    id: `${adId}-${date}`,
    date,
    impressions: 2000,
    clicks: 40,
    reach: 1800,
    spend: 20,
    conversions: 4,
    conversionValue: 40,
    creativeKey: "creative-a",
    attributionWindow: "7d_click",
    ...overrides,
  };
}

function fill(adId: string, start: string, days: number, overrides: Partial<AdFatigueRow> = {}) {
  return Array.from({ length: days }, (_, index) => row(adId, addDaysISO(start, index), overrides));
}

function ad(overrides: Partial<AdFatigueAd> & Pick<AdFatigueAd, "adId" | "rows">): AdFatigueAd {
  return {
    adName: "Roof storm",
    platform: "meta",
    campaignId: "camp-1",
    campaignName: "Spring",
    adAccountId: "acct-1",
    clientKey: "client:north",
    assigneeUserId: "am-1",
    ...overrides,
  };
}

test("ad fatigue, stackadapt, and business profile switches default off", () => {
  assert.equal(adFatigueEnabled({}), false);
  assert.equal(adFatigueEnabled({ MARKETING_AD_FATIGUE: "on" }), true);
  assert.equal(AD_FATIGUE_CONFIDENCE_THRESHOLD, 0.8);
  assert.deepEqual(adFatiguePlatforms({}), ["meta"]);
  assert.deepEqual(adFatiguePlatforms({ MARKETING_AD_FATIGUE_PLATFORMS: "meta,google_ads,tiktok" }), ["meta", "google_ads"]);
  assert.deepEqual(adFatiguePlatforms({ MARKETING_AD_FATIGUE_PLATFORMS: "google_ads" }), ["google_ads"]);
});

test("shrinkage keeps a tiny sample near the prior", () => {
  const shrunk = shrinkBinomial(0.02, 50, 0, 10);
  assert.ok(shrunk > 0.012 && shrunk < 0.025, String(shrunk));
  const trusted = shrinkBinomial(0.02, 50, 0, 10_000);
  assert.ok(trusted < 0.005, String(trusted));
});

test("7-day click, 1-day view, and 2 good checks are priors that client data moves", () => {
  assert.equal(learnWindowDays({ priorDays: 7, observations: [], max: 28 }), 7);
  assert.equal(learnWindowDays({ priorDays: 1, observations: [], max: 7 }), 1);
  assert.equal(Math.round(learnResumeChecks([])), 2);
  const click = learnWindowDays({
    priorDays: 7,
    observations: Array.from({ length: 40 }, () => ({ days: 1, weight: 5 })),
    max: 28,
  });
  assert.ok(click < 3, String(click));
  const barely = learnWindowDays({ priorDays: 7, observations: [{ days: 1, weight: 1 }], max: 28 });
  assert.ok(barely > 6, String(barely));
  const checks = learnResumeChecks(Array.from({ length: 40 }, () => 4));
  assert.ok(checks > 3, String(checks));
});

test("a small sample is not judged early", () => {
  const tired = ad({
    adId: "tiny",
    rows: [
      ...fill("tiny", "2026-10-11", 3, { impressions: 10, clicks: 4, reach: 8, spend: 2, conversions: 1, conversionValue: 2 }),
      ...fill("tiny", "2026-10-14", 3, { impressions: 10, clicks: 0, reach: 2, spend: 8, conversions: 0, conversionValue: 0 }),
    ],
  });
  const plan = planAdFatigue({ ads: [tired], today: "2026-10-16" });
  const verdict = plan.checks[0];
  assert.ok(verdict);
  assert.equal(verdict.emit, false);
  assert.ok(verdict.confidence < 0.8, String(verdict.confidence));
  assert.equal(plan.recommendations.length, 0);
  assert.equal(Math.round(plan.states[0]?.learned.clickDays ?? 0), 7);
  assert.equal(Math.round(plan.states[0]?.learned.viewDays ?? 0), 1);
});

test("a clear Meta decline becomes a pause recommendation with a plain reason", () => {
  const rows = [
    ...fill("ad-1", "2026-10-07", 7, { impressions: 2000, clicks: 50, reach: 1900, spend: 20, conversions: 4, conversionValue: 80 }),
    ...fill("ad-1", "2026-10-14", 7, { impressions: 2000, clicks: 8, reach: 400, spend: 5, conversions: 1, conversionValue: 20 }),
  ];
  const plan = planAdFatigue({ ads: [ad({ adId: "ad-1", rows })], today: "2026-10-20" });
  const verdict = plan.checks[0];
  assert.equal(verdict?.action, "pause", JSON.stringify({ action: verdict?.action, confidence: verdict?.confidence, signals: verdict?.signals }));
  assert.equal(verdict?.emit, true);
  assert.ok((verdict?.confidence ?? 0) >= 0.8);
  const recommendation = plan.recommendations[0];
  assert.ok(recommendation);
  assert.match(recommendation.reason, /should pause/);
  assert.match(recommendation.reason, /Confidence/);
  assert.equal(recommendation.summary, AD_FATIGUE_FIXED_LINE);
  assert.equal(recommendation.changesSpend, false);
  assert.equal(recommendation.writesAds, false);
  assert.equal(recommendation.recommendationOnly, true);
  assert.equal(recommendation.assigneeUserId, "am-1");
  assert.doesNotMatch(recommendation.rationale, /\bbudget\b/i);
  assert.doesNotMatch(recommendation.reason, COST_TEXT);
});

test("the same series is scored for Google", () => {
  const rows = [
    ...fill("g-1", "2026-10-07", 7, { impressions: 2000, clicks: 50, reach: 1900, spend: 20, conversions: 4, conversionValue: 80, attributionWindow: "google_ads" }),
    ...fill("g-1", "2026-10-14", 7, { impressions: 2000, clicks: 8, reach: 400, spend: 5, conversions: 1, conversionValue: 20, attributionWindow: "google_ads" }),
  ];
  const meta = planAdFatigue({ ads: [ad({ adId: "g-1", platform: "meta", rows })], today: "2026-10-20" });
  const google = planAdFatigue({ ads: [ad({ adId: "g-1", platform: "google_ads", rows })], today: "2026-10-20" });
  assert.equal(google.checks[0]?.action, meta.checks[0]?.action);
  assert.equal(google.checks[0]?.emit, true);
  assert.equal(Math.round(google.states[0]?.learned.clickDays ?? 0), 7);
});

test("creative repetition recommends a rotate, and a client threshold can hold it", () => {
  const rows = fill("old", "2026-09-27", 24, { impressions: 1500, clicks: 30, reach: 1400, spend: 15, conversions: 3, conversionValue: 30 });
  const emitted = planAdFatigue({ ads: [ad({ adId: "old", rows })], today: "2026-10-20" });
  assert.equal(emitted.checks[0]?.action, "rotate", JSON.stringify(emitted.checks[0]?.signals.repetition));
  assert.equal(emitted.checks[0]?.emit, true);
  assert.match(emitted.recommendations[0]?.reason ?? "", /same creative/);
  const held = planAdFatigue({
    ads: [ad({ adId: "old", rows })],
    today: "2026-10-20",
    thresholdByClient: new Map([["client:north", 0.99]]),
  });
  assert.equal(held.recommendations.length, 0);
  assert.equal(held.states[0]?.threshold, 0.99);
});

test("two good checks are required before a resume recommendation", () => {
  const healthy = fill("back", "2026-10-07", 14, { impressions: 2000, clicks: 40, reach: 1900, spend: 20, conversions: 4, conversionValue: 40 });
  const history: AdFatigueCheckPoint[] = [
    { adId: "back", action: "pause", emitted: true, at: "2026-10-18" },
    { adId: "back", action: "keep", emitted: false, at: "2026-10-19" },
  ];
  const early = planAdFatigue({ ads: [ad({ adId: "back", rows: healthy })], today: "2026-10-19", history: history.slice(0, 1) });
  assert.equal(early.recommendations.length, 0);
  const ready = planAdFatigue({ ads: [ad({ adId: "back", rows: healthy })], today: "2026-10-20", history });
  assert.equal(ready.checks[0]?.action, "keep", JSON.stringify({ action: ready.checks[0]?.action, confidence: ready.checks[0]?.confidence }));
  assert.equal(ready.checks[0]?.emit, true);
  assert.match(ready.recommendations[0]?.reason ?? "", /2 good checks/);
});

test("client relapses raise the stored good-check prior", () => {
  const history: AdFatigueCheckPoint[] = [{ adId: "ad", action: "pause", emitted: true, at: "2026-01-01" }];
  for (let index = 0; index < 40; index += 1) {
    const start = addDaysISO("2026-01-02", index * 3);
    history.push({ adId: "ad", action: "keep", emitted: false, at: start });
    history.push({ adId: "ad", action: "keep", emitted: false, at: addDaysISO(start, 1) });
    history.push({ adId: "ad", action: "pause", emitted: true, at: addDaysISO(start, 2) });
  }
  const plan = planAdFatigue({
    ads: [ad({ adId: "ad", rows: fill("ad", "2026-10-14", 7, { impressions: 10, clicks: 1, reach: 10, spend: 1, conversions: 0, conversionValue: 0 }) })],
    today: "2026-10-20",
    history,
  });
  assert.ok((plan.states[0]?.learned.goodChecksBeforeResume ?? 0) > 2.5);
  assert.ok((plan.states[0]?.learned.resumeEpisodes ?? 0) >= 40);
});

test("1-day click conversions move the learned window off the 7-day prior", () => {
  const rows = fill("win", "2026-10-14", 7, { attributionWindow: "1d_click", conversions: 8, clicks: 20, impressions: 400, reach: 300 });
  rows.push(...fill("win", "2026-10-14", 7, { attributionWindow: "1d_view", conversions: 6, clicks: 0, impressions: 0, reach: 0, id: "view" }));
  const plan = planAdFatigue({ ads: [ad({ adId: "win", rows })], today: "2026-10-20" });
  assert.ok((plan.states[0]?.learned.clickDays ?? 7) < 4, String(plan.states[0]?.learned.clickDays));
  assert.ok((plan.states[0]?.learned.viewDays ?? 1) >= 1);
});

test("recommendations are a yes or no for the assigned account manager", () => {
  const card = {
    id: "1",
    type: "ad_fatigue",
    status: "verified",
    title: "'Roof storm' should pause. Clicks fell. Confidence 91%.",
    summary: AD_FATIGUE_FIXED_LINE,
    rationale: AD_FATIGUE_FIXED_LINE,
    metric: "ctr",
    baseline: "0.8000",
    observed: "0.9100",
    windowStart: "2026-10-14",
    windowEnd: "2026-10-20",
    sampleSize: 14000,
    sourceCount: 14,
    assigneeUserId: "am-1",
    confidence: 0.91,
    action: "pause",
    createdAt: new Date().toISOString(),
  };
  const hidden = visibleDecisionCards([card], { seesCost: true, monitor: false, fatigue: false, pacing: false, adFatigue: false, userId: "am-1" });
  assert.equal(hidden.length, 0);
  const mine = visibleDecisionCards([card], { seesCost: true, monitor: false, fatigue: false, pacing: false, adFatigue: true, userId: "am-1" });
  assert.equal(mine.length, 1);
  const other = visibleDecisionCards([card], { seesCost: true, monitor: false, fatigue: false, pacing: false, adFatigue: true, userId: "am-2" });
  assert.equal(other.length, 0);
  const admin = visibleDecisionCards([card], { seesCost: true, monitor: false, fatigue: false, pacing: false, adFatigue: true, userId: "admin", isSuperAdmin: true });
  assert.equal(admin.length, 1);
  const text = decisionVisibleText(card);
  assert.match(text, /Yes/);
  assert.match(text, /No/);
  assert.doesNotMatch(text, /\bbudget\b/i);
});

test("accepting an ad fatigue recommendation does not write a budget", async () => {
  const store = { async write() { throw new Error("wrote a budget"); } };
  const result = await decideRecommendation({
    actor: { kind: "human", access: { kind: "account_manager", seesCost: true, seesAlerts: true, accounts: "all", campaigns: "all", workspaceId: "org", userId: "am", email: "am@example.com", role: "account_manager", canEditBudget: true, canCreateShareLink: true } },
    recommendation: {
      id: "rec",
      type: "ad_fatigue",
      status: "verified",
      campaignId: "camp",
      adAccountId: "acct",
      proposedBudgetAmount: null,
      proposedBudgetPeriod: null,
      proposedCurrency: null,
    },
    decision: "accept",
    budgetStore: store,
  });
  assert.equal(result.status, "accepted");
  assert.equal(result.budgetWrite, "none");
});

test("the assigned account manager is the most specific assignment", () => {
  const assignee = pickAssignee(
    [
      { userId: "client-am", scopeKind: "client", adAccountId: null, campaignId: null },
      { userId: "account-am", scopeKind: "ad_account", adAccountId: "acct-1", campaignId: null },
      { userId: "campaign-am", scopeKind: "campaign", adAccountId: "acct-1", campaignId: "camp-1" },
    ],
    "acct-1",
    "camp-1",
  );
  assert.equal(assignee, "campaign-am");
});

test("ad fatigue code does not write ads or budgets", () => {
  for (const file of ["lib/marketing/ad-fatigue.ts", "lib/marketing/ad-fatigue-job.ts", "worker/index.ts"]) {
    const text = readFileSync(path.join(ROOT, file), "utf8");
    assert.equal(text.includes("setCampaignBudget"), false, file);
    assert.equal(text.includes("prisma.ad.update"), false, file);
    assert.equal(text.includes("prisma.campaign.update"), false, file);
  }
  const job = readFileSync(path.join(ROOT, "lib/marketing/ad-fatigue-job.ts"), "utf8");
  assert.match(job, /adFatiguePlatforms/);
  assert.match(job, /recommendationOnly: true/);
  assert.match(job, /changesSpend: false/);
  const actions = readFileSync(path.join(ROOT, "lib/marketing/human-actions.ts"), "utf8");
  const note = actions.slice(actions.indexOf('rec.type === "ad_fatigue"'), actions.indexOf("reason || choice"));
  assert.match(note, /"yes"/);
  assert.match(note, /"no"/);
  const sql = readFileSync(path.join(ROOT, "prisma/migrations/20261031120000_recommend_only_connectors/migration.sql"), "utf8");
  assert.match(sql, /ADD VALUE 'ad_fatigue'/);
  assert.match(sql, /recommendationOnly" = true/);
  assert.match(sql, /changesSpend" = false/);
});

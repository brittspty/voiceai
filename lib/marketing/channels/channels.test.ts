import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { jarvisUiV2Enabled } from "../config";
import { adaptChannelDaily, adaptDailyMetric, normalizeChannelFacts } from "./adapters";
import { clientChannelPayload, EXAMPLE_DECISIONS, EXAMPLE_FEED } from "./catalog";
import { collectsCostKeys, stripForAudience } from "./cost-strip";
import { attributionNote, creditWindow, dedupeLeads, DEFAULT_CLICK_CREDIT_DAYS, DEFAULT_VIEW_CREDIT_DAYS, personKey } from "./dedupe";
import { answerDecision, budgetWritePath, clientSeesCreativeApprovals, CREATIVE_APPROVALS_DEFAULT, fatigueDigestItems, routeFatigueDecision, seesInboxCard } from "./decisions";
import { explainChange } from "./explain";
import { deliveryPlan, inQuietHours, scopeLiveFeed, sameDriverMuted, toastAllowed, URGENT_CHANNEL } from "./feed";
import { evaluateFlags } from "./flags";
import { glossaryFor, GLOSSARY } from "./glossary";
import { navActive } from "./nav";
import { planOutagePause } from "./outage";
import { recommendAd } from "./recommend";
import { canMarkLead, measureSpeed, SPEED_GOAL_SEC } from "./speed";
import { resolveThresholds } from "./thresholds";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const learned = { clickDays: 9, viewDays: 1, learnedClickDays: 9, learnedViewDays: 1, source: "learned" as const };

test("the new UI stays off until JARVIS_UI_V2 is on", () => {
  assert.equal(jarvisUiV2Enabled({}), false);
  assert.equal(jarvisUiV2Enabled({ JARVIS_UI_V2: "on" }), true);
});

test("meta and google rows are adapted, not copied, and ratios are derived", () => {
  const fact = adaptDailyMetric({
    platform: "meta",
    date: "2026-10-30",
    impressions: 1000,
    clicks: 25,
    reach: 400,
    spend: 50,
    platformLeads: 5,
    platformConversions: 2,
    conversionValue: 200,
  });
  assert.equal(fact?.channel, "meta");
  assert.equal(fact?.ctr, 0.025);
  assert.equal(fact?.cpc, 2);
  assert.equal(fact?.cpm, 50);
  assert.equal(fact?.cpa, 25);
  assert.equal(fact?.roas, 4);
  assert.equal(fact?.frequency, 2.5);
  assert.equal(adaptDailyMetric({ platform: "tiktok", date: "2026-10-30" }), null);
  const facts = normalizeChannelFacts({
    daily: [{ platform: "google_ads", date: "2026-10-30", impressions: 10, clicks: 1, spend: 4, platformLeads: 1, platformConversions: 1, conversionValue: 8 }],
    channel: [{ channel: "stackadapt", date: "2026-10-30", impressions: 100, clicks: 4, reach: 50, spend: 20, leads: 1, conversions: 1, conversionValue: 10 }],
  });
  assert.deepEqual(facts.map((row) => row.channel), ["google_ads", "stackadapt"]);
  assert.equal(facts[1]?.frequency, 2);
});

test("google business profile has no spend and search terms stay in their own table", () => {
  const gbp = adaptChannelDaily({
    channel: "google_business_profile",
    date: "2026-10-30",
    profileViews: 40,
    searches: 12,
    calls: 3,
    directionRequests: 2,
    websiteClicks: 5,
    reviewCount: 3,
    rating: "4.8",
    leads: 8,
    spend: 99,
  });
  assert.equal(gbp.spend, null);
  assert.equal(gbp.cpc, null);
  assert.equal(gbp.roas, null);
  assert.equal(gbp.calls, 3);
  assert.equal(gbp.rating, 4.8);
  assert.throws(() => adaptChannelDaily({ channel: "meta", date: "2026-10-30" }), /DailyMetric/);
  assert.throws(() => adaptChannelDaily({ channel: "stackadapt", date: "2026-10-30", term: "dentist" }), /SearchTermMetric/);
  const query = readFileSync(path.join(ROOT, "lib/marketing/channels/query.ts"), "utf8");
  assert.match(query, /isolatedWhere\(/);
  assert.doesNotMatch(query, /channel:\s*"meta"/);
});

test("leads are counted once and credit is 7 days after a click and 1 day after a view", () => {
  assert.equal(DEFAULT_CLICK_CREDIT_DAYS, 7);
  assert.equal(DEFAULT_VIEW_CREDIT_DAYS, 1);
  assert.match(attributionNote(), /7-day click \/ 1-day view/);
  const phone = personKey({ phone: "(555) 010-1000", email: "a@example.com" });
  const same = personKey({ phone: "5550101000" });
  assert.equal(phone, same);
  assert.notEqual(phone, personKey({ email: "a@example.com" }));
  assert.doesNotMatch(phone || "", /555/);
  const leadAt = "2026-10-30T12:00:00Z";
  const touches = [
    { personKey: "p1", channel: "meta", touch: "click" as const, touchedAt: "2026-10-24T12:00:00Z", leadAt, qualified: true },
    { personKey: "p1", channel: "google_ads", touch: "click" as const, touchedAt: "2026-10-29T12:00:00Z", leadAt, qualified: true },
    { personKey: "p2", channel: "meta", touch: "view" as const, touchedAt: "2026-10-28T12:00:00Z", leadAt },
    { personKey: "p3", channel: "meta", touch: "view" as const, touchedAt: "2026-10-29T12:00:00Z", leadAt },
    { personKey: "p4", channel: "meta", touch: "click" as const, touchedAt: "2026-10-21T12:00:00Z", leadAt },
  ];
  const blended = dedupeLeads(touches);
  assert.equal(blended.people, 2);
  assert.equal(blended.byChannel.google_ads, 1);
  assert.equal(blended.byChannel.meta, 1);
  assert.equal(blended.qualified, 1);
  assert.equal(blended.platformClaims.meta, 4);
  const wider = dedupeLeads(touches, { clickDays: 9, viewDays: 1 });
  assert.equal(wider.window.clickDays, 9);
  assert.equal(wider.people, 3);
  assert.equal(creditWindow({ clickDays: Number.NaN }).clickDays, 7);
});

test("client and share payloads lose spend, budget, cost, and ROAS", () => {
  const staff = stripForAudience({ spend: 10, roas: 2, cpl: 4, cpql: 8, budget: 20, leads: 3, nested: { cost: 1, clicks: 2 } }, "staff");
  assert.equal(staff.roas, 2);
  const client = stripForAudience(staff, "client");
  const share = stripForAudience(staff, "share");
  assert.deepEqual(collectsCostKeys(client), []);
  assert.deepEqual(collectsCostKeys(share), []);
  assert.equal(client.leads, 3);
  assert.equal((client.nested as { clicks: number }).clicks, 2);
  assert.deepEqual(collectsCostKeys(clientChannelPayload()), []);
  const home = readFileSync(path.join(ROOT, "app/api/marketing/jarvis/home/route.ts"), "utf8");
  const feed = readFileSync(path.join(ROOT, "app/api/marketing/jarvis/feed/route.ts"), "utf8");
  assert.match(home, /readScopedClient/);
  assert.match(feed, /scopeLiveFeed/);
  assert.equal(glossaryFor("staff").length, 18);
  assert.equal(GLOSSARY.length, 18);
  assert.equal(glossaryFor("client").some((entry) => entry.id === "roas" || entry.id === "spend" || entry.id === "cpl" || entry.id === "cpql"), false);
});

test("fatigue pauses and rotations are yes/no for the assigned manager and never run themselves", () => {
  const routed = routeFatigueDecision({
    kind: "fatigue_pause",
    campaignId: "camp-1",
    adAccountId: "act-1",
    reasoning: "The ad got tired after people saw it 4.6 times.",
    assignments: [
      { userId: "other", role: "account_manager", scopeKind: "campaign", campaignId: "camp-2", adAccountId: "act-1" },
      { userId: "dana", role: "account_manager", scopeKind: "campaign", campaignId: "camp-1", adAccountId: "act-1" },
    ],
    confidence: 88,
    serve: "pause",
    credit: learned,
  });
  assert.equal(routed.assigneeId, "dana");
  assert.equal(routed.automatic, false);
  assert.equal(routed.executes, false);
  assert.match(routed.creditWindowLabel, /9-day click/);
  assert.match(routed.creditWindowLabel, /\(learned\)/);
  assert.throws(() => routeFatigueDecision({ ...routed, reasoning: "  ", assignments: [], kind: "fatigue_rotation", confidence: 80, serve: "rotate", campaignId: "camp-1", adAccountId: "act-1" }), /reasoning/);
  const viewer = { userId: "dana", kind: "account_manager" as const, seesCost: true, creativeApprovalsEnabled: false };
  const pause = EXAMPLE_DECISIONS.find((card) => card.id === "D-1049");
  assert.ok(pause);
  assert.equal(seesInboxCard(pause, viewer), true);
  assert.equal(seesInboxCard(pause, { ...viewer, userId: "other" }), false);
  assert.equal(seesInboxCard(pause, { userId: "boss", kind: "super_admin", seesCost: true, creativeApprovalsEnabled: false }), true);
  assert.equal(seesInboxCard(pause, { userId: "owner", kind: "client_owner", seesCost: false, creativeApprovalsEnabled: false }), false);
  const answered = answerDecision(pause, "no");
  assert.equal(answered.executes, false);
  assert.equal(answered.writePath, null);
  assert.equal(answered.status, "declined");
  assert.equal(budgetWritePath(), null);
  const digest = fatigueDigestItems(
    [{ id: "D-1049", title: pause.title, reasoning: pause.reasoning, kind: "fatigue_pause", assigneeId: "dana", accountId: "act-1" }],
    { userId: "boss", seesAll: true },
  );
  assert.match(digest[0]?.reasoning || "", /will not pause/);
  assert.equal(CREATIVE_APPROVALS_DEFAULT, false);
  assert.equal(clientSeesCreativeApprovals(false), false);
  assert.equal(clientSeesCreativeApprovals(undefined), false);
  const creative = EXAMPLE_DECISIONS.find((card) => card.kind === "creative_approval");
  assert.ok(creative);
  assert.equal(seesInboxCard(creative, { userId: "owner", kind: "client_owner", seesCost: false, creativeApprovalsEnabled: false }), false);
  assert.equal(seesInboxCard(creative, { userId: "owner", kind: "client_owner", seesCost: false, creativeApprovalsEnabled: true }), true);
});

test("an all-clients viewer gets no fatigue or budget cards", () => {
  const hidden = { userId: "view", kind: "all_clients_viewer" as const, seesCost: false, creativeApprovalsEnabled: false };
  const hiddenWithCost = { ...hidden, seesCost: true };
  const cards = EXAMPLE_DECISIONS.filter((card) => card.kind === "fatigue_pause" || card.kind === "fatigue_rotation" || card.kind === "budget_recommendation");
  assert.equal(cards.length >= 3, true);
  for (const card of cards) {
    assert.equal(seesInboxCard(card, hidden), false, card.id);
    assert.equal(seesInboxCard(card, hiddenWithCost), false, card.id);
  }
  const pacing = { ...cards[0], id: "pace", kind: "pacing_recommendation" as const };
  assert.equal(seesInboxCard(pacing, hiddenWithCost), false);
  const budget = EXAMPLE_DECISIONS.find((card) => card.kind === "budget_recommendation");
  assert.ok(budget);
  assert.equal(seesInboxCard(budget, { userId: "s", kind: "staff", seesCost: true, creativeApprovalsEnabled: false }), true);
  assert.equal(seesInboxCard(budget, { userId: "s", kind: "staff", seesCost: false, creativeApprovalsEnabled: false }), false);
});

test("every ad recommendation is a chip and pause does not write", () => {
  const pause = recommendAd({ name: "Before/After", leads: 0, clicksChangePct: 0, frequency: 1, confidence: 71, decisionId: "D-1049", productName: "Product", credit: learned });
  assert.equal(pause.action, "pause");
  assert.equal(pause.executes, false);
  assert.equal(pause.writePath, null);
  assert.match(pause.reason, /will not pause it/);
  const rotate = recommendAd({ name: "Smile", leads: 6, clicksChangePct: -31, frequency: 4.2, confidence: 88, decisionId: "D-1042", productName: "Product", credit: learned });
  assert.equal(rotate.action, "rotate");
  assert.match(rotate.reason, /wearing out/);
  const serve = recommendAd({ name: "Consult", leads: 8, clicksChangePct: 14, frequency: 2, confidence: 84, rising: true, decisionId: "D-1048", productName: "Product", credit: learned });
  assert.equal(serve.action, "serve");
  const thin = recommendAd({ name: "New", leads: 1, clicksChangePct: null, frequency: null, confidence: 42, decisionId: "x", productName: "Product", credit: { clickDays: 7, viewDays: 1, source: "default" } });
  assert.equal(thin.action, "insufficient");
  const source = readFileSync(path.join(ROOT, "lib/marketing/channels/recommend.ts"), "utf8");
  assert.equal(source.includes("fetch("), false);
  assert.equal(source.includes("prisma"), false);
});

test("the live feed is limited to assigned clients and quiet hours hold everything except urgent email", () => {
  const dana = scopeLiveFeed(EXAMPLE_FEED, { role: "account_manager", assignedClientIds: ["harbor", "gulf", "coastal"] });
  assert.equal(dana.some((item) => item.clientId === "other"), false);
  assert.equal(scopeLiveFeed(EXAMPLE_FEED, { role: "super_admin", assignedClientIds: [] }).length, EXAMPLE_FEED.length);
  assert.equal(scopeLiveFeed(EXAMPLE_FEED, { role: "other", assignedClientIds: ["harbor"] }).length, 0);
  const night = new Date("2026-10-31T03:00:00Z");
  assert.equal(inQuietHours(night, "America/New_York"), true);
  assert.equal(deliveryPlan({ severity: "urgent" }, night, "America/New_York").channel, URGENT_CHANNEL);
  assert.equal(deliveryPlan({ severity: "decision" }, night, "America/New_York").when, "recap");
  assert.equal(toastAllowed({ clientId: "harbor", recent: [{ clientId: "harbor", at: 1_000 }], now: 20_000, dailyCount: 1 }), false);
  assert.equal(toastAllowed({ clientId: "harbor", recent: [], now: 20_000, dailyCount: 20 }), false);
  assert.equal(sameDriverMuted({ driver: "creative_fatigue", at: "2026-10-30T00:00:00Z", magnitude: 10 }, { driver: "creative_fatigue", at: "2026-10-30T06:00:00Z", magnitude: 12 }), true);
  assert.equal(sameDriverMuted({ driver: "creative_fatigue", at: "2026-10-30T00:00:00Z", magnitude: 10 }, { driver: "creative_fatigue", at: "2026-10-30T06:00:00Z", magnitude: 20 }), false);
});

test("navigation highlights settings on its page and does not mark home on the live feed", () => {
  assert.equal(navActive("/live", "/"), false);
  assert.equal(navActive("/live", "/live"), true);
  assert.equal(navActive("/", "/"), true);
  assert.equal(navActive("/settings", "/settings"), true);
  assert.equal(navActive("/settings/connections", "/settings"), true);
  assert.equal(navActive("/settings/calling", "/settings"), true);
  assert.equal(navActive("/c/all/meta", "/c/all/google-ads"), false);
  assert.equal(navActive("/decisions/D-1042", "/decisions"), true);
});

test("speed to lead starts at landing, with a labeled form-submit fallback, against a 30 second goal", () => {
  assert.equal(SPEED_GOAL_SEC, 30);
  const landed = measureSpeed({ landedAt: "2026-10-30T14:00:00Z", submittedAt: "2026-10-30T14:00:20Z", contactedAt: "2026-10-30T14:00:28Z" });
  assert.equal(landed?.from, "landing");
  assert.equal(landed?.seconds, 28);
  assert.equal(landed?.label, "28s");
  const form = measureSpeed({ landedAt: null, submittedAt: "2026-10-30T15:00:00Z", contactedAt: "2026-10-30T15:02:10Z" });
  assert.equal(form?.from, "form_submit");
  assert.equal(form?.label, "130s*");
  assert.match(form?.footnote || "", /form submit/);
  assert.equal(canMarkLead("client_viewer"), false);
  assert.equal(canMarkLead("owner"), true);
});

test("an outage pause is a dry run with no write and no auto-resume", () => {
  const plan = planOutagePause({ failedChecks: 3, adIds: ["a", "b"], client: "Gulf Pest", page: "/spring-offer", at: "2026-10-30T21:31:00-04:00" });
  assert.equal(plan.action, "dry_run");
  assert.equal(plan.write, null);
  assert.equal(plan.resume, "pending_confirmation");
  assert.match(plan.message || "", /would pause 2 ads/);
  assert.equal(planOutagePause({ failedChecks: 2, adIds: ["a"], client: "Gulf", page: "/", at: "2026-10-30T00:00:00Z" }).action, "none");
  const source = readFileSync(path.join(ROOT, "lib/marketing/channels/outage.ts"), "utf8");
  assert.equal(source.includes("performWrite"), false);
});

test("explanations name a cause only at 60% or above, and flags respect thresholds", () => {
  const clear = explainChange({
    metric: "Leads",
    current: 71,
    previous: 87,
    period: "last week",
    confidence: 88,
    campaignCount: 4,
    contributors: [{ name: "Meta ad set Retirees FL", delta: -16, depth: 3, driver: "creative_fatigue" }],
  });
  assert.equal(clear.showCause, true);
  assert.match(clear.text, /mostly from Meta ad set Retirees FL/);
  assert.match(clear.notCause || "", /Not the cause/);
  const unclear = explainChange({ metric: "Leads", current: 10, previous: 20, period: "last week", confidence: 40, campaignCount: 2, contributors: [] });
  assert.equal(unclear.showCause, false);
  assert.match(unclear.text, /Cause unclear/);
  const low = evaluateFlags({ leads: 2, clicks: 10, seesCost: true });
  assert.equal(low[0]?.kind, "low_volume");
  const anomaly = evaluateFlags({ leads: 50, priorLeads: 100, clicks: 2000, seesCost: false, thresholds: resolveThresholds({ leadsDropPct: 0.25 }) });
  assert.equal(anomaly.some((flag) => flag.kind === "anomaly"), true);
  assert.equal(anomaly.some((flag) => /cost|spend/i.test(flag.reason)), false);
});

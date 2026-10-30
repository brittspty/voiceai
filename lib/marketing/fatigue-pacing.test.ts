import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { accessFromUser } from "./access";
import { accessScopeWhere, clientMetricWhere, queuedTestingWhere, recommendationScopeWhere } from "./scope";
import { isolatedWhere } from "./workspace";
import { buildClientShare, clientShareHasMoney, clientTestingNote, forbiddenClientKeys } from "./client-view";
import { creativeFatigueEnabled, pacingRecsEnabled } from "./config";
import { alertWhere, isCostContent } from "./cost-visibility";
import { budgetCopyIsClean, decisionVisibleText, fatigueCardCopy, pacingCardCopy, visibleDecisionCards } from "./decision-ui";
import { detectFatigue, fatigueForViewer, presentFatigueSignal, type FatiguePoint } from "./fatigue";
import { fatigueAccessStatus, pacingAccessStatus, shareLinkSeesCost } from "./feature-gates";
import { allocateDayparts, BUDGET_API_SCOPE_REQUESTED, daypartAdvice, evaluatePacing, PACING_FIXED_LINE, type PacingCampaign, type SpendRow } from "./pacing";
import { decideRecommendation } from "./recommendations";
import { addDaysISO } from "../time";

const ROOT = path.resolve(import.meta.dirname, "../..");
const COST_TEXT = /cost|spend|cpc|cpm|cpa|cpl|roas|\bbudget\b|\$/i;

function fatigueRow(overrides: Partial<FatiguePoint> & Pick<FatiguePoint, "id" | "adId" | "date">): FatiguePoint {
  return {
    platform: "meta",
    adName: "Free Inspection",
    creativeVersionId: "cv1",
    creativeId: "cr1",
    headline: "Free Inspection",
    campaignId: "c1",
    campaignName: "Spring",
    adAccountId: "a1",
    impressions: 1000,
    clicks: 30,
    reach: 800,
    spend: 20,
    conversions: 2,
    leads: 2,
    ...overrides,
  };
}

function series(adId: string, start: string, days: number, overrides: Partial<FatiguePoint>) {
  return Array.from({ length: days }, (_, index) =>
    fatigueRow({ id: `${adId}-${start}-${index}`, adId, date: addDaysISO(start, index), ...overrides }),
  );
}

function campaign(overrides: Partial<PacingCampaign> & Pick<PacingCampaign, "campaignId" | "name">): PacingCampaign {
  return {
    adAccountId: "a1",
    platform: "meta",
    budgetAmount: 100,
    budgetPeriod: "daily",
    currency: "USD",
    adId: `${overrides.campaignId}-ad`,
    ...overrides,
  };
}

function spend(campaignId: string, date: string, amount: number, conversions = 1, leads = 1): SpendRow {
  return { campaignId, date, spend: amount, conversions, leads, impressions: 1000 };
}

test("creative fatigue and pacing flags default off", () => {
  assert.equal(creativeFatigueEnabled({}), false);
  assert.equal(pacingRecsEnabled({}), false);
  assert.equal(creativeFatigueEnabled({ MARKETING_CREATIVE_FATIGUE: "on" }), true);
  assert.equal(pacingRecsEnabled({ MARKETING_PACING_RECS: "on" }), true);
  assert.equal(BUDGET_API_SCOPE_REQUESTED, false);
});

test("meta creative fatigue uses frequency, CTR decay, and CPA rise", () => {
  const tired = [
    ...series("ad-tired", "2026-10-05", 7, { impressions: 1000, clicks: 40, reach: 800, spend: 20, conversions: 2 }),
    ...series("ad-tired", "2026-10-12", 7, { impressions: 2000, clicks: 20, reach: 400, spend: 40, conversions: 1 }),
  ];
  const mild = [
    ...series("ad-mild", "2026-10-05", 7, { impressions: 1000, clicks: 40, reach: 250, spend: 20, conversions: 2 }),
    ...series("ad-mild", "2026-10-12", 7, { impressions: 1000, clicks: 28, reach: 250, spend: 13, conversions: 1 }),
  ];
  const healthy = [
    ...series("ad-healthy", "2026-10-05", 7, { impressions: 1000, clicks: 30, reach: 900, spend: 20, conversions: 2 }),
    ...series("ad-healthy", "2026-10-12", 7, { impressions: 1000, clicks: 30, reach: 900, spend: 20, conversions: 2 }),
  ];
  const thin = series("ad-thin", "2026-10-17", 2, { impressions: 50, clicks: 1, reach: 10, spend: 5, conversions: 0 });
  const result = detectFatigue({ rows: [...tired, ...mild, ...healthy, ...thin], today: "2026-10-18" });
  const hit = result.flagged.find((row) => row.adId === "ad-tired");
  assert.ok(hit);
  assert.equal(hit.platform, "meta");
  assert.equal(hit.changesSpend, false);
  assert.ok(hit.reasons.includes("frequency"));
  assert.ok(hit.reasons.includes("ctr_decay"));
  assert.ok(hit.reasons.includes("cpa_rise"));
  assert.equal(hit.severity, "critical");
  assert.match(hit.publicHeadline, /people saw it 5\.0 times/);
  assert.match(hit.publicHeadline, /clicks fell 75%/);
  assert.equal(COST_TEXT.test(hit.publicHeadline), false);
  assert.equal(hit.variation?.status, "draft");
  assert.match(hit.rationale, /Current: Free Inspection/);
  assert.match(hit.rationale, /Proposed: Free Inspection — new version/);
  assert.equal(result.healthyAdIds.includes("ad-healthy"), true);
  assert.equal(result.flagged.some((row) => row.adId === "ad-healthy" || row.adId === "ad-thin"), false);
  const mildHit = result.flagged.find((row) => row.adId === "ad-mild");
  assert.equal(mildHit?.severity, "warning");
  const held = detectFatigue({
    rows: mild,
    today: "2026-10-18",
    now: "2026-10-18T15:00:00.000Z",
    previous: [{ adId: "ad-mild", severity: "warning", at: "2026-10-17T15:00:00.000Z" }],
  });
  assert.equal(held.flagged[0]?.emit, false);
  const risen = detectFatigue({
    rows: tired,
    today: "2026-10-18",
    now: "2026-10-18T15:00:00.000Z",
    previous: [{ adId: "ad-tired", severity: "warning", at: "2026-10-17T15:00:00.000Z" }],
  });
  assert.equal(risen.flagged[0]?.emit, true);
});

test("google ads rows flag fatigue from CTR decay and CPA rise without reach", () => {
  const rows = [
    ...series("ad-google", "2026-10-05", 7, { platform: "google_ads", creativeId: null, reach: 0, impressions: 1000, clicks: 40, spend: 20, conversions: 2 }),
    ...series("ad-google", "2026-10-12", 7, { platform: "google_ads", creativeId: null, reach: 0, impressions: 1000, clicks: 10, spend: 40, conversions: 1 }),
  ];
  const { flagged } = detectFatigue({ rows, today: "2026-10-18" });
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0]?.platform, "google_ads");
  assert.equal(flagged[0]?.frequency, null);
  assert.ok(flagged[0]?.reasons.includes("ctr_decay"));
  assert.ok(flagged[0]?.reasons.includes("cpa_rise"));
  assert.match(flagged[0]?.rationale ?? "", /Preview not available/);
  assert.equal(flagged[0]?.changesSpend, false);
  const view = fatigueForViewer(flagged[0]!, false);
  assert.equal(view?.reasons.includes("cpa_rise"), false);
  assert.equal(COST_TEXT.test(JSON.stringify(view)), false);
  const staff = fatigueForViewer(flagged[0]!, true);
  assert.equal(staff?.reasons.includes("cpa_rise"), true);
});

test("a falling CTR slope flags fatigue when the weekly average has not dropped 25%", () => {
  const clicks = [30, 28, 26, 22, 16, 12, 8];
  const recent = clicks.map((click, index) =>
    fatigueRow({
      id: `slope-${index}`,
      adId: "ad-slope",
      date: addDaysISO("2026-10-12", index),
      impressions: 1000,
      clicks: click,
      reach: 250,
      spend: 10,
      conversions: 1,
    }),
  );
  const prior = series("ad-slope", "2026-10-05", 7, { impressions: 1000, clicks: 22, reach: 250, spend: 10, conversions: 1 });
  const { flagged } = detectFatigue({ rows: [...prior, ...recent], today: "2026-10-18" });
  assert.equal(flagged.length, 1);
  assert.ok(flagged[0]?.reasons.includes("ctr_decay"));
  assert.ok((flagged[0]?.ctrSlope ?? 0) < 0);
  assert.equal(flagged[0]?.reasons.includes("cpa_rise"), false);
});

test("frequency alone flags a creative once people see it 8 times", () => {
  const rows = series("ad-repeat", "2026-10-12", 7, { impressions: 2000, clicks: 40, reach: 200, spend: 10, conversions: 1 });
  const { flagged } = detectFatigue({ rows, today: "2026-10-18" });
  assert.equal(flagged.length, 1);
  assert.ok((flagged[0]?.frequency ?? 0) >= 8);
  assert.ok(flagged[0]?.reasons.includes("frequency"));
  assert.equal(flagged[0]?.changesSpend, false);
});

test("cost-only fatigue is hidden from people who cannot see cost", () => {
  const hidden = presentFatigueSignal(
    { adId: "a", adName: "Ad", campaignId: "c", platform: "meta", frequency: 1.2, ctrRecent: 0.02, ctrPrior: 0.02, reasons: ["cpa_rise"], fatigued: true, cpaRisePct: 40 },
    false,
  );
  assert.equal(hidden, null);
  const shown = presentFatigueSignal(
    { adId: "a", adName: "Ad", campaignId: "c", platform: "meta", frequency: 1.2, ctrRecent: 0.02, ctrPrior: 0.02, reasons: ["cpa_rise"], fatigued: true, cpaRisePct: 40 },
    true,
  );
  assert.match(shown?.headline ?? "", /cost per result/);
});

test("pacing stays inside the human total and never writes a budget", () => {
  const onTrack = evaluatePacing({
    today: "2026-10-18",
    campaigns: [campaign({ campaignId: "track", name: "Free Inspection", budgetAmount: 5000 / 31 })],
    spend: [spend("track", "2026-10-18", 3120, 20, 20)],
  });
  assert.equal(onTrack.snapshots[0]?.status, "on_track");
  assert.equal(onTrack.snapshots[0]?.chip, "On track");
  assert.match(onTrack.snapshots[0]?.bar ?? "", /7% over/);
  assert.equal(onTrack.recommendations.length, 0);
  assert.equal(onTrack.snapshots[0]?.recommendationOnly, true);

  const warning = evaluatePacing({
    today: "2026-10-18",
    campaigns: [campaign({ campaignId: "warn", name: "Spring Tune-Up", budgetAmount: 100 })],
    spend: [spend("warn", "2026-10-18", 2016, 10, 10)],
  });
  assert.equal(warning.snapshots[0]?.status, "over");
  assert.equal(warning.snapshots[0]?.chip, "Over");
  assert.equal(warning.recommendations.length, 1);
  assert.ok(Number(warning.recommendations[0]?.proposedBudgetAmount) < Number(warning.recommendations[0]?.currentBudgetAmount));
  assert.ok(warning.recommendations[0]!.accountTotalAfter < warning.recommendations[0]!.accountTotalBefore);

  const critical = evaluatePacing({
    today: "2026-10-18",
    campaigns: [campaign({ campaignId: "hot", name: "Hot", budgetAmount: 100 })],
    spend: [spend("hot", "2026-10-18", 2340, 8, 8)],
  });
  assert.equal(critical.snapshots[0]?.status, "critical");
  assert.equal(critical.snapshots[0]?.chip, "Over · Critical");

  const early = evaluatePacing({
    today: "2026-02-10",
    campaigns: [campaign({ campaignId: "feb", name: "February", budgetAmount: 100 })],
    spend: [spend("feb", "2026-02-10", 1166.67, 4, 4)],
  });
  assert.equal(early.snapshots[0]?.status, "critical");
  assert.ok(early.snapshots[0]?.reasons.includes("runs_out_before_day_25"));

  const behind = evaluatePacing({
    today: "2026-10-18",
    campaigns: [campaign({ campaignId: "slow", name: "Slow", budgetAmount: 100 })],
    spend: [spend("slow", "2026-10-18", 1530, 20, 20)],
  });
  assert.equal(behind.snapshots[0]?.status, "under");
  assert.equal(behind.snapshots[0]?.chip, "Under");
  assert.equal(behind.recommendations.length, 0);

  const shift = evaluatePacing({
    today: "2026-10-18",
    campaigns: [
      campaign({ campaignId: "donor", name: "Spring Tune-Up", budgetAmount: 120, platform: "meta" }),
      campaign({ campaignId: "partner", name: "Free Inspection", budgetAmount: 80, platform: "meta" }),
    ],
    spend: [spend("donor", "2026-10-18", 3240, 36, 36), spend("partner", "2026-10-18", 720, 72, 72)],
  });
  const moved = shift.recommendations.find((row) => row.shifts.length === 2);
  assert.ok(moved);
  const before = moved.shifts.reduce((sum, row) => sum + row.fromDaily, 0);
  const after = moved.shifts.reduce((sum, row) => sum + row.toDaily, 0);
  assert.equal(before, after);
  assert.equal(moved.accountTotalBefore, moved.accountTotalAfter);
  assert.ok(moved.shifts[0]!.toDaily < moved.shifts[0]!.fromDaily);
  assert.ok(moved.shifts[1]!.toDaily > moved.shifts[1]!.fromDaily);
  assert.equal(moved.writesBudget, false);
  assert.equal(moved.recommendationOnly, true);
  assert.match(moved.summary, /Those daily budgets still add up to/);
  assert.match(moved.rationale, /Meta Ads Manager/);
  assert.match(moved.rationale, /will not change this budget/);
  assert.equal(moved.costPerQualifiedLead !== null, true);
  assert.ok((shift.snapshots.find((row) => row.campaignId === "donor")?.marginalCpa ?? 0) > (shift.snapshots.find((row) => row.campaignId === "partner")?.marginalCpa ?? 0));

  const google = evaluatePacing({
    today: "2026-10-18",
    campaigns: [campaign({ campaignId: "g", name: "Search", platform: "google_ads", budgetAmount: 100 })],
    spend: [spend("g", "2026-10-18", 2340, 5, 5)],
  });
  assert.equal(google.snapshots[0]?.platform, "google_ads");
  assert.match(google.recommendations[0]?.rationale ?? "", /Google Ads/);

  for (const result of [warning, critical, early, shift, google]) {
    for (const rec of result.recommendations) {
      assert.equal(rec.writesBudget, false);
      assert.equal(rec.recommendationOnly, true);
      assert.equal(rec.type, "pacing");
      assert.ok(Number(rec.proposedBudgetAmount) <= Number(rec.currentBudgetAmount) + 0.001);
      assert.ok(rec.accountTotalAfter <= rec.accountTotalBefore + 0.02);
      assert.equal(budgetCopyIsClean(rec.rationale), true);
    }
  }

  const cooled = evaluatePacing({
    today: "2026-10-18",
    now: "2026-10-18T15:00:00.000Z",
    campaigns: [campaign({ campaignId: "warn", name: "Spring Tune-Up", budgetAmount: 100 })],
    spend: [spend("warn", "2026-10-18", 2016, 10, 10)],
    previous: [{ campaignId: "warn", severity: "warning", at: "2026-10-17T15:00:00.000Z" }],
  });
  assert.equal(cooled.snapshots.length, 1);
  assert.equal(cooled.recommendations.length, 0);
  const hotter = evaluatePacing({
    today: "2026-10-18",
    now: "2026-10-18T15:00:00.000Z",
    campaigns: [campaign({ campaignId: "warn", name: "Spring Tune-Up", budgetAmount: 100 })],
    spend: [spend("warn", "2026-10-18", 2340, 8, 8)],
    previous: [{ campaignId: "warn", severity: "warning", at: "2026-10-17T15:00:00.000Z" }],
  });
  assert.equal(hotter.recommendations.length, 1);
  assert.equal(hotter.recommendations[0]?.severity, "critical");
});

test("daypart advice reallocates attention and not the budget", () => {
  const parts = allocateDayparts({
    days: [{ campaignId: "c", date: "2026-10-18", spend: 100 }],
    hours: [
      { campaignId: "c", date: "2026-10-18", hour: 2, impressions: 100, conversions: 1 },
      { campaignId: "c", date: "2026-10-18", hour: 14, impressions: 400, conversions: 8 },
    ],
  });
  const advice = daypartAdvice(parts, "c");
  assert.equal(advice?.worst, "overnight");
  assert.equal(advice?.best, "afternoon");
  const paced = evaluatePacing({
    today: "2026-10-18",
    campaigns: [campaign({ campaignId: "c", name: "Daypart", budgetAmount: 5000 / 31 })],
    spend: [spend("c", "2026-10-18", 3120, 20, 20)],
    hours: [
      { campaignId: "c", date: "2026-10-18", hour: 2, impressions: 200, conversions: 1 },
      { campaignId: "c", date: "2026-10-18", hour: 14, impressions: 800, conversions: 10 },
    ],
  });
  assert.equal(paced.snapshots[0]?.status, "on_track");
  assert.equal(paced.recommendations.length, 1);
  assert.equal(paced.recommendations[0]?.writesBudget, false);
  assert.equal(Number(paced.recommendations[0]?.proposedBudgetAmount).toFixed(2), Number(paced.recommendations[0]?.currentBudgetAmount).toFixed(2));
  assert.match(paced.recommendations[0]?.summary ?? "", /Keep the daily budget/);
  assert.match(paced.recommendations[0]?.rationale ?? "", /overnight/);
});

test("pacing and fatigue stay off client roles and share links", () => {
  assert.equal(shareLinkSeesCost(), false);
  assert.equal(pacingAccessStatus(null), 401);
  assert.equal(fatigueAccessStatus(null), 401);
  for (const kind of ["client_viewer", "owner", "admin", "viewer", "staff", "none"]) {
    assert.equal(pacingAccessStatus({ kind, seesCost: false }), 403, kind);
  }
  assert.equal(pacingAccessStatus({ kind: "account_manager", seesCost: false }), 403);
  assert.equal(pacingAccessStatus({ kind: "super_admin", seesCost: true }), 200);
  assert.equal(pacingAccessStatus({ kind: "account_manager", seesCost: true }), 200);
  assert.equal(fatigueAccessStatus({ kind: "client_viewer", seesAlerts: false }), 403);
  assert.equal(fatigueAccessStatus({ kind: "staff", seesAlerts: false }), 403);
  assert.equal(fatigueAccessStatus({ kind: "none", seesAlerts: false }), 403);
  assert.equal(fatigueAccessStatus({ kind: "staff", seesAlerts: true }), 200);
  assert.equal(fatigueAccessStatus({ kind: "account_manager", seesAlerts: true }), 200);
  const note = clientTestingNote(true);
  const view = buildClientShare({
    client: "Acme",
    adViews: 100,
    leads: 4,
    booked: 1,
    campaigns: [{ name: "Leads", channel: "Meta", leads: 4, booked: 1 }],
    notes: [note],
  });
  assert.equal(note, "New ad version testing");
  assert.equal(clientTestingNote(false), "");
  assert.deepEqual(forbiddenClientKeys(view), []);
  assert.equal(clientShareHasMoney(view), false);
  assert.equal(COST_TEXT.test(JSON.stringify(view)), false);
  const share = readFileSync(path.join(ROOT, "app/api/share/[token]/route.ts"), "utf8");
  const client = readFileSync(path.join(ROOT, "app/api/marketing/client/route.ts"), "utf8");
  assert.equal(share.includes("loadPacingBoard"), false);
  assert.equal(share.includes("loadFatigueBoard"), false);
  assert.equal(client.includes("loadPacingBoard"), false);
  const queries = readFileSync(path.join(ROOT, "lib/marketing/queries.ts"), "utf8");
  const clientFn = queries.slice(queries.indexOf("export async function loadClientPerformance"), queries.indexOf("export async function recordClientView"));
  assert.equal(clientFn.includes("spend"), false);
  assert.equal(clientFn.includes("cpa"), false);
  assert.equal(clientFn.includes("budgetAmount"), false);
  assert.match(clientFn, /clientMetricWhere\(/);
  assert.match(clientFn, /queuedTestingWhere\(/);
  assert.ok(clientFn.indexOf("clientMetricWhere") < clientFn.indexOf("take: 200"));
  assert.equal(isCostContent({ type: "pacing", metric: "pacing", title: "Pace" }), true);
  assert.ok(alertWhere(false).code && "notIn" in alertWhere(false).code && alertWhere(false).code.notIn?.includes("pacing_over"));
  const cards = visibleDecisionCards(
    [
      { type: "pacing", metric: "pacing" },
      { type: "creative_fatigue", metric: "frequency" },
      { type: "creative_fatigue", metric: "cpa" },
      { type: "traffic", metric: "ctr" },
    ],
    { seesCost: false, monitor: true, fatigue: true, pacing: true },
  );
  assert.deepEqual(cards.map((card) => `${card.type}:${card.metric}`), ["creative_fatigue:frequency", "traffic:ctr"]);
  const staff = visibleDecisionCards([{ type: "pacing", metric: "pacing" }], { seesCost: true, monitor: false, fatigue: false, pacing: true });
  assert.equal(staff.length, 1);
});

test("accepting pacing or fatigue does not write a budget", async () => {
  const access = accessFromUser({ id: "am", email: "am@example.com", role: "account_manager" }, [{ workspaceId: "org", scopeKind: "client", adAccountId: null, campaignId: null }], {});
  const store = { async write() { throw new Error("wrote a budget"); } };
  for (const type of ["pacing", "creative_fatigue"]) {
    const result = await decideRecommendation({
      actor: { kind: "human", access },
      recommendation: {
        id: type,
        type,
        status: "verified",
        campaignId: "c1",
        adAccountId: "a1",
        proposedBudgetAmount: "80.0000",
        proposedBudgetPeriod: "daily",
        proposedCurrency: "USD",
      },
      decision: "accept",
      budgetStore: store,
    });
    assert.equal(result.status, "accepted");
    assert.equal(result.budgetWrite, "none");
  }
  const copy = pacingCardCopy({
    id: "1",
    type: "pacing",
    status: "verified",
    title: "Spring Tune-Up will overspend by about $370 this month.",
    summary: "Lower the daily budget.",
    rationale: "1. Open Meta Ads Manager › Campaigns.\n2. Set Daily budget to $105.\n3. Do this yourself. The platform will not change this budget.",
    metric: "pacing",
    baseline: "1",
    observed: "2",
    windowStart: "2026-10-01",
    windowEnd: "2026-10-31",
    sampleSize: 18,
    sourceCount: 1,
  });
  assert.match(copy.tag, /Recommendation only/);
  assert.equal(copy.fixed, PACING_FIXED_LINE);
  assert.match(decisionVisibleText({ ...copy, id: "1", type: "pacing", status: "verified", title: copy.headline, summary: copy.why, rationale: "1. Open Meta Ads Manager.", metric: "pacing", baseline: "1", observed: "2", windowStart: "", windowEnd: "", sampleSize: 18, sourceCount: 1 }), /Recommendation only/);
  const fatigue = fatigueCardCopy({
    id: "2",
    type: "creative_fatigue",
    status: "verified",
    title: "'Free Inspection' is wearing out: people saw it 4.2 times and clicks fell 38% in 7 days.",
    summary: "Approve a new version to test against it.",
    rationale: "Current: Free Inspection\nProposed: Free Inspection — new version\nApproving queues a draft for a person to upload. Nothing goes live on its own.",
    metric: "frequency",
    baseline: "3.5",
    observed: "4.2",
    windowStart: "2026-10-12",
    windowEnd: "2026-10-18",
    sampleSize: 1000,
    sourceCount: 7,
  });
  assert.match(fatigue.tag, /Creative tired/);
  assert.equal(fatigue.current, "Free Inspection");
  assert.match(fatigue.proposed, /new version/);
  assert.equal(COST_TEXT.test(fatigue.fixed), false);
  const missing = fatigueCardCopy({ ...fatigue, id: "3", type: "creative_fatigue", status: "verified", title: fatigue.headline, summary: fatigue.fix, rationale: "Preview not available\nApproving queues a draft for a person to upload. Nothing goes live on its own.", metric: "frequency", baseline: "1", observed: "2", windowStart: "", windowEnd: "", sampleSize: 10, sourceCount: 1 });
  assert.equal(missing.current, "Preview not available");
});

test("fatigue and pacing stay inside the caller workspace and ad account", () => {
  const start = new Date("2026-10-01T00:00:00.000Z");
  const end = new Date("2026-10-18T00:00:00.000Z");
  const noteA = queuedTestingWhere("client-a", ["acct-a"]);
  const noteB = queuedTestingWhere("client-b", ["acct-b"]);
  assert.equal(noteA.workspaceId, "client-a");
  assert.equal(noteB.workspaceId, "client-b");
  assert.equal(JSON.stringify(noteA).includes("client-b"), false);
  assert.equal(JSON.stringify(noteA).includes("acct-b"), false);
  assert.equal(JSON.stringify(noteB).includes("acct-a"), false);
  assert.equal(noteA.status, "queued");
  const metricsA = clientMetricWhere("client-a", ["acct-a"], start, end);
  const metricsB = clientMetricWhere("client-b", "all", start, end);
  assert.equal(metricsA.workspaceId, "client-a");
  assert.equal(JSON.stringify(metricsA).includes("acct-a"), true);
  assert.equal(JSON.stringify(metricsA).includes("client-b"), false);
  assert.equal(metricsB.workspaceId, "client-b");
  assert.equal(JSON.stringify(metricsB).includes("acct-a"), false);
  const boardA = accessScopeWhere({ workspaceId: "client-a", kind: "account_manager", accounts: ["acct-a"], campaigns: "all" });
  const boardB = accessScopeWhere({ workspaceId: "client-b", kind: "account_manager", accounts: ["acct-b"], campaigns: "all" });
  assert.deepEqual(boardA, { workspaceId: "client-a", adAccountId: { in: ["acct-a"] } });
  assert.deepEqual(boardB, { workspaceId: "client-b", adAccountId: { in: ["acct-b"] } });
  const campaignScoped = accessScopeWhere({ workspaceId: "client-a", kind: "account_manager", accounts: ["acct-a"], campaigns: ["camp-a"] });
  assert.deepEqual(campaignScoped, { workspaceId: "client-a", campaignId: { in: ["camp-a"] } });
  assert.deepEqual(recommendationScopeWhere({ workspaceId: "client-a", kind: "account_manager", accounts: ["acct-a"], campaigns: "all" }, { type: "pacing" }), {
    type: "pacing",
    adAccountId: { in: ["acct-a"] },
    campaign: { workspaceId: "client-a" },
  });
  assert.throws(() => isolatedWhere("client-a", { workspaceId: "client-b" }), /workspace mismatch/);
  for (const file of ["lib/marketing/fatigue-job.ts", "lib/marketing/pacing-job.ts"]) {
    const text = readFileSync(path.join(ROOT, file), "utf8");
    assert.equal(text.includes("WORKSPACE_ID"), false, file);
    assert.match(text, /isolatedWhere\(/, file);
    assert.match(text, /adAccount\.findMany/, file);
  }
  const fatigueBoard = readFileSync(path.join(ROOT, "lib/marketing/fatigue-job.ts"), "utf8");
  const fatigueFn = fatigueBoard.slice(fatigueBoard.indexOf("export async function loadFatigueBoard"));
  assert.ok(fatigueFn.indexOf("accessScopeWhere") < fatigueFn.indexOf("take: 300"));
  assert.equal(fatigueFn.includes("coversCampaign"), false);
  const pacingBoard = readFileSync(path.join(ROOT, "lib/marketing/pacing-job.ts"), "utf8");
  const pacingFn = pacingBoard.slice(pacingBoard.indexOf("export async function loadPacingBoard"));
  assert.ok(pacingFn.indexOf("accessScopeWhere") < pacingFn.indexOf("take: 200"));
  assert.equal(pacingFn.includes("coversCampaign"), false);
});

test("fatigue and pacing code paths do not write budgets and migrations are unique", () => {
  const files = [
    "lib/marketing/fatigue.ts",
    "lib/marketing/pacing.ts",
    "lib/marketing/fatigue-job.ts",
    "lib/marketing/pacing-job.ts",
    "app/api/marketing/pacing/route.ts",
    "app/api/marketing/fatigue/route.ts",
    "worker/index.ts",
  ];
  for (const file of files) {
    const text = readFileSync(path.join(ROOT, file), "utf8");
    assert.equal(text.includes("setCampaignBudget"), false, file);
    assert.equal(text.includes("prisma.campaign.update"), false, file);
    assert.equal(/CampaignBudgetService|customers\.mutate|adwords/.test(text), false, file);
  }
  for (const file of ["app/api/marketing/pacing/route.ts", "app/api/marketing/fatigue/route.ts"]) {
    const text = readFileSync(path.join(ROOT, file), "utf8");
    assert.equal(text.includes("export async function POST"), false, file);
    assert.equal(text.includes("export function POST"), false, file);
  }
  const actions = readFileSync(path.join(ROOT, "lib/marketing/human-actions.ts"), "utf8");
  const confirm = actions.slice(actions.indexOf('decision === "confirm"'), actions.indexOf("const choice"));
  assert.equal(confirm.includes("setCampaignBudget"), false);
  assert.match(confirm, /pacing/);
  assert.equal(/status:\s*"live"/.test(actions), false);
  assert.equal(/status:\s*"live"/.test(readFileSync(path.join(ROOT, "lib/marketing/fatigue-job.ts"), "utf8")), false);
  const names = readdirSync(path.join(ROOT, "prisma/migrations")).filter((name) => statSync(path.join(ROOT, "prisma/migrations", name)).isDirectory());
  assert.equal(new Set(names).size, names.length);
  const stamps = names.map((name) => name.slice(0, 14));
  assert.equal(new Set(stamps).size, stamps.length);
  assert.ok(names.includes("20261030161500_creative_fatigue"));
  assert.ok(names.includes("20261030161600_pacing_snapshots"));
  const pacingSql = readFileSync(path.join(ROOT, "prisma/migrations/20261030161600_pacing_snapshots/migration.sql"), "utf8");
  assert.match(pacingSql, /recommendationOnly" = true/);
  assert.match(pacingSql, /ADD VALUE 'pacing'/);
  const fatigueSql = readFileSync(path.join(ROOT, "prisma/migrations/20261030161500_creative_fatigue/migration.sql"), "utf8");
  assert.match(fatigueSql, /ADD VALUE 'creative_fatigue'/);
  assert.match(fatigueSql, /CREATE TABLE "FatigueSignal"/);
});

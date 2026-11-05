import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { addDaysISO } from "../../time";
import { clientViewerAllowed } from "../client-gate";
import { decisionsV1Enabled } from "../config";
import { visibleDecisionCards } from "../decision-ui";
import { normalizeAppName } from "./apps";
import { canActOnDecisions, decisionsRequestStatus, decisionsView, rejectsDecisionsRequest } from "./access";
import { planCollapse } from "./collapse";
import { planDuplicatePairs } from "./fold";
import { decisionSubject, formatMultiple, formatPercent, metricTitle, rateSummary } from "./labels";
import { recommendationDedupeKey } from "./key";
import { filterDecisionRows, groupDecisions, isCostDecision, presentDecisions, viewerLine, visibleDecisionActions, type DecisionCard } from "./present";
import {
  CONVERSION_MIN_CLICKS,
  CONVERSION_MIN_PRIOR,
  CTR_MIN_IMPRESSIONS,
  evaluateDecisionRules,
  FREQUENCY_CAP_DEFAULT,
  GAP_MIN_CLICKS,
  GAP_MIN_IMPRESSIONS,
  OUTLIER_MIN_IMPRESSIONS,
  type AlertSlice,
  type BreakdownSlice,
  type CtvDaySlice,
  type DailySlice,
} from "./rules";
import { applyUpsert, earlierRecommendationId, selectOpenRecommendation, type OpenRecommendation } from "./upsert";
import { AUTOMATED_CTR, BARE_CTR, BARE_MIN_CLICKS, BARE_MIN_DAYS, COST_BASELINE_RATIO, CTR_BASELINE_RATIO, RATE_MIN_CLICKS, RATE_MIN_IMPRESSIONS, RATE_WINDOW_DAYS, evaluateAds, type MetricPoint } from "../monitor";
import { planDecision } from "./workflow";

const END = "2026-11-04";
const ROOT = path.resolve(import.meta.dirname, "../../..");

function day(date: string, patch: Partial<DailySlice> = {}): DailySlice {
  return {
    id: `metric-${date}`,
    campaignId: "camp-pine",
    campaignName: "Pine Search",
    clientId: "client-pine",
    clientName: "Pine Street Dental",
    status: "active",
    date,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    ...patch,
    date,
  };
}

function span(start: string, count: number, patch: Partial<DailySlice> = {}) {
  return Array.from({ length: count }, (_, index) => day(addDaysISO(start, index), { ...patch, id: `${patch.id || "metric"}-${index}` }));
}

function openRow(id: string, createdAt: string, patch: Partial<OpenRecommendation> = {}): OpenRecommendation {
  return {
    id,
    dedupeKey: "performance|client-pine|camp-pine|ad-pine|ctr_off",
    status: "verified",
    decidedById: null,
    decidedAt: null,
    archivedAt: null,
    createdAt,
    evidence: { metric: "ctr" },
    lastSeenAt: createdAt,
    ...patch,
  };
}

test("DECISIONS_V1 defaults off and the old decisions screen stays", () => {
  assert.equal(decisionsV1Enabled({}), false);
  assert.equal(decisionsV1Enabled({ DECISIONS_V1: "on" }), true);
  assert.equal(decisionsView({}), "examples");
  assert.equal(decisionsView({ MARKETING_CLIENT_SWITCHER: "on" }), "empty");
  assert.equal(decisionsView({ DECISIONS_V1: "on", MARKETING_CLIENT_SWITCHER: "on" }), "v1");
  const hidden = visibleDecisionCards(
    [{ type: "ctr_drift", metric: "ctr" }, { type: "performance", metric: "ctr" }],
    { seesCost: true, monitor: true, fatigue: false, pacing: false },
  );
  assert.deepEqual(hidden.map((card) => card.type), ["performance"]);
  const page = readFileSync(path.join(ROOT, "app/(app)/decisions/page.tsx"), "utf8");
  assert.match(page, /decisionsView/);
  assert.match(page, /RealEmpty/);
  assert.match(page, /DecisionsInbox/);
  assert.match(page, /No data yet/);
});

test("dedupe upserts one open recommendation per key", () => {
  const key = recommendationDedupeKey({ type: "ctr_drift", clientId: "client-pine", campaignId: "camp-pine", adId: "", rule: "ctr_drift" });
  const first = applyUpsert([], { dedupeKey: key, evidence: { observed: "0.0800" } }, "2026-11-04T00:00:00.000Z", (id) => openRow(id, "2026-11-04T00:00:00.000Z", { dedupeKey: key, evidence: { observed: "0.0800" } }));
  assert.equal(first.action, "insert");
  assert.equal(first.rows.length, 1);
  const second = applyUpsert(first.rows, { dedupeKey: key, evidence: { observed: "0.0700" } }, "2026-11-05T00:00:00.000Z", (id) => openRow(id, "2026-11-05T00:00:00.000Z", { dedupeKey: key }));
  assert.equal(second.action, "update");
  assert.equal(second.rows.length, 1);
  assert.equal(second.id, first.id);
  assert.equal((second.rows[0]?.evidence as { observed: string }).observed, "0.0700");
  assert.equal(second.rows[0]?.lastSeenAt, "2026-11-05T00:00:00.000Z");
  const decided = [openRow("kept", "2026-11-01T00:00:00.000Z", { dedupeKey: key, status: "dismissed", decidedById: "person-1", decidedAt: "2026-11-01T00:00:00.000Z" })];
  assert.equal(selectOpenRecommendation(decided, key), null);
  assert.equal(selectOpenRecommendation([openRow("blank", "2026-11-01T00:00:00.000Z", { dedupeKey: "" })], ""), null);
});

test("collapse dry run keeps the newest row and every decided row", () => {
  const key = "traffic|client-pine|camp-pine|ad-pine|ctr_without_results";
  const plan = planCollapse(
    [
      { id: "older", dedupeKey: key, createdAt: "2026-10-01T00:00:00.000Z", status: "verified", decidedById: null, decidedAt: null },
      { id: "newest", dedupeKey: key, createdAt: "2026-11-04T00:00:00.000Z", status: "verified", decidedById: null, decidedAt: null },
      { id: "decided", dedupeKey: key, createdAt: "2026-09-01T00:00:00.000Z", status: "accepted", decidedById: "person-1", decidedAt: "2026-09-02T00:00:00.000Z" },
    ],
    {},
  );
  assert.equal(plan.dryRun, true);
  assert.equal(plan.deletes, 0);
  assert.deepEqual(plan.keep.sort(), ["decided", "newest"]);
  assert.deepEqual(plan.archive, ["older"]);
  const alerts = planCollapse(
    [
      { id: "alert-old", dedupeKey: "ad-pine|ctr_off", createdAt: "2026-10-01T00:00:00.000Z", status: "verified", decidedById: null, decidedAt: null },
      { id: "alert-new", dedupeKey: "ad-pine|ctr_off", createdAt: "2026-11-04T00:00:00.000Z", status: "verified", decidedById: null, decidedAt: null },
    ],
    { apply: true },
  );
  assert.equal(alerts.dryRun, false);
  assert.deepEqual(alerts.keep, ["alert-new"]);
  assert.deepEqual(alerts.archive, ["alert-old"]);
  const source = readFileSync(path.join(ROOT, "scripts/collapse-duplicate-recommendations.ts"), "utf8");
  assert.match(source, /--apply/);
  assert.match(source, /Dry run/);
  assert.match(source, /Jason/);
  assert.equal(source.includes("deleteMany"), false);
  assert.equal(source.includes(".delete("), false);
});

test("CTR and conversion drift fire only past the sample and drop thresholds", () => {
  const priorStart = "2026-10-08";
  const recentStart = "2026-10-22";
  const prior = span(priorStart, 14, { impressions: CTR_MIN_IMPRESSIONS, clicks: 100, conversions: 10, id: "prior" });
  const recentDrop = span(recentStart, 14, { impressions: CTR_MIN_IMPRESSIONS, clicks: 75, conversions: 10, id: "recent" });
  const fired = evaluateDecisionRules({ end: END, daily: [...prior, ...recentDrop] }).filter((row) => row.rule === "ctr_drift");
  assert.equal(fired.length, 1);
  assert.equal(fired[0]?.writesAds, false);
  assert.equal(fired[0]?.changesSpend, false);
  assert.equal(fired[0]?.budgetWrite, "none");
  assert.equal(fired[0]?.evidence.spend, undefined);
  const slight = span(recentStart, 14, { impressions: CTR_MIN_IMPRESSIONS, clicks: 76, conversions: 10, id: "slight" });
  assert.equal(evaluateDecisionRules({ end: END, daily: [...prior, ...slight] }).some((row) => row.rule === "ctr_drift"), false);
  const small = [day(recentStart, { impressions: CTR_MIN_IMPRESSIONS - 1, clicks: 10, conversions: 0, id: "small" })];
  assert.equal(evaluateDecisionRules({ end: END, daily: [...prior, ...small] }).some((row) => row.rule === "ctr_drift"), false);

  const convPrior = span(priorStart, 14, { impressions: 2000, clicks: CONVERSION_MIN_CLICKS, conversions: CONVERSION_MIN_PRIOR, id: "cp" });
  const convDrop = span(recentStart, 14, { impressions: 2000, clicks: CONVERSION_MIN_CLICKS, conversions: 3, id: "cr" });
  const conversion = evaluateDecisionRules({ end: END, daily: [...convPrior, ...convDrop] }).filter((row) => row.rule === "conversion_drift");
  assert.equal(conversion.length, 1);
  assert.equal(conversion[0]?.clientName, "Pine Street Dental");
  const convHold = span(recentStart, 14, { impressions: 2000, clicks: CONVERSION_MIN_CLICKS, conversions: 4, id: "ch" });
  assert.equal(evaluateDecisionRules({ end: END, daily: [...convPrior, ...convHold] }).some((row) => row.rule === "conversion_drift"), false);
  const thinPrior = [day(priorStart, { impressions: 2000, clicks: CONVERSION_MIN_CLICKS, conversions: CONVERSION_MIN_PRIOR - 1, id: "thin" })];
  assert.equal(evaluateDecisionRules({ end: END, daily: [...thinPrior, ...convDrop] }).some((row) => row.rule === "conversion_drift"), false);
});

test("pixel gap, stale campaigns, CTV frequency, and outliers respect their thresholds", () => {
  const gapStart = "2026-10-22";
  const quiet = [
    day(gapStart, { impressions: GAP_MIN_IMPRESSIONS / 2, clicks: GAP_MIN_CLICKS / 2, conversions: 0, id: "gap-a" }),
    day(END, { impressions: GAP_MIN_IMPRESSIONS / 2, clicks: GAP_MIN_CLICKS / 2, conversions: 0, id: "gap-b" }),
  ];
  const gap = evaluateDecisionRules({ end: END, daily: quiet }).filter((row) => row.type === "conversion_gap");
  assert.equal(gap.length, 2);
  assert.ok(gap.some((row) => row.rule === "conversion_gap"));
  assert.ok(gap.some((row) => row.rule === "conversion_gap_client"));
  const short = [day(END, { impressions: GAP_MIN_IMPRESSIONS, clicks: GAP_MIN_CLICKS, conversions: 0 })];
  assert.equal(evaluateDecisionRules({ end: END, daily: short }).some((row) => row.type === "conversion_gap"), false);
  const converted = [
    day(gapStart, { impressions: GAP_MIN_IMPRESSIONS / 2, clicks: GAP_MIN_CLICKS / 2, conversions: 1, id: "hit-a" }),
    day(END, { impressions: GAP_MIN_IMPRESSIONS / 2, clicks: GAP_MIN_CLICKS / 2, conversions: 0, id: "hit-b" }),
  ];
  assert.equal(evaluateDecisionRules({ end: END, daily: converted }).some((row) => row.type === "conversion_gap"), false);

  const stale = evaluateDecisionRules({
    end: END,
    daily: [
      day(addDaysISO(END, -5), { campaignId: "camp-pine", conversions: 4, impressions: 100, id: "stale-pine" }),
      day(addDaysISO(END, -20), { campaignId: "camp-cedar", campaignName: "Cedar Storm", clientId: "client-pine", conversions: 1, impressions: 50, id: "stale-cedar" }),
    ],
  }).filter((row) => row.rule === "stale_campaign");
  const pine = stale.find((row) => row.campaignId === "camp-pine");
  const cedar = stale.find((row) => row.campaignId === "camp-cedar");
  assert.equal(pine?.severity, "high");
  assert.equal(cedar?.severity, "warning");
  assert.equal(evaluateDecisionRules({ end: END, daily: [day(addDaysISO(END, -4), { id: "fresh" })] }).some((row) => row.rule === "stale_campaign"), false);
  assert.equal(evaluateDecisionRules({ end: END, daily: [day(addDaysISO(END, -31), { id: "old" })] }).some((row) => row.rule === "stale_campaign"), false);
  assert.equal(
    evaluateDecisionRules({ end: END, daily: [day(addDaysISO(END, -10), { status: "paused", id: "paused" })] }).some((row) => row.rule === "stale_campaign"),
    false,
  );

  const ctv = (impressions: number, unique: number, example = false): CtvDaySlice => ({
    clientId: "client-pine",
    clientName: "Pine Street Dental",
    campaignId: "ctv-ext-1",
    campaignName: "Pine Connected TV",
    date: END,
    impressions,
    uniqueImpressions: unique,
    exampleData: example,
  });
  const hot = evaluateDecisionRules({ end: END, frequencyCap: FREQUENCY_CAP_DEFAULT, ctvDays: [ctv(5001, 1000)] }).filter((row) => row.rule === "ctv_frequency");
  assert.equal(hot.length, 1);
  assert.match(hot[0]?.summary || "", /3 to 4/);
  assert.match(hot[0]?.summary || "", /household/);
  assert.equal(hot[0]?.evidence.spend, undefined);
  assert.equal(evaluateDecisionRules({ end: END, ctvDays: [ctv(5000, 1000)] }).some((row) => row.rule === "ctv_frequency"), false);
  assert.equal(evaluateDecisionRules({ end: END, ctvDays: [ctv(9000, 999)] }).some((row) => row.rule === "ctv_frequency"), false);
  assert.equal(evaluateDecisionRules({ end: END, ctvDays: [ctv(9000, 1000, true)] }).some((row) => row.rule === "ctv_frequency"), false);

  const breakdowns: BreakdownSlice[] = [
    { clientId: "client-pine", clientName: "Pine Street Dental", dimension: "app", name: "Tubi", impressions: 4000, visits: 1 },
    { clientId: "client-pine", clientName: "Pine Street Dental", dimension: "app", name: "Tubi - Free Movies & TV", impressions: 4000, visits: 1 },
    { clientId: "client-pine", clientName: "Pine Street Dental", dimension: "app", name: "Tubi: Free Movies & Live TV", impressions: 2000, visits: 1 },
    { clientId: "client-pine", clientName: "Pine Street Dental", dimension: "app", name: "Harbor Stream", impressions: OUTLIER_MIN_IMPRESSIONS, visits: 80 },
  ];
  const outliers = evaluateDecisionRules({ end: END, breakdowns }).filter((row) => row.rule === "ctv_outlier");
  assert.equal(outliers.length, 1);
  assert.equal(outliers[0]?.evidence.name, "Tubi");
  const even: BreakdownSlice[] = [
    { clientId: "client-pine", clientName: "Pine Street Dental", dimension: "publisher", name: "Harbor Stream", impressions: OUTLIER_MIN_IMPRESSIONS, visits: 10 },
    { clientId: "client-pine", clientName: "Pine Street Dental", dimension: "publisher", name: "Northline News", impressions: OUTLIER_MIN_IMPRESSIONS, visits: 10 },
  ];
  assert.equal(evaluateDecisionRules({ end: END, breakdowns: even }).some((row) => row.rule === "ctv_outlier"), false);
  const tiny: BreakdownSlice[] = [
    { clientId: "client-pine", clientName: "Pine Street Dental", dimension: "app", name: "Tubi", impressions: OUTLIER_MIN_IMPRESSIONS - 1, visits: 0 },
    { clientId: "client-pine", clientName: "Pine Street Dental", dimension: "app", name: "Harbor Stream", impressions: OUTLIER_MIN_IMPRESSIONS, visits: 50 },
  ];
  assert.equal(evaluateDecisionRules({ end: END, breakdowns: tiny }).some((row) => row.evidence.name === "Tubi"), false);
});

test("app names normalize before outlier grouping", () => {
  assert.equal(normalizeAppName("Tubi"), "Tubi");
  assert.equal(normalizeAppName("Tubi - Free Movies & TV"), "Tubi");
  assert.equal(normalizeAppName("Tubi: Free Movies & Live TV"), "Tubi");
  assert.equal(normalizeAppName("  Harbor Stream: Live  "), "Harbor Stream");
});

test("deduped ad alerts fold into one item per ad, metric, and window", () => {
  const alert = (id: string, patch: Partial<AlertSlice> = {}): AlertSlice => ({
    id,
    adId: id,
    adName: "Pine Smile",
    campaignId: "camp-pine",
    clientId: "client-pine",
    clientName: "Pine Street Dental",
    code: "ctr_off",
    severity: "warning",
    title: "Fewer clicks than the other ads",
    metric: "ctr",
    baseline: "0.0200",
    observed: "0.0100",
    windowStart: "2026-11-03",
    windowEnd: END,
    sampleSize: 1000,
    sourceMetricIds: [`src-${id}`],
    ...patch,
  });
  const folded = evaluateDecisionRules({
    end: END,
    alerts: [alert("ad-1"), alert("ad-2", { severity: "critical" }), alert("ad-3", { archivedAt: "2026-11-01", adId: "ad-3" })],
  }).filter((row) => row.rule === "ctr_off" || row.rule.startsWith("ad_alert:"));
  assert.equal(folded.length, 2);
  assert.deepEqual(folded.map((row) => row.adId).sort(), ["ad-1", "ad-2"]);
  assert.equal(folded.some((row) => row.rule.startsWith("ad_alert:")), false);
  assert.ok(folded.every((row) => Array.isArray(row.evidence.alertIds)));
  assert.equal(folded.every((row) => row.writesAds === false), true);
  const odd = evaluateDecisionRules({
    end: END,
    alerts: [
      alert("ad-1", { code: "odd_hours", title: "Odd hours" }),
      alert("ad-2", { code: "odd_hours", title: "Odd hours" }),
    ],
  }).filter((row) => row.type === "ad_underperformance");
  assert.equal(odd.length, 1);
  assert.match(odd[0]?.title || "", /^Campaign \(2 ads\):/);
  assert.equal((odd[0]?.title || "").startsWith("2 ads:"), false);
});

test("approve, dismiss, and snooze save an audit and do not execute", () => {
  const approved = planDecision({
    recommendationId: "rec-1",
    action: "approve",
    note: "Will change the creative by hand",
    today: END,
    userId: "person-1",
    at: "2026-11-04T15:00:00.000Z",
    rule: "ctr_drift",
  });
  assert.equal(approved.ok, true);
  if (!approved.ok) return;
  assert.equal(approved.executes, false);
  assert.equal(approved.platformWrite, false);
  assert.equal(approved.budgetWrite, "none");
  assert.equal(approved.writesAds, false);
  assert.equal(approved.status, "accepted");
  assert.equal(approved.audit.userId, "person-1");
  assert.equal(approved.audit.at, "2026-11-04T15:00:00.000Z");
  assert.equal(approved.audit.note, "Will change the creative by hand");
  assert.ok(approved.steps.length > 0);
  const budget = planDecision({
    recommendationId: "rec-budget",
    action: "approve",
    today: END,
    userId: "person-1",
    at: "2026-11-04T15:00:00.000Z",
    rule: "budget_change",
  });
  assert.equal(budget.ok, true);
  if (budget.ok) assert.match(budget.steps.join(" "), /does not write a budget/);
  assert.equal(planDecision({ recommendationId: "rec-1", action: "dismiss", today: END, userId: "person-1", at: "2026-11-04T15:00:00.000Z", rule: "ctr_drift" }).ok, false);
  const dismissed = planDecision({
    recommendationId: "rec-1",
    action: "dismiss",
    reason: "Already fixed",
    note: "Checked the pixel",
    today: END,
    userId: "person-1",
    at: "2026-11-04T16:00:00.000Z",
    rule: "conversion_gap",
  });
  assert.equal(dismissed.ok, true);
  if (dismissed.ok) {
    assert.equal(dismissed.status, "dismissed");
    assert.equal(dismissed.audit.reason, "Already fixed");
    assert.equal(dismissed.audit.userId, "person-1");
  }
  const snoozed = planDecision({
    recommendationId: "rec-1",
    action: "snooze",
    snoozeUntil: "2026-11-18",
    note: "Look again after the holiday",
    today: END,
    userId: "person-1",
    at: "2026-11-04T17:00:00.000Z",
    rule: "stale_campaign",
  });
  assert.equal(snoozed.ok, true);
  if (snoozed.ok) {
    assert.equal(snoozed.status, "verified");
    assert.equal(snoozed.snoozedUntil, "2026-11-18");
    assert.equal(snoozed.audit.note, "Look again after the holiday");
    assert.equal(snoozed.executes, false);
  }
  assert.equal(
    planDecision({ recommendationId: "rec-1", action: "snooze", snoozeUntil: "2026-11-01", today: END, userId: "person-1", at: "2026-11-04T17:00:00.000Z", rule: "stale_campaign" }).ok,
    false,
  );
  assert.equal(planDecision({ recommendationId: "rec-1", action: "resolve", today: END, userId: "person-1", at: "2026-11-04T18:00:00.000Z", rule: "ctr_drift" }).ok, false);
  const resolved = planDecision({
    recommendationId: "rec-1",
    action: "resolve",
    note: "Paused the ad in the platform",
    today: END,
    userId: "person-1",
    at: "2026-11-04T18:00:00.000Z",
    rule: "ctr_drift",
  });
  assert.equal(resolved.ok, true);
  if (resolved.ok) {
    assert.equal(resolved.status, "resolved");
    assert.equal(resolved.audit.action, "resolve");
    assert.equal(resolved.audit.note, "Paused the ad in the platform");
    assert.equal(resolved.executes, false);
    assert.equal(resolved.budgetWrite, "none");
  }
  const actions = readFileSync(path.join(ROOT, "lib/marketing/decisions/actions.ts"), "utf8");
  assert.match(actions, /planDecision/);
  assert.match(actions, /decisionAudit.create/);
  assert.equal(actions.includes("setCampaignBudget"), false);
  assert.equal(actions.includes("budgetStore"), false);
});

test("spend is stripped and clients, share links, plans, and exports are denied", () => {
  const card = (patch: Partial<DecisionCard>): DecisionCard => ({
    id: "rec-1",
    type: "ctr_drift",
    rule: "ctr_drift",
    status: "verified",
    severity: "warning",
    clientId: "client-pine",
    clientName: "Pine Street Dental",
    campaignId: "camp-pine",
    campaignName: "Pine Search",
    campaignStatus: "active",
    title: "Pine Search click rate fell",
    summary: "Click rate is lower.",
    rationale: "Two windows.",
    metric: "ctr",
    baseline: "0.1000",
    observed: "0.0700",
    windowStart: "2026-10-22",
    windowEnd: END,
    sampleSize: 1000,
    sourceMetricIds: ["metric-1"],
    evidence: { impressions: 1000, spend: 40, cpa: 12, roas: 1.4 },
    recency: "2026-11-04T00:00:00.000Z",
    snoozedUntil: null,
    archivedAt: null,
    steps: ["Review it."],
    ...patch,
  });
  const stripped = presentDecisions(
    [card({}), card({ id: "cost", type: "performance", metric: "cpa", title: "Result cost rose" }), card({ id: "return", metric: "roas", type: "roi", title: "Return" })],
    { seesCost: false, hasLeadValue: false },
  );
  assert.equal(stripped.length, 1);
  assert.equal(stripped[0]?.evidence.spend, undefined);
  assert.equal(stripped[0]?.evidence.cpa, undefined);
  assert.equal(stripped[0]?.evidence.roas, undefined);
  assert.equal(stripped[0]?.evidence.impressions, 1000);
  const withCost = presentDecisions(
    [card({ id: "return", metric: "roas", type: "performance" }), card({ id: "cost", metric: "cpa", type: "performance" })],
    { seesCost: true, hasLeadValue: false },
  );
  assert.deepEqual(withCost.map((row) => row.id), ["cost"]);
  const valued = presentDecisions([card({ id: "return", metric: "roas", type: "performance" })], { seesCost: true, hasLeadValue: true });
  assert.equal(valued[0]?.evidence.roas, 1.4);
  assert.equal(isCostDecision({ type: "budget_change", metric: "budget" }), true);

  for (const kind of ["client_owner", "client_viewer", "none"]) {
    assert.equal(decisionsRequestStatus({ surface: "api", enabled: true, signedIn: true, kind }), 403, kind);
    assert.equal(decisionsRequestStatus({ surface: "page", enabled: true, signedIn: true, kind }), 403, kind);
  }
  for (const surface of ["share", "plan", "export"] as const) {
    assert.equal(decisionsRequestStatus({ surface, enabled: true, signedIn: true, kind: "super_admin" }), 403, surface);
  }
  assert.equal(decisionsRequestStatus({ surface: "api", enabled: false, signedIn: true, kind: "super_admin" }), 404);
  assert.equal(decisionsRequestStatus({ surface: "api", enabled: true, signedIn: true, kind: "account_manager" }), 200);
  assert.equal(clientViewerAllowed("/decisions", { JARVIS_UI_V2: "on" }), true);
  assert.equal(clientViewerAllowed("/decisions", { JARVIS_UI_V2: "on", DECISIONS_V1: "on" }), false);
  assert.equal(clientViewerAllowed("/api/marketing/decisions", { DECISIONS_V1: "on" }), false);
  assert.equal(rejectsDecisionsRequest(new URL("https://app.example/api/share/token?decisions=1")), true);
  assert.equal(rejectsDecisionsRequest(new URL("https://app.example/api/marketing/reports/export?decisions=1")), true);
  const route = readFileSync(path.join(ROOT, "app/api/marketing/decisions/route.ts"), "utf8");
  const detail = readFileSync(path.join(ROOT, "app/(app)/decisions/[id]/page.tsx"), "utf8");
  assert.match(route, /decisionsRequestStatus/);
  assert.match(detail, /denyAccess/);
  assert.match(readFileSync(path.join(ROOT, "app/api/share/[token]/route.ts"), "utf8"), /rejectsDecisionsRequest/);
  assert.match(readFileSync(path.join(ROOT, "app/(app)/plans/page.tsx"), "utf8"), /surface: "plan"/);
});

test("decisions are grouped by client and ordered by severity then recency", () => {
  const base = {
    type: "ctr_drift",
    rule: "ctr_drift",
    status: "verified",
    clientId: "client-pine",
    clientName: "Pine Street Dental",
    campaignId: "camp-pine",
    campaignName: "Pine Search",
    campaignStatus: "active",
    title: "One",
    summary: "",
    rationale: "",
    metric: "ctr",
    baseline: "1",
    observed: "1",
    windowStart: "2026-10-22",
    windowEnd: END,
    sampleSize: 10,
    sourceMetricIds: [],
    evidence: {},
    snoozedUntil: null,
    archivedAt: null,
    steps: [],
  } satisfies Omit<DecisionCard, "id" | "severity" | "recency" | "title" | "clientId" | "clientName">;
  const groups = groupDecisions([
    { ...base, id: "low", severity: "warning", recency: "2026-11-04T00:00:00.000Z", title: "Later warning" },
    { ...base, id: "old-high", severity: "critical", recency: "2026-11-01T00:00:00.000Z", title: "Older critical", clientId: "client-cedar", clientName: "Cedar Ridge Roofing" },
    { ...base, id: "new-high", severity: "critical", recency: "2026-11-04T00:00:00.000Z", title: "Newer critical" },
  ]);
  assert.equal(groups[0]?.clientName, "Pine Street Dental");
  assert.deepEqual(groups[0]?.items.map((row) => row.id), ["new-high", "low"]);
  assert.equal(groups[1]?.clientName, "Cedar Ridge Roofing");
  const filtered = filterDecisionRows(
    [
      { ...base, id: "open", severity: "warning", recency: "2026-11-04T00:00:00.000Z", title: "Open" },
      { ...base, id: "paused", severity: "warning", recency: "2026-11-04T00:00:00.000Z", title: "Paused", campaignStatus: "paused" },
      { ...base, id: "snoozed", severity: "warning", recency: "2026-11-04T00:00:00.000Z", title: "Snoozed", snoozedUntil: "2026-11-20" },
    ],
    { clientId: "client-pine", dates: ["2026-10-29", END], status: "active", now: END },
  );
  assert.deepEqual(filtered.map((row) => row.id), ["open"]);
});

test("staff can act, clients stay blocked, and closed or snoozed rows follow the list rules", () => {
  for (const kind of ["super_admin", "account_manager", "staff"]) {
    assert.equal(canActOnDecisions(kind), true, kind);
    assert.equal(decisionsRequestStatus({ surface: "api", enabled: true, signedIn: true, kind }), 200, kind);
  }
  assert.equal(canActOnDecisions("all_clients_viewer"), false);
  assert.deepEqual(visibleDecisionActions("verified", true), ["Approve", "Dismiss", "Snooze", "Mark resolved"]);
  assert.deepEqual(visibleDecisionActions("accepted", true), ["Mark resolved"]);
  assert.deepEqual(visibleDecisionActions("resolved", true), []);
  assert.deepEqual(visibleDecisionActions("verified", false), []);
  assert.equal(viewerLine(false, "ada@example.com"), "View only — signed in as ada@example.com");
  assert.equal(viewerLine(true, "ada@example.com"), "Signed in as ada@example.com");
  for (const kind of ["client_owner", "client_viewer", "none"]) {
    assert.equal(canActOnDecisions(kind), false, kind);
    assert.equal(decisionsRequestStatus({ surface: "api", enabled: true, signedIn: true, kind }), 403, kind);
    assert.equal(decisionsRequestStatus({ surface: "share", enabled: true, signedIn: true, kind }), 403, kind);
  }
  assert.equal(decisionsRequestStatus({ surface: "share", enabled: true, signedIn: true, kind: "staff" }), 403);
  assert.equal(decisionsRequestStatus({ surface: "export", enabled: true, signedIn: true, kind: "client_viewer" }), 403);
  const actions = readFileSync(path.join(ROOT, "lib/marketing/decisions/actions.ts"), "utf8");
  const page = readFileSync(path.join(ROOT, "components/jarvis/decisions-v1.tsx"), "utf8");
  assert.match(actions, /canActOnDecisions/);
  assert.equal(actions.includes("canApproveMarketing"), false);
  assert.match(page, /Approve/);
  assert.match(page, /Dismiss/);
  assert.match(page, /Snooze/);
  assert.match(page, /Mark resolved/);
  assert.match(page, /viewerLine/);
  assert.match(page, /Closed \(/);

  const base = {
    type: "ctr_drift",
    rule: "ctr_drift",
    status: "verified",
    severity: "warning",
    clientId: "client-pine",
    clientName: "Pine Street Dental",
    campaignId: "camp-pine",
    campaignName: "Pine Search",
    campaignStatus: "active",
    title: "Open",
    summary: "Click rate is lower.",
    rationale: "",
    metric: "ctr",
    baseline: "0.0200",
    observed: "0.0100",
    windowStart: "2026-10-29",
    windowEnd: END,
    sampleSize: 1000,
    sourceMetricIds: [],
    evidence: {},
    recency: "2026-11-04T00:00:00.000Z",
    snoozedUntil: null,
    archivedAt: null,
    steps: [],
    id: "open",
  } satisfies DecisionCard;
  const rows = [
    base,
    { ...base, id: "accepted", status: "accepted", title: "Accepted" },
    { ...base, id: "resolved", status: "resolved", title: "Resolved" },
    { ...base, id: "dismissed", status: "dismissed", title: "Dismissed" },
    { ...base, id: "declined", status: "declined", title: "Declined" },
    { ...base, id: "snoozed", title: "Snoozed", snoozedUntil: END },
    { ...base, id: "returned", title: "Returned", snoozedUntil: "2026-11-03" },
  ].map((row, index) => ({ ...row, id: row.id || `row-${index}` }));
  const view = { clientId: "client-pine", dates: ["2026-10-29", END], status: "active" as const, now: END };
  assert.deepEqual(filterDecisionRows(rows, view).map((row) => row.id).sort(), ["open", "returned"]);
  const closed = filterDecisionRows(rows, { ...view, bucket: "closed" });
  assert.deepEqual(closed.map((row) => row.status).sort(), ["accepted", "declined", "dismissed", "resolved"]);
  assert.equal(closed.length, 4);

  const key = "performance|client-pine|camp-pine|ad-pine|ctr_off";
  const closedRow = openRow("earlier", "2026-10-01T00:00:00.000Z", { dedupeKey: key, status: "resolved", decidedById: "person-1", decidedAt: "2026-10-02T00:00:00.000Z" });
  assert.equal(earlierRecommendationId([closedRow], key), "earlier");
  const again = applyUpsert([closedRow], { dedupeKey: key, evidence: { metric: "ctr" } }, "2026-11-04T00:00:00.000Z", (id) => openRow(id, "2026-11-04T00:00:00.000Z", { dedupeKey: key, evidence: { metric: "ctr" } }));
  assert.equal(again.action, "insert");
  assert.equal((again.rows.find((row) => row.id === again.id)?.evidence as { priorRecommendationId?: string }).priorRecommendationId, "earlier");

  const pair = planDuplicatePairs([
    {
      id: "metric",
      rule: "ctr_off",
      metric: "ctr",
      adId: "ad-pine",
      windowStart: "2026-10-29",
      windowEnd: END,
      status: "verified",
      decidedById: null,
      decidedAt: null,
      snoozedUntil: null,
      createdAt: "2026-11-04T00:00:00.000Z",
      evidence: { metric: "ctr" },
    },
    {
      id: "alert",
      rule: "ad_alert:ctr_off",
      metric: "ctr",
      adId: null,
      windowStart: "2026-10-29",
      windowEnd: END,
      status: "verified",
      decidedById: null,
      decidedAt: null,
      snoozedUntil: null,
      createdAt: "2026-11-03T00:00:00.000Z",
      evidence: { adIds: ["ad-pine"], alertIds: ["alert-row"] },
    },
    {
      id: "decided-alert",
      rule: "ad_alert:cpc_off",
      metric: "cpc",
      adId: "ad-pine",
      windowStart: "2026-10-29",
      windowEnd: END,
      status: "accepted",
      decidedById: "person-1",
      decidedAt: "2026-11-02T00:00:00.000Z",
      snoozedUntil: null,
      createdAt: "2026-11-01T00:00:00.000Z",
      evidence: { adIds: ["ad-pine"] },
    },
    {
      id: "cpc",
      rule: "cpc_off",
      metric: "cpc",
      adId: "ad-pine",
      windowStart: "2026-10-29",
      windowEnd: END,
      status: "verified",
      decidedById: null,
      decidedAt: null,
      snoozedUntil: null,
      createdAt: "2026-11-04T00:00:00.000Z",
      evidence: {},
    },
  ]);
  assert.equal(pair.dryRun, true);
  assert.equal(pair.deletes, 0);
  assert.deepEqual(pair.archive, ["alert"]);
  assert.equal(pair.archive.includes("decided-alert"), false);
  assert.equal(pair.updates.some((row) => row.id === "metric"), true);
  assert.equal(pair.updates.some((row) => row.id === "cpc"), true);
  const script = readFileSync(path.join(ROOT, "scripts/archive-duplicate-decision-pairs.ts"), "utf8");
  assert.match(script, /--apply/);
  assert.match(script, /Dry run/);
  assert.equal(script.includes("deleteMany"), false);
  assert.equal(script.includes(".delete("), false);
});

test("rate thresholds, labels, and client cost hiding", () => {
  assert.equal(RATE_WINDOW_DAYS, 7);
  assert.equal(RATE_MIN_IMPRESSIONS, 1000);
  assert.equal(RATE_MIN_CLICKS, 50);
  assert.equal(CTR_BASELINE_RATIO, 0.6);
  assert.equal(COST_BASELINE_RATIO, 1.5);
  assert.equal(BARE_CTR, 0.05);
  assert.equal(BARE_MIN_CLICKS, 50);
  assert.equal(BARE_MIN_DAYS, 3);
  assert.equal(AUTOMATED_CTR, 0.08);
  assert.equal(formatPercent(0.022), "2.2%");
  assert.equal(formatPercent(0.0045), "0.45%");
  assert.equal(formatMultiple(0.022, 0.0045), "4.9x usual");
  const title = metricTitle({
    campaignName: "Homestead Traffic",
    adName: "2026 Model Video",
    metric: "ctr",
    observed: 0.022,
    baseline: 0.0045,
    conversions: 0,
    days: 2,
    seesCost: false,
  });
  assert.equal(title, "Homestead Traffic – 2026 Model Video: click rate 2.2% vs 0.45% usual, 4.9x usual, 0 conversions in 2 days");
  assert.equal(decisionSubject("Homestead Traffic", "2026 Model Video"), "Homestead Traffic – 2026 Model Video");
  assert.equal(decisionSubject("CRS | August", "CRS | August"), "CRS | August");
  assert.equal(decisionSubject("  crs | august ", "CRS | August"), "crs | august");
  assert.equal(decisionSubject("CRS | August", "CRS | August – CRS | August"), "CRS | August");
  assert.equal(decisionSubject("CRS", "CRS | August"), "CRS | August");
  const repeated = metricTitle({
    campaignName: "CRS | August",
    adName: "CRS | August",
    metric: "ctr",
    observed: 0.022,
    baseline: 0.0045,
    conversions: 0,
    days: 7,
    seesCost: false,
  });
  assert.equal(repeated, "CRS | August: click rate 2.2% vs 0.45% usual, 4.9x usual, 0 conversions in 7 days");
  assert.equal(repeated.includes("CRS | August – CRS | August"), false);
  const dollars = metricTitle({
    campaignName: "Harbor",
    adName: "Video",
    metric: "cpc",
    observed: 1.5,
    baseline: 1,
    conversions: 0,
    days: 7,
    seesCost: true,
  });
  assert.match(dollars, /\$1\.50/);
  assert.match(dollars, /1\.5x usual/);
  assert.equal(metricTitle({ campaignName: "Harbor", adName: "Video", metric: "cpc", observed: 1.5, baseline: 1, conversions: 0, days: 7, seesCost: false }).includes("$"), false);
  assert.equal(rateSummary({ metric: "ctr", ctr: 0.05, conversions: 0 }).includes("automated"), false);
  assert.match(rateSummary({ metric: "ctr", ctr: 0.09, conversions: 0 }), /automated/);

  const point = (patch: Partial<MetricPoint> & Pick<MetricPoint, "id" | "adId" | "date">): MetricPoint => ({
    adName: "2026 Model Video",
    campaignName: "Homestead Traffic",
    adGroupId: "ag-1",
    campaignId: "camp-1",
    adAccountId: "act-1",
    objective: "leads",
    ingestedAt: "2026-11-04T15:00:00.000Z",
    spend: 20,
    impressions: 200,
    clicks: 10,
    linkClicks: 8,
    reach: 100,
    leads: 0,
    conversions: 0,
    conversionValue: 0,
    ...patch,
  });
  const weak = Array.from({ length: 7 }, (_, index) => point({
    id: `weak-${index}`,
    adId: "ad-weak",
    date: addDaysISO("2026-10-29", index),
    impressions: 600,
    clicks: 8,
    spend: 40,
  }));
  const usual = point({ id: "usual", adId: "ad-usual", date: "2026-10-01", impressions: 8000, clicks: 400, spend: 80, ingestedAt: "2026-10-01T12:00:00.000Z" });
  const flagged = evaluateAds({
    rows: [...weak, usual],
    now: new Date("2026-11-04T15:10:00.000Z"),
    today: END,
    yesterday: "2026-11-03",
    baselineDays: 7,
    alertMinImpressions: 200,
    benchmarks: { leads: { ctr: 0.02, cpc: 1 } },
  });
  const ctr = flagged.alerts.find((row) => row.code === "ctr_off");
  assert.ok(ctr);
  assert.equal(ctr?.severity, "critical");
  assert.match(ctr?.title || "", /Homestead Traffic – 2026 Model Video: click rate/);
  assert.match(ctr?.title || "", /%/);
  const short = evaluateAds({
    rows: [point({ id: "one", adId: "ad-weak", date: END, impressions: 8000, clicks: 40, spend: 200 }), usual],
    now: new Date("2026-11-04T15:10:00.000Z"),
    today: END,
    yesterday: "2026-11-03",
    baselineDays: 7,
    alertMinImpressions: 200,
    benchmarks: { leads: { ctr: 0.02 } },
  });
  assert.equal(short.alerts.some((row) => row.code === "ctr_off"), false);
  const bareDays = Array.from({ length: 3 }, (_, index) => point({
    id: `bare-${index}`,
    adId: "ad-hot",
    date: addDaysISO("2026-11-02", index),
    impressions: 400,
    clicks: 40,
    spend: 10,
    objective: "leads",
  }));
  const bareBase = point({ id: "bare-base", adId: "ad-calm", date: "2026-10-01", impressions: 6000, clicks: 60, spend: 30, ingestedAt: "2026-10-01T12:00:00.000Z" });
  const bare = evaluateAds({
    rows: [...bareDays, bareBase],
    now: new Date("2026-11-04T15:10:00.000Z"),
    today: END,
    yesterday: "2026-11-03",
    baselineDays: 7,
    alertMinImpressions: 200,
    benchmarks: {},
  }).alerts.find((row) => row.code === "ctr_without_results");
  assert.ok(bare);
  assert.equal(bare?.severity, "critical");
  assert.match(bare?.summary || "", /automated/);
  const traffic = evaluateAds({
    rows: bareDays.map((row) => ({ ...row, objective: "traffic" })),
    now: new Date("2026-11-04T15:10:00.000Z"),
    today: END,
    yesterday: "2026-11-03",
    baselineDays: 7,
    alertMinImpressions: 200,
    benchmarks: {},
  }).alerts.find((row) => row.code === "ctr_without_results");
  assert.equal(traffic?.severity, "warning");
  assert.equal((traffic?.summary || "").includes("automated"), false);

  const hidden = presentDecisions([
    {
      ...({
        id: "ctr",
        type: "ctr_drift",
        rule: "ctr_drift",
        status: "verified",
        severity: "warning",
        clientId: "client-pine",
        clientName: "Pine Street Dental",
        campaignId: "camp-pine",
        campaignName: "Pine Search",
        campaignStatus: "active",
        title: "2 ads: click rate fell and spend rose",
        summary: "Spend is up. CPA, CPL, ROAS, and budget need a look. Cost $12.00.",
        rationale: "Compared cost.",
        metric: "ctr",
        baseline: "0.0200",
        observed: "0.0100",
        windowStart: "2026-10-29",
        windowEnd: END,
        sampleSize: 1000,
        sourceMetricIds: [],
        evidence: { impressions: 1000, spend: 40, cpa: 12, cpl: 9, roas: 1.2, budget: 80, cost: 40 },
        recency: "2026-11-04T00:00:00.000Z",
        snoozedUntil: null,
        archivedAt: null,
        steps: [],
      } satisfies DecisionCard),
    },
    {
      id: "cpc",
      type: "performance",
      rule: "cpc_off",
      status: "verified",
      severity: "warning",
      clientId: "client-pine",
      clientName: "Pine Street Dental",
      campaignId: "camp-pine",
      campaignName: "Pine Search",
      campaignStatus: "active",
      title: "Cost per click",
      summary: "CPC rose",
      rationale: "",
      metric: "cpc",
      baseline: "1",
      observed: "2",
      windowStart: "2026-10-29",
      windowEnd: END,
      sampleSize: 50,
      sourceMetricIds: [],
      evidence: { cpc: 2 },
      recency: "2026-11-04T00:00:00.000Z",
      snoozedUntil: null,
      archivedAt: null,
      steps: [],
    },
  ], { seesCost: false, hasLeadValue: false });
  assert.equal(hidden.length, 1);
  const text = JSON.stringify(hidden[0]);
  for (const word of ["spend", "cpa", "cpl", "roas", "budget", "cost", "$"]) {
    assert.equal(text.toLowerCase().includes(word), false, word);
  }
  assert.match(hidden[0]?.title || "", /^Campaign \(2 ads\):/);
});

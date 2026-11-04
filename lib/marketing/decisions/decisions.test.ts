import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { addDaysISO } from "../../time";
import { clientViewerAllowed } from "../client-gate";
import { decisionsV1Enabled } from "../config";
import { visibleDecisionCards } from "../decision-ui";
import { normalizeAppName } from "./apps";
import { decisionsRequestStatus, decisionsView, rejectsDecisionsRequest } from "./access";
import { planCollapse } from "./collapse";
import { recommendationDedupeKey } from "./key";
import { filterDecisionRows, groupDecisions, isCostDecision, presentDecisions, type DecisionCard } from "./present";
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
import { applyUpsert, selectOpenRecommendation, type OpenRecommendation } from "./upsert";
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

test("deduped ad alerts become one recommendation per campaign and code", () => {
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
  const grouped = evaluateDecisionRules({
    end: END,
    alerts: [alert("ad-1"), alert("ad-2", { severity: "critical" }), alert("ad-3", { archivedAt: "2026-11-01", adId: "ad-3" })],
  }).filter((row) => row.type === "ad_underperformance");
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0]?.severity, "critical");
  assert.deepEqual(grouped[0]?.evidence.adIds, ["ad-1", "ad-2"]);
  assert.equal(grouped[0]?.writesAds, false);
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

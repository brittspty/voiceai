import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { addDaysISO } from "../../time";
import type { MetricPoint } from "../monitor";
import { qualifyAdRates } from "../monitor";
import { appliedGuardText, guardState, planRecheck, RECHECK_REASON, type RecheckRecommendation } from "./recheck";

const TODAY = "2026-11-04";
const ROOT = path.resolve(import.meta.dirname, "../../..");

function point(patch: Partial<MetricPoint> & Pick<MetricPoint, "id" | "adId" | "date">): MetricPoint {
  return {
    adName: "2026 Model Video",
    campaignName: "Homestead Traffic",
    adGroupId: "ag-1",
    campaignId: "camp-1",
    adAccountId: "act-1",
    objective: "leads",
    ingestedAt: "2026-11-04T15:00:00.000Z",
    spend: 20,
    impressions: 600,
    clicks: 8,
    linkClicks: 8,
    reach: 400,
    leads: 0,
    conversions: 0,
    conversionValue: 0,
    ...patch,
  };
}

function week(adId: string, patch: Partial<MetricPoint> = {}) {
  return Array.from({ length: 7 }, (_, index) => point({
    id: `${adId}-${index}`,
    adId,
    date: addDaysISO("2026-10-29", index),
    ...patch,
  }));
}

function row(patch: Partial<RecheckRecommendation> = {}): RecheckRecommendation {
  return {
    id: "rec-1",
    clientId: "client-pine",
    clientName: "Pine Street Dental",
    type: "performance",
    rule: "ctr_off",
    status: "verified",
    severity: "critical",
    adId: "ad-weak",
    decidedById: null,
    decidedAt: null,
    snoozedUntil: null,
    archivedAt: null,
    ...patch,
  };
}

test("recheck archives rows that miss the current thresholds and updates severity", () => {
  const weak = week("ad-weak");
  const usual = point({
    id: "usual",
    adId: "ad-usual",
    date: "2026-10-01",
    impressions: 8000,
    clicks: 400,
    spend: 80,
    ingestedAt: "2026-10-01T12:00:00.000Z",
  });
  const qualified = qualifyAdRates({
    rows: [...weak, usual],
    adId: "ad-weak",
    today: TODAY,
    benchmarks: { leads: { ctr: 0.02 } },
  });
  assert.equal(qualified.find((hit) => hit.code === "ctr_off")?.severity, "critical");

  const thin = [point({ id: "thin", adId: "ad-thin", date: TODAY, impressions: 8000, clicks: 40 })];
  assert.equal(qualifyAdRates({ rows: [...thin, usual], adId: "ad-thin", today: TODAY, benchmarks: { leads: { ctr: 0.02 } } }).some((hit) => hit.code === "ctr_off"), false);

  const hot = week("ad-hot", { impressions: 400, clicks: 40, objective: "traffic" });
  const bare = qualifyAdRates({
    rows: [...hot, point({ id: "calm", adId: "ad-calm", date: "2026-10-01", impressions: 6000, clicks: 60, spend: 30, ingestedAt: "2026-10-01T12:00:00.000Z" })],
    adId: "ad-hot",
    today: TODAY,
    benchmarks: {},
  }).find((hit) => hit.code === "ctr_without_results");
  assert.equal(bare?.severity, "warning");
  assert.equal(bare?.capped, true);

  const plan = planRecheck({
    today: TODAY,
    benchmarks: { leads: { ctr: 0.02 } },
    metrics: [...weak, usual, ...thin, ...hot],
    rows: [
      row({ id: "keep", adId: "ad-weak", severity: "critical" }),
      row({ id: "drop", adId: "ad-thin", clientId: "client-cedar", clientName: "Cedar Ridge Roofing" }),
      row({ id: "warn", adId: "ad-hot", type: "traffic", rule: "ctr_without_results", severity: "critical", clientId: "client-cedar", clientName: "Cedar Ridge Roofing" }),
      row({ id: "decided", status: "accepted", decidedById: "person-1", decidedAt: "2026-11-01T00:00:00.000Z" }),
      row({ id: "snoozed", snoozedUntil: "2026-11-20" }),
      row({ id: "drift", type: "ctr_drift", rule: "ctr_drift", adId: "ad-thin" }),
      row({ id: "cost", rule: "cpa_off", adId: "ad-weak" }),
    ],
  });
  assert.equal(plan.dryRun, true);
  assert.deepEqual(plan.keep, ["keep"]);
  assert.deepEqual(plan.archive, [{ id: "drop", reason: RECHECK_REASON }]);
  assert.deepEqual(plan.severity, [{ id: "warn", severity: "warning" }]);
  assert.equal(plan.archive.some((item) => item.id === "decided" || item.id === "snoozed" || item.id === "drift" || item.id === "cost"), false);
  const pine = plan.clients.find((client) => client.clientName === "Pine Street Dental");
  const cedar = plan.clients.find((client) => client.clientName === "Cedar Ridge Roofing");
  assert.deepEqual(pine?.rules, [{ rule: "ctr_off", keep: 1, archive: 0, severity: 0 }]);
  assert.deepEqual(cedar?.rules, [
    { rule: "ctr_off", keep: 0, archive: 1, severity: 0 },
    { rule: "ctr_without_results", keep: 0, archive: 0, severity: 1 },
  ]);
  assert.deepEqual(plan.rules, [
    { rule: "ctr_off", keep: 1, archive: 1, severity: 0 },
    { rule: "ctr_without_results", keep: 0, archive: 0, severity: 1 },
  ]);

  assert.equal(guardState(null), "missing");
  assert.equal(guardState(""), "ready");
  assert.equal(guardState("allow\n"), "ready");
  assert.equal(guardState(appliedGuardText("2026-11-04T21:00:00.000Z")), "used");

  const source = readFileSync(path.join(ROOT, "scripts/recheck-open-decisions.ts"), "utf8");
  const planner = readFileSync(path.join(ROOT, "lib/marketing/decisions/recheck.ts"), "utf8");
  assert.match(source, /--apply/);
  assert.match(source, /--guard/);
  assert.match(source, /Dry run/);
  assert.match(source, /qualifyAdRates|planRecheck/);
  assert.match(source, /RECHECK_REASON/);
  assert.match(planner, /from "\.\.\/monitor"/);
  assert.equal(source.includes("deleteMany"), false);
  assert.equal(source.includes(".delete("), false);
  assert.equal(source.includes("graph.facebook.com"), false);
  assert.equal(source.includes("googleads.googleapis.com"), false);
});

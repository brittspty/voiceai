import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  AUDIENCE_SOURCES,
  DRILL_LEVELS,
  assertMaidTestArm,
  buildLineage,
  chooseControlList,
  isVerifiedConversion,
  maidTestArms,
} from "./audience-source";
import { botConfidence, coverageScore } from "./coverage";
import { METRIC_CATALOG, assertStaffOnlyCosts } from "./dictionary/catalog";
import { readMetricDictionary } from "./dictionary/glossary";
import { claimIdempotency, openSecret, sealSecret, verifyIntakeSignature, signIntake } from "./intake/hmac";
import { allsourceAdapter, ingestTable } from "./intake/pipeline";
import { sheetsOAuthStartUrl } from "./intake/sheets";
import { buildProvenance, crossClientLearningAllowed } from "./provenance";
import { assignmentCounts, assignArm } from "./segments/assign";
import { applySegmentAnswer, canUndoDecision, logBudgetFollowUp, SEGMENT_UNDO_MS } from "./segments/decisions";
import { nextDrill } from "./segments/drill";
import { exampleBoard, exampleControl, exampleDrill, exampleLineage, exampleProvenance } from "./segments/example";
import { lineageNote, presentBoard, testResultHeadline } from "./segments/present";
import { leadQualityScore } from "./segments/quality";
import { newSubSegmentAction, recommendLists } from "./segments/recommend";
import { SEGMENT_ENGINE_V1, resolveSegmentSettings } from "./segments/settings";
import { judgeArms, requiredConversions, trialsPerArm, twoProportionPValue } from "./segments/stats";
import { coverageScoreEnabled, dataIntakeEnabled, metricDictionaryEnabled, provenanceEnabled, segmentEngineEnabled } from "./config";

const ROOT = path.resolve(import.meta.dirname, "../..");

test("intake, dictionary, provenance, coverage, and segment switches default off", () => {
  assert.equal(dataIntakeEnabled({}), false);
  assert.equal(metricDictionaryEnabled({}), false);
  assert.equal(provenanceEnabled({}), false);
  assert.equal(coverageScoreEnabled({}), false);
  assert.equal(segmentEngineEnabled({}), false);
  assert.equal(segmentEngineEnabled({ SEGMENT_ENGINE: "on" }), true);
});

test("the shared audience enum is the taxonomy the audience library imports", () => {
  assert.deepEqual(AUDIENCE_SOURCES, ["maid_market", "pixel_pool", "crm_first_party", "platform_native"]);
  assert.deepEqual(DRILL_LEVELS, ["audience_source", "intent", "geo", "demographics", "behavior"]);
  assert.throws(() => assertMaidTestArm("platform_native"), /MAID/);
  const source = readFileSync(path.join(ROOT, "lib/marketing/audience-source.ts"), "utf8");
  assert.match(source, /export const AUDIENCE_SOURCES/);
  for (const file of walk(path.join(ROOT, "lib/marketing"))) {
    if (!/\.(ts|tsx)$/.test(file) || file.endsWith(".test.ts")) continue;
    const text = readFileSync(file, "utf8");
    assert.equal(text.includes("ivt_status"), false, file);
  }
});

test("dictionary staff-only costs stay out of the client glossary", () => {
  assertStaffOnlyCosts();
  const ids = new Set(METRIC_CATALOG.map((row) => row.id));
  for (const id of ["ctr", "conversion_rate", "revenue", "roas", "ltv", "cac", "payback_months", "speed_to_lead_minutes", "lead_quality_score", "attributed_conversions", "incremental_lift"]) {
    assert.equal(ids.has(id), true, id);
  }
  const client = readMetricDictionary([{ metricKey: "ctr", benchmarks: { marine: 0.02 } }], false);
  assert.equal(client.some((row) => row.staffOnly), false);
  assert.equal(client.some((row) => row.id === "roas" || row.id === "cac" || row.id === "spend"), false);
  const ctr = readMetricDictionary([{ metricKey: "ctr", benchmarks: { marine: 0.02 } }], true).find((row) => row.id === "ctr");
  assert.equal(ctr?.benchmarks.marine, 0.02);
  assert.equal(ctr?.benchmarks.healthcare, METRIC_CATALOG.find((row) => row.id === "ctr")?.benchmarks.healthcare);
});

test("csv intake hashes pii, rejects bad rows, and tags trust and lineage", () => {
  const csv = [
    "email,phone,external_id,revenue",
    "Ada@Example.com,+19195550100,a,40",
    "ada@example.com,+19195550100,b,41",
    "nope,abc,c,42",
    "Bea@Example.com,+19195550101,d,9000",
    "Cy@Example.com,+19195550102,e,10",
    "Dee@Example.com,+19195550103,f,11",
    "Eve@Example.com,+19195550104,g,12",
    "Fay@Example.com,+19195550105,h,13",
  ].join("\n");
  const result = ingestTable({
    csv,
    kind: "audience_intent",
    audienceSource: "maid_market",
    vendor: "Allsource",
    listId: "list-9",
    maps: [
      { column: "email", field: "email", required: true },
      { column: "phone", field: "phone", required: true },
      { column: "external_id", field: "external_id", required: true },
      { column: "revenue", field: "revenue" },
    ],
    rules: [
      { field: "email", type: "email", required: true },
      { field: "phone", type: "phone", required: true },
      { field: "external_id", type: "string", required: true },
      { field: "revenue", type: "number", outlier: true },
    ],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.accepted.length >= 1);
  assert.equal(result.accepted.some((row) => JSON.stringify(row.fields).includes("Ada@Example.com")), false);
  assert.ok(result.accepted.every((row) => row.emailHash && row.vendor === "Allsource" && row.listId === "list-9"));
  assert.ok(result.accepted.every((row) => row.verified && row.trustTier === "proprietary"));
  const reasons = result.rejected.flatMap((row) => row.reasons);
  assert.ok(reasons.includes("duplicate"));
  assert.ok(reasons.includes("invalid_phone"));
  assert.ok(reasons.includes("outlier_revenue"));
  assert.equal(ingestTable({ csv: "a\n1", kind: "csv", audienceSource: "maid_market", maps: [], rules: [] }).ok, false);
});

test("webhook signatures and idempotency keys", () => {
  const body = '{"listId":"list-9"}';
  const secret = "workspace-secret";
  assert.equal(verifyIntakeSignature(secret, body, signIntake(secret, body)), true);
  assert.equal(verifyIntakeSignature(secret, body, "nope"), false);
  const seen = new Set<string>();
  assert.equal(claimIdempotency(seen, "evt-1"), "new");
  assert.equal(claimIdempotency(seen, "evt-1"), "duplicate");
  const sealed = sealSecret(secret, "pepper");
  assert.equal(openSecret(sealed, "pepper"), secret);
  assert.equal(sealed.includes(secret), false);
});

test("sheets import reuses Google OAuth and Allsource is a stub", async () => {
  const url = sheetsOAuthStartUrl({ GOOGLE_ADS_CLIENT_ID: "client" }, "https://app.example.com/callback", "state");
  assert.match(url ?? "", /accounts\.google\.com/);
  assert.equal(new URL(url ?? "http://x").searchParams.get("scope"), "https://www.googleapis.com/auth/spreadsheets.readonly");
  assert.deepEqual(await allsourceAdapter.pull(), []);
  assert.equal(allsourceAdapter.audienceSource, "maid_market");
  assert.equal(allsourceAdapter.vendor, "allsource");
});

test("provenance weights proprietary data above platform reports", () => {
  const provenance = exampleProvenance();
  assert.match(provenance.line, /^Based on:/);
  assert.match(provenance.line, /list implant-55-tampa/);
  assert.match(provenance.line, /Allsource/);
  assert.match(provenance.line, /not as conversion truth/);
  assert.equal(provenance.usedPlatformAsConversionTruth, false);
  assert.ok(provenance.drivers[0]!.weight > provenance.drivers.find((row) => row.truthRole === "delivery_only")!.weight);
  assert.equal(buildProvenance([{ sourceId: "p", sourceLabel: "Platform", metricKey: "conversions", trustTier: "platform_reported", truthRole: "delivery_only" }]).drivers[0]!.weight, 0);
  assert.equal(crossClientLearningAllowed(false, 5), false);
  assert.equal(crossClientLearningAllowed(true, 2), false);
  assert.equal(crossClientLearningAllowed(true, 3), true);
});

test("coverage score explains itself and lowers bot confidence", () => {
  const strong = coverageScore({
    sources: [{ source: "crm", ageHours: 2, freshWithinHours: 24 }],
    metricsCovered: 10,
    metricsTotal: 10,
    qualityPassRate: 1,
  });
  assert.equal(strong.score, 100);
  assert.match(strong.explanation, /100 out of 100/);
  const thin = coverageScore({
    sources: [{ source: "crm", ageHours: 200, freshWithinHours: 24 }],
    metricsCovered: 1,
    metricsTotal: 10,
    qualityPassRate: 0.2,
  });
  assert.ok(thin.score < 50);
  assert.equal(botConfidence(80, strong.score), 80);
  assert.ok(botConfidence(80, thin.score) < 80);
});

test("sample size uses a 20% lift and a floor of 100 conversions", () => {
  const trials = trialsPerArm(0.1, 0.2);
  assert.ok(trials && trials > 3000);
  assert.ok(requiredConversions(0.1, SEGMENT_ENGINE_V1) > 100);
  assert.equal(requiredConversions(0.8, SEGMENT_ENGINE_V1), 100);
  assert.equal(requiredConversions(null, SEGMENT_ENGINE_V1), 100);
  const p = twoProportionPValue(200, 2000, 100, 2000);
  assert.ok(p != null && p < 0.05);
});

test("a winner needs 95% and p < 0.05 and 100 conversions and 7 days", () => {
  const early = judgeArms(
    [
      { key: "a", successes: 30, trials: 200, days: 14, quality: 80 },
      { key: "b", successes: 10, trials: 200, days: 14, quality: 40 },
    ],
    SEGMENT_ENGINE_V1,
    null,
  );
  assert.equal(early.label, "still learning");
  assert.equal(early.winnerKey, null);
  const short = judgeArms(
    [
      { key: "a", successes: 400, trials: 2000, days: 3, quality: 80 },
      { key: "b", successes: 120, trials: 2000, days: 3, quality: 40 },
    ],
    SEGMENT_ENGINE_V1,
    null,
  );
  assert.equal(short.status, "still_learning");
  const ready = judgeArms(
    [
      { key: "a", successes: 960, trials: 8000, days: 14, quality: 80 },
      { key: "b", successes: 160, trials: 8000, days: 14, quality: 30 },
    ],
    SEGMENT_ENGINE_V1,
    null,
  );
  assert.equal(ready.status, "winner");
  assert.equal(ready.winnerKey, "a");
  assert.ok((ready.probabilities.a ?? 0) >= 0.95);
  assert.ok((ready.pValue ?? 1) < 0.05);
});

test("scale, test, and cut follow v1 rules and never write a budget", () => {
  const result = recommendLists(
    [
      { key: "hot", successes: 45, trials: 300, days: 21, quality: 90, vendor: "Allsource", listId: "hot", subSegmentKey: "", people: 300 },
      { key: "base", successes: 30, trials: 300, days: 21, quality: 60, vendor: "Allsource", listId: "base", subSegmentKey: "", people: 300 },
    ],
    SEGMENT_ENGINE_V1,
    null,
  );
  assert.equal(result.writesBudget, false);
  assert.ok(result.rows.every((row) => row.action !== "scale"));
  assert.equal(newSubSegmentAction(), "test");
  const board = exampleBoard("staff", "conversion", true);
  assert.ok(board.rows.some((row) => row.chip === "SCALE"));
  assert.ok(board.rows.some((row) => row.chip === "CUT"));
  assert.ok(board.rows.some((row) => row.chip === "STILL LEARNING" && row.rank === null));
  const client = exampleBoard("client");
  assert.equal(JSON.stringify(client).includes("cpl"), false);
  assert.equal(client.rows.every((row) => row.revenue === "Not connected"), true);
  const connected = exampleBoard("client", "conversion", true);
  assert.ok(connected.rows.some((row) => row.revenue.startsWith("$")));
});

test("tests compare MAID lists and the control is the current best or a chosen baseline", () => {
  const chosen = chooseControlList(
    [
      { audienceSource: "platform_native", listId: "native", vendor: "meta", conversionRate: 0.9, quality: 90 },
      { audienceSource: "maid_market", listId: "a", vendor: "Allsource", conversionRate: 0.12, quality: 80 },
      { audienceSource: "maid_market", listId: "b", vendor: "LiveRamp", conversionRate: 0.04, quality: 20 },
    ],
    { listId: "b", vendor: "LiveRamp" },
  );
  assert.equal(chosen?.kind, "chosen_baseline");
  assert.equal(chosen?.listId, "b");
  const best = chooseControlList([
    { audienceSource: "maid_market", listId: "a", vendor: "Allsource", conversionRate: 0.12, quality: 80 },
    { audienceSource: "maid_market", listId: "b", vendor: "LiveRamp", conversionRate: 0.04, quality: 20 },
  ]);
  assert.equal(best?.kind, "current_best");
  assert.equal(best?.listId, "a");
  const testArms = maidTestArms({
    treatment: { vendor: "Allsource", listId: "new-list", subSegmentKey: "tampa" },
    control: { vendor: "Allsource", listId: "best-list", kind: "current_best" },
  });
  assert.deepEqual(testArms.arms.map((arm) => arm.audienceSource), ["maid_market", "maid_market"]);
  assert.throws(() => maidTestArms({
    treatment: { vendor: "Allsource", listId: "same" },
    control: { vendor: "Allsource", listId: "same", kind: "current_best" },
  }), /differ/);
  const example = exampleControl();
  assert.equal(example.kind, "current_best");
  assert.ok(example.arms.every((arm) => arm.arm.audienceSource === "maid_market"));
});

test("a conversion is verified only from a human source or MAID after dedupe and contact checks", () => {
  assert.equal(isVerifiedConversion({ audienceSource: "maid_market", duplicate: false, contactValid: true }), true);
  assert.equal(isVerifiedConversion({ audienceSource: "verified_human_source", duplicate: false, contactValid: true }), true);
  assert.equal(isVerifiedConversion({ audienceSource: "maid_market", duplicate: true, contactValid: true }), false);
  assert.equal(isVerifiedConversion({ audienceSource: "maid_market", duplicate: false, contactValid: false }), false);
  assert.equal(isVerifiedConversion({ audienceSource: "platform_native", duplicate: false, contactValid: true }), false);
  assert.equal(isVerifiedConversion({ audienceSource: "crm_first_party", duplicate: false, contactValid: true }), false);
  assert.equal(isVerifiedConversion({ audienceSource: "pixel_pool", duplicate: false, contactValid: true }), false);
  const lineage = buildLineage({
    audienceSource: "maid_market",
    vendor: "Allsource",
    listId: "list-9",
    intent: "in_market",
    geo: "FL",
    demographics: "55+",
    behavior: "site",
    segmentKey: "retirees",
    subSegmentKey: "implant",
    audienceKey: "tampa",
    duplicate: false,
    contactValid: true,
  });
  assert.equal(lineage.vendor, "Allsource");
  assert.equal(lineage.listId, "list-9");
  assert.equal(lineage.verified, true);
  assert.throws(() => buildLineage({ ...lineage, vendor: "", listId: "" }), /list id/);
  assert.equal(exampleLineage().every((node) => node.vendor && node.listId), true);
});

test("lead quality uses the v1 weights and marks a missing CRM outcome provisional", () => {
  const weights = SEGMENT_ENGINE_V1.qualityWeights;
  const closed = leadQualityScore({ crmOutcome: 100, platformOutcome: 0, verifiedEmail: true, verifiedPhone: true, duplicate: false, icpFit: 100, engagement7d: 100 }, weights);
  assert.equal(closed.provisional, false);
  assert.equal(closed.usedCrm, true);
  assert.equal(closed.score, 100);
  const platformOnly = leadQualityScore({ crmOutcome: null, platformOutcome: 100, verifiedEmail: true, verifiedPhone: true, duplicate: false, icpFit: 0, engagement7d: 0 }, weights);
  assert.equal(platformOnly.provisional, true);
  assert.equal(platformOnly.usedCrm, false);
  assert.ok(platformOnly.score < closed.score);
  const duplicate = leadQualityScore({ crmOutcome: 100, verifiedEmail: true, verifiedPhone: true, duplicate: true, icpFit: 100, engagement7d: 100 }, weights);
  assert.ok(duplicate.score < closed.score);
});

test("workspace and client overrides replace v1 defaults", () => {
  const resolved = resolveSegmentSettings({ minConversionsPerArm: 120 }, { minDays: 10, qualityWeights: { crmOutcome: 0.7 } });
  assert.equal(resolved.minConversionsPerArm, 120);
  assert.equal(resolved.minDays, 10);
  assert.equal(resolved.probabilityToBeatBest, 0.95);
  assert.ok(Math.abs(resolved.qualityWeights.crmOutcome + resolved.qualityWeights.contactValidity + resolved.qualityWeights.icpFit + resolved.qualityWeights.engagement - 1) < 1e-9);
  assert.ok(resolved.qualityWeights.crmOutcome > 0.5);
});

test("assignment is a stable fair split", () => {
  assert.equal(assignArm("person-1", "salt", ["a", "b"]), assignArm("person-1", "salt", ["a", "b"]));
  const ids = Array.from({ length: 2000 }, (_, index) => `id-${index}`);
  const counts = assignmentCounts(ids, "salt", ["a", "b"]);
  assert.ok((counts.get("a") ?? 0) > 800);
  assert.ok((counts.get("b") ?? 0) > 800);
});

test("drill uses one attribute, splits only winners, and keeps cross-client learning off", () => {
  const blocked = nextDrill({
    parent: { key: "p", successes: 800, trials: 4000, days: 14, quality: 70, people: 4000 },
    parentWon: true,
    level: "audience_source",
    buckets: [
      { key: "maid", attribute: "audience_source", value: "maid_market", successes: 300, trials: 1000, days: 14, quality: 80 },
      { key: "native", attribute: "audience_source", value: "platform_native", successes: 300, trials: 1000, days: 14, quality: 80 },
      { key: "pixel", attribute: "audience_source", value: "pixel_pool", successes: 200, trials: 1000, days: 14, quality: 70 },
    ],
    settings: SEGMENT_ENGINE_V1,
    baselineRate: null,
    consent: false,
    contributingClients: 1,
    crossClient: true,
  });
  assert.equal(blocked.split, false);
  assert.match(blocked.reason, /Cross-client/);
  const notWinner = nextDrill({
    parent: { key: "p", successes: 800, trials: 4000, days: 14, quality: 70, people: 4000 },
    parentWon: false,
    level: "geo",
    buckets: [],
    settings: SEGMENT_ENGINE_V1,
    baselineRate: null,
    consent: true,
    contributingClients: 4,
    crossClient: false,
  });
  assert.equal(notWinner.split, false);
  const drill = exampleDrill();
  assert.equal(drill.split, true);
  if (drill.split) {
    assert.ok(drill.surfaced.every((child) => child.action === "test"));
    assert.ok(drill.surfaced.length >= 1);
  }
});

test("yes on scale or cut only logs the decision", async () => {
  const writes: string[] = [];
  const store = { write: async () => { writes.push("write"); } };
  const accepted = await applySegmentAnswer({
    actor: { kind: "human", access: access() },
    card: { id: "card-1", type: "segment_scale", status: "verified", vendor: "Allsource", listId: "implant-55-tampa" },
    decision: "accept",
    budgetStore: store,
  });
  assert.equal(accepted.budgetWrite, "none");
  assert.equal(accepted.adAccountWrite, false);
  assert.equal(accepted.executes, false);
  assert.ok(accepted.manualSteps.length >= 2);
  assert.equal(writes.length, 0);
  const logged = logBudgetFollowUp(store);
  assert.equal(logged.writesBudget, false);
  assert.equal(writes.length, 0);
  await assert.rejects(() => applySegmentAnswer({
    actor: { kind: "bot" },
    card: { id: "card-1", type: "segment_cut", status: "verified", vendor: "Allsource", listId: "broad" },
    decision: "accept",
    budgetStore: store,
  }), /person/);
  assert.equal(writes.length, 0);
  const now = 1_000_000;
  assert.equal(canUndoDecision(now, now + SEGMENT_UNDO_MS), true);
  assert.equal(canUndoDecision(now, now + SEGMENT_UNDO_MS + 1), false);
});

test("client segment views hide costs, vendors, and match rates", () => {
  const staff = exampleBoard("staff", "conversion", true);
  assert.ok(staff.columns.includes("vendor"));
  assert.ok(staff.columns.includes("matchRate"));
  assert.equal(staff.columns.includes("benchmark"), false);
  assert.equal(staff.columns.includes("exclusion"), false);
  assert.ok(staff.rows.some((row) => row.vendor === "Allsource"));
  assert.match(staff.rows.find((row) => row.key === "emergency")?.matchRateLabel ?? "", /Google Ads 22%/);
  assert.equal(staff.rows.find((row) => row.key === "emergency")?.holdLabel, "On hold: low match rate");
  assert.equal(staff.rows.find((row) => row.key === "implant")?.holdLabel, undefined);
  assert.match(staff.rows[0]?.sample ?? "", /verified-human conversions/);
  const client = exampleBoard("client", "conversion", true);
  const text = JSON.stringify(client);
  assert.equal(client.columns.includes("vendor"), false);
  assert.equal(client.columns.includes("matchRate"), false);
  assert.equal(client.columns.includes("cpl"), false);
  assert.equal(text.includes("Allsource"), false);
  assert.equal(text.includes("LiveRamp"), false);
  assert.equal(text.includes("matchRate"), false);
  assert.equal(text.includes("holdLabel"), false);
  assert.equal(text.includes("cpl"), false);
  assert.equal(text.includes("cpa"), false);
  assert.equal(text.includes("benchmark"), false);
  assert.equal(text.includes("exclusion"), false);
  assert.match(text, /100 verified-human conversions|verified-human conversions/);
  assert.ok(client.rows.every((row) => row.audienceSource === "maid_market" && row.vendor === undefined && row.matchRates === undefined));
  const screen = readFileSync(path.join(ROOT, "components/segment-screens.tsx"), "utf8");
  assert.equal(/Benchmark/.test(screen), false);
  assert.equal(/[Ee]xclusion badge/.test(screen), false);
  assert.match(screen, /Audience source/);
  const clientHeadline = testResultHeadline({ staff: false, ready: true, vendor: "Allsource", listId: "implant-55-tampa" });
  const clientLineage = lineageNote({ staff: false, listId: "implant-55-tampa", vendor: "Allsource" });
  assert.equal(clientHeadline.includes("Allsource"), false);
  assert.equal(clientLineage.includes("Allsource"), false);
  assert.equal(clientLineage.includes("match rate"), false);
  assert.match(testResultHeadline({ staff: true, ready: true, vendor: "Allsource", listId: "implant-55-tampa" }), /Allsource/);
});

test("client board text has no cost terms and stores scope by workspace", () => {
  const client = presentBoard({
    rows: exampleBoard("staff", "conversion", true).rows.map((row) => ({
      key: row.key,
      name: row.name,
      parent: row.parent,
      audienceSource: "maid_market" as const,
      vendor: row.vendor || "Allsource",
      listId: row.listId,
      matchRates: row.matchRates ?? [{ platform: "meta", rate: 0.5 }],
      subSegmentKey: "",
      people: 100,
      successes: 100,
      trials: 1000,
      days: 10,
      quality: 50,
      qualityProvisional: false,
      revenue: 10,
      spend: 10,
      recommendation: {
        key: row.key,
        action: "test",
        chip: row.chip,
        reason: row.reason,
        clientReason: "Your account manager may keep testing this group.",
        probability: 0.5,
        winner: false,
      },
      required: 100,
    })),
    mode: "client",
    sort: "conversion",
    ghlClosedDealSync: false,
    example: true,
  });
  assert.equal(JSON.stringify(client).includes("cpl"), false);
  for (const file of ["dictionary/store.ts", "intake/store.ts", "segments/store.ts", "coverage-store.ts"]) {
    const text = readFileSync(path.join(ROOT, "lib/marketing", file), "utf8");
    assert.match(text, /isolatedWhere\(/);
  }
});

function access() {
  return {
    userId: "u",
    email: "sam@example.com",
    role: "account_manager",
    workspaceId: "org",
    kind: "account_manager" as const,
    accounts: "all" as const,
    campaigns: "all" as const,
    seesCost: true,
    seesAlerts: true,
    canEditBudget: true,
    canCreateShareLink: true,
  };
}

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) found.push(...walk(full));
    else found.push(full);
  }
  return found;
}

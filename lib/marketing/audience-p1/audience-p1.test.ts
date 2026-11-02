import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { DrillScreen, LineageScreen, TestsScreen, ThresholdScreen } from "../../../components/audience-p1/screens";
import { forbiddenClientKeys, omitForbiddenClientFields } from "../client-view";
import { collectsCostKeys, stripForAudience } from "../channels/cost-strip";
import { clientViewerAllowed } from "../client-gate";
import { createP1LogTables, memoryP1LogStore } from "../p1-log-store";
import { forReader, staffOnlyStatus } from "../p1-reader";
import { presentDrill, DRILL_DIMENSIONS } from "./drill";
import { decideExample, loadAudienceDecisions, resetAudienceDecisions, saveAudienceDecision } from "./decide";
import { checklistFor, cutAllowed, presentTests } from "./head-to-head";
import { presentLineage } from "./lineage";
import { SEGMENT_ENGINE_V1, resolveSegmentSettings } from "../segments/settings";
import { AUDIENCE_P1_THRESHOLDS, presentThresholds } from "./thresholds";

const ROOT = path.resolve(import.meta.dirname, "../../..");

function assertNoCost(value: unknown, banned: string[] = []) {
  assert.deepEqual(collectsCostKeys(value), []);
  assert.deepEqual(forbiddenClientKeys(value), []);
  assert.deepEqual(omitForbiddenClientFields(stripForAudience(value, "share")), value);
  const text = JSON.stringify(value);
  for (const word of banned) assert.equal(text.includes(word), false, word);
}

const BANNED = ["Example Vendor", "Sample Vendor", "Example Platform", "match rate"];

test("thresholds stay the locked Data Strategist v1 values", () => {
  assert.equal(Object.isFrozen(AUDIENCE_P1_THRESHOLDS), true);
  assert.equal(AUDIENCE_P1_THRESHOLDS.probabilityToBeatBest, 0.95);
  assert.equal(AUDIENCE_P1_THRESHOLDS.probabilityToBeatBest, SEGMENT_ENGINE_V1.probabilityToBeatBest);
  assert.equal(AUDIENCE_P1_THRESHOLDS.twoProportionAlpha, 0.05);
  assert.equal(AUDIENCE_P1_THRESHOLDS.minConversionsPerArm, 100);
  assert.equal(AUDIENCE_P1_THRESHOLDS.minDays, 7);
  assert.equal(AUDIENCE_P1_THRESHOLDS.maxDays, 28);
  assert.equal(AUDIENCE_P1_THRESHOLDS.lowMatchRate, 0.3);
  assert.equal(AUDIENCE_P1_THRESHOLDS.cutAfterMinimumSample, true);
  assert.equal(AUDIENCE_P1_THRESHOLDS.campaignWrite, false);
  assert.equal(AUDIENCE_P1_THRESHOLDS.adAccountWrite, false);
  resolveSegmentSettings({ minDays: 1, minConversionsPerArm: 30, probabilityToBeatBest: 0.5 });
  assert.equal(AUDIENCE_P1_THRESHOLDS.minDays, 7);
  assert.equal(AUDIENCE_P1_THRESHOLDS.minConversionsPerArm, 100);
  const model = presentThresholds();
  assert.equal(model.locked, true);
  assertNoCost(model);
  const html = renderToStaticMarkup(createElement(ThresholdScreen, { model }));
  assert.equal(html.includes("<input"), false);
  assert.match(html, /95%/);
  assert.match(html, /under 0\.05/);
  assert.match(html, /100/);
  assert.match(html, /under 30%/);
  assert.match(html, /cannot change them/);
  assert.match(readFileSync(path.join(ROOT, "app/api/marketing/audience-p1/thresholds/route.ts"), "utf8"), /staffOnlyStatus/);
});

test("lineage filters the next column and hides vendor fields from clients", () => {
  const staff = presentLineage("staff");
  const client = presentLineage("client");
  const share = presentLineage("share", { source: "sample-pool" });
  assert.deepEqual(staff.columns.map((column) => column.title), [
    "Source",
    "Segment (campaign)",
    "Sub-segment (ad set)",
    "Audience",
    "Leads",
    "Conversions",
  ]);
  assert.equal(staff.columns.every((column) => column.nodes.every((node) => node.count > 0 && node.shareOfParent > 0 && node.shareOfParent <= 1)), true);
  const switched = presentLineage("staff", { source: "sample-pool" });
  const segments = switched.columns.find((column) => column.id === "segment");
  assert.equal(segments?.nodes.some((node) => node.id === "ex-campaign"), false);
  assert.equal(segments?.nodes[0]?.id, "sample-campaign");
  assert.match(switched.pathSummary, /Sample Pool/);
  assert.match(switched.basedOn, /Based on:/);
  assert.match(switched.basedOn, /Example Vendor|Sample Vendor/);
  assert.match(client.basedOn, /^Based on:/);
  assertNoCost(client, BANNED);
  assertNoCost(share, BANNED);
  assert.equal(share.columns[0]?.nodes.find((node) => node.selected)?.id, "sample-pool");
  assert.equal(client.banner, "EXAMPLE DATA");
  assert.equal(client.mobile, "stepper");
  const html = renderToStaticMarkup(createElement(LineageScreen, { model: client }));
  assert.match(html, /EXAMPLE DATA/);
  assert.match(html, /Based on:/);
  assert.match(html, /% of parent/);
  assert.match(html, /<table/);
  assert.match(html, /data-mobile="stepper"/);
  assert.equal(html.includes("Example Vendor"), false);
});

test("drill-down covers every dimension with lift, sample, confidence, and provenance", () => {
  for (const dimension of DRILL_DIMENSIONS) {
    const client = presentDrill("client", dimension);
    const share = presentDrill("share", dimension);
    assert.equal(client.dimension, dimension);
    assert.equal(client.rows.length >= 2, true);
    for (const row of client.rows) {
      assert.match(row.liftLabel, /the parent/);
      assert.match(row.sampleLabel, /verified-human conversions/);
      assert.match(row.confidence, /High|Medium|Low/);
      assert.ok(row.confidenceBars >= 1);
      assert.match(row.whyLabel, /Why it converts|Why it lags/);
      assert.match(row.why, /\w/);
      assert.match(row.basedOn, /^Based on:/);
      assert.match(row.chip, /SCALE|CUT|TEST MORE|STILL LEARNING/);
    }
    assert.match(client.overlapNote, /overlap/i);
    assertNoCost(client, BANNED);
    assertNoCost(share, BANNED);
  }
  const geo = presentDrill("staff", "geo");
  assert.equal(geo.rows[0]?.chip, "SCALE");
  assert.equal(geo.rows[1]?.chip, "STILL LEARNING");
  assert.match(geo.rows[0]?.basedOn ?? "", /Example Vendor/);
  const html = renderToStaticMarkup(createElement(DrillScreen, { model: presentDrill("client", "geo") }));
  assert.match(html, /Why it converts/);
  assert.match(html, /Why it lags/);
  assert.match(html, /Groups can overlap/);
  assert.match(html, /EXAMPLE DATA/);
  assert.match(html, /<table/);
});

test("head-to-head shows every state and enforces the locked winner rules", () => {
  resetAudienceDecisions();
  const staff = presentTests("staff");
  const client = presentTests("client");
  const share = presentTests("share");
  assert.deepEqual(staff.tests.map((test) => test.status), ["still_learning", "winner", "no_clear_winner", "stopped"]);
  assert.deepEqual(staff.tests.map((test) => test.label), ["Still learning", "Winner found", "No clear winner", "Stopped"]);
  const winner = staff.tests[1];
  assert.ok(winner);
  assert.equal(winner?.checklist.length, 4);
  assert.equal(winner?.checklist.every((line) => line.met), true);
  assert.match(winner?.checklist.map((line) => line.text).join(" "), /95%/);
  assert.match(winner?.checklist.map((line) => line.text).join(" "), /0\.05/);
  assert.match(winner?.checklist.map((line) => line.text).join(" "), /100/);
  assert.match(winner?.checklist.map((line) => line.text).join(" "), /7 days/);
  assert.equal(staff.tests[2]?.dayLabel, "Day 28");
  assert.equal(staff.tests[0]?.onHold, true);
  assert.match(staff.tests[0]?.holdLabel ?? "", /low match rate/);
  assert.equal(client.tests[0]?.holdLabel, "On hold");
  assert.equal(staff.tests[3]?.status, "stopped");
  assert.match(staff.tests[3]?.summary ?? "", /Stopped/);
  assertNoCost(client, BANNED);
  assertNoCost(share, BANNED);
  assert.equal(cutAllowed({ successes: 99, days: 10 }), false);
  assert.equal(cutAllowed({ successes: 100, days: 6 }), false);
  assert.equal(cutAllowed({ successes: 100, days: 7 }), true);
  const lines = checklistFor({ probability: 0.94, pValue: 0.04, arms: [{ successes: 100, days: 7 }, { successes: 100, days: 7 }] });
  assert.equal(lines[0]?.met, false);
  assert.equal(lines.every((line) => line.met), false);
  const learning = decideExample({ testId: "learning", action: "scale", who: "Dana Example", at: "2026-10-31T22:00:00.000Z" });
  assert.equal(learning.ok, false);
  assert.match(learning.error, /On hold/);
  assert.equal(learning.campaignWrite, false);
  const earlyCut = decideExample({ testId: "learning", action: "cut", who: "Dana Example", at: "2026-10-31T22:01:00.000Z" });
  assert.equal(earlyCut.ok, false);
  assert.match(earlyCut.error, /minimum sample/);
  const stopped = decideExample({ testId: "stopped", action: "scale", who: "Dana Example", at: "2026-10-31T22:02:00.000Z" });
  assert.equal(stopped.ok, false);
  const scaled = decideExample({ testId: "winner", action: "scale", who: "Dana Example", at: "2026-10-31T22:03:00.000Z" });
  assert.equal(scaled.ok, true);
  if (scaled.ok) {
    assert.equal(scaled.campaignWrite, false);
    assert.equal(scaled.adAccountWrite, false);
    assert.equal(scaled.message, "logged only");
    assert.equal(scaled.manualSteps.length, 3);
    assert.match(scaled.manualSteps.join(" "), /by hand/);
    assert.equal(scaled.who, "Dana Example");
  }
  const cut = decideExample({ testId: "winner", action: "cut", who: "Dana Example", at: "2026-10-31T22:04:00.000Z" });
  assert.equal(cut.ok, true);
  assert.equal(cut.campaignWrite, false);
  const html = renderToStaticMarkup(createElement(TestsScreen, { model: client, staff: false }));
  assert.match(html, /Still learning/);
  assert.match(html, /Winner found/);
  assert.match(html, /No clear winner/);
  assert.match(html, /Day 28/);
  assert.match(html, /Stopped/);
  assert.match(html, /Met/);
  assert.match(html, /Not met/);
  assert.match(html, /EXAMPLE DATA/);
  assert.match(html, /No write access approved/);
  assert.equal(html.includes("Example Vendor"), false);
  assert.equal(html.includes("match rate"), false);
  for (const role of ["client_viewer", "all_clients_viewer", "demo_viewer", "viewer"]) {
    assert.equal(staffOnlyStatus(role), 403);
  }
  assert.equal(clientViewerAllowed("/audience-data/lineage", {}), false);
  assert.equal(clientViewerAllowed("/audience-data/drill", { AUDIENCE_DATA_P1: "on" }), true);
  assert.equal(clientViewerAllowed("/audience-data/tests", { AUDIENCE_DATA_P1: "on" }), true);
  assert.equal(clientViewerAllowed("/api/marketing/audience-p1/tests/decide", { AUDIENCE_DATA_P1: "on" }), false);
  assert.equal(clientViewerAllowed("/settings/audience-thresholds", { AUDIENCE_DATA_P1: "on" }), false);
  const decide = readFileSync(path.join(ROOT, "app/api/marketing/audience-p1/tests/decide/route.ts"), "utf8");
  assert.match(decide, /staffOnlyStatus/);
  assert.match(decide, /campaignWrite: false/);
  assert.equal(decide.includes("fetch("), false);
  const css = readFileSync(path.join(ROOT, "components/audience-p1/audience-p1.css"), "utf8");
  assert.match(css, /flex-direction: column/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /:focus-visible/);
});

test("scale and cut logs survive a restart and stay off the client screen", async () => {
  const tables = createP1LogTables();
  const writer = memoryP1LogStore(tables);
  const scaled = await saveAudienceDecision(writer, "org", { testId: "winner", action: "scale", who: "Dana Example", at: "2026-10-31T22:03:00.000Z" });
  assert.equal(scaled.ok, true);
  if (scaled.ok) assert.equal(scaled.campaignWrite, false);
  const cut = await saveAudienceDecision(writer, "org", { testId: "winner", action: "cut", who: "Dana Example", at: "2026-10-31T22:04:00.000Z" });
  assert.equal(cut.ok, true);
  const refused = await saveAudienceDecision(writer, "org", { testId: "learning", action: "cut", who: "Dana Example", at: "2026-10-31T22:05:00.000Z" });
  assert.equal(refused.ok, false);
  const restarted = memoryP1LogStore(tables);
  const log = await loadAudienceDecisions(restarted, "org");
  assert.equal(log.length, 2);
  assert.equal(log[0]?.action, "cut");
  assert.equal(log[0]?.who, "Dana Example");
  assert.equal(log[0]?.campaignWrite, false);
  assert.equal(log[0]?.adAccountWrite, false);
  assert.equal(log[0]?.message, "logged only");
  assert.equal(log[1]?.action, "scale");
  assert.equal((await restarted.listDecisions("other")).length, 0);
  assertNoCost(forReader(log, "client"));
  assertNoCost(forReader(log, "share"));
  const hidden = renderToStaticMarkup(createElement(TestsScreen, { model: presentTests("client"), staff: false, log }));
  assert.equal(hidden.includes("Dana Example"), false);
  assert.equal(hidden.includes("Example Vendor"), false);
  const shown = renderToStaticMarkup(createElement(TestsScreen, { model: presentTests("staff"), staff: true, log }));
  assert.match(shown, /Dana Example/);
  assert.match(shown, /EXAMPLE DATA/);
  assert.match(shown, /logged only/);
  assert.match(shown, /No write access approved/);
  assert.equal(shown.includes(">YES<"), false);
});

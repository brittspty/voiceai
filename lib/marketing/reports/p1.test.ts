import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { forbiddenClientKeys, omitForbiddenClientFields, sealClientReport } from "../client-view";
import { collectsCostKeys, stripForAudience } from "../channels/cost-strip";
import { audienceDataP1Enabled, reportsP1Enabled } from "../config";
import { clientViewerAllowed } from "../client-gate";
import { staffOnlyStatus } from "../p1-reader";
import { exampleReportSource } from "./example-source";
import { addChartAnnotation, resetChartAnnotations, withUserAnnotations } from "./p1/annotations";
import { channelFromReport } from "./p1/channel";
import { resolveReportCompare, yearAgoValue } from "./p1/compare";
import { createSchedule, deliverScheduledReport, presentSchedules, resetSchedules } from "./p1/schedule";
import { captureMode, isLiveShareMarker, liveShareMarker, materializeShare, shareBody } from "./p1/share";
import { parseReportQuery, reportHref } from "./query";
import { ScheduleScreen } from "../../../components/reports/schedule-screen";
import { ChannelScreen } from "../../../components/reports/channel-screen";

const ROOT = path.resolve(import.meta.dirname, "../../..");

function assertNoCost(value: unknown) {
  assert.deepEqual(collectsCostKeys(value), []);
  assert.deepEqual(forbiddenClientKeys(value), []);
  assert.deepEqual(omitForbiddenClientFields(stripForAudience(value, "share")), value);
}

test("REPORTS_P1 and AUDIENCE_DATA_P1 default off", () => {
  assert.equal(reportsP1Enabled({}), false);
  assert.equal(reportsP1Enabled({ REPORTS_P1: "off" }), false);
  assert.equal(reportsP1Enabled({ REPORTS_P1: "on" }), true);
  assert.equal(audienceDataP1Enabled({}), false);
  const example = readFileSync(path.join(ROOT, ".env.example"), "utf8");
  assert.match(example, /REPORTS_P1=off/);
  assert.match(example, /AUDIENCE_DATA_P1=off/);
  assert.equal(clientViewerAllowed("/reports/channels/meta", {}), false);
  assert.equal(clientViewerAllowed("/reports/schedules", {}), false);
  assert.equal(clientViewerAllowed("/api/marketing/reports/p1/annotations", {}), false);
  assert.equal(clientViewerAllowed("/reports", {}), true);
  assert.equal(clientViewerAllowed("/reports/print", {}), true);
  assert.equal(clientViewerAllowed("/reports/channels/meta", { REPORTS_P1: "on" }), true);
  assert.equal(clientViewerAllowed("/api/marketing/reports/p1/annotations", { REPORTS_P1: "on" }), false);
});

test("same period last year is ignored until REPORTS_P1 is on", async () => {
  assert.equal(resolveReportCompare("yoy", false), "prior");
  assert.equal(resolveReportCompare("yoy", true), "yoy");
  assert.equal(resolveReportCompare("none", true), "none");
  assert.equal(parseReportQuery({ compare: "yoy" }, {}).compare, "prior");
  assert.equal(parseReportQuery({ compare: "yoy" }, { REPORTS_P1: "on" }).compare, "yoy");
  assert.match(reportHref({ range: "30d", compare: "yoy", clientId: "all" }), /compare=yoy/);
  const prior = await exampleReportSource.load({ range: "30d", compare: "prior", clientId: "all" });
  const yoy = await exampleReportSource.load({ range: "30d", compare: "yoy", clientId: "all" });
  assert.equal(yoy.compare, "yoy");
  assert.equal(yoy.compareLabel, "same period last year");
  assert.equal(yoy.exampleData, true);
  assert.notEqual(yoy.series[0]?.points[0]?.prior, prior.series[0]?.points[0]?.prior);
  assert.equal(yoy.series[0]?.points[0]?.prior, yearAgoValue(yoy.series[0]?.points[0]?.value ?? 0, 0));
  assert.equal(prior.compareLabel, "prior period");
});

test("the cohort heatmap already ships in Reports v2", () => {
  const charts = readFileSync(path.join(ROOT, "components/reports/charts.tsx"), "utf8");
  assert.match(charts, /type: "heatmap"/);
  assert.match(charts, /tabIndex=\{0\}/);
  assert.match(charts, /View as table/);
  const screen = readFileSync(path.join(ROOT, "components/reports/report-screen.tsx"), "utf8");
  assert.match(screen, /CohortChart/);
});

test("staff chart notes record who and when and stay off the client payload", async () => {
  resetChartAnnotations();
  const note = addChartAnnotation({
    seriesId: "qualified",
    date: "2026-10-09",
    body: "Qualified leads rose after the example change.",
    authorName: "Dana Example",
    loggedAt: "2026-10-31T22:00:00.000Z",
  });
  assert.ok(!("error" in note));
  if ("error" in note) return;
  assert.equal(note.authorName, "Dana Example");
  assert.equal(note.loggedAt, "2026-10-31T22:00:00.000Z");
  const staff = await exampleReportSource.load({ range: "30d", compare: "prior", clientId: "all" });
  const merged = withUserAnnotations(staff, [note], true);
  assert.equal(withUserAnnotations(staff, [note], false), staff);
  const client = sealClientReport(merged);
  assert.match(JSON.stringify(merged.annotations), /Dana Example/);
  assert.equal(JSON.stringify(client.annotations).includes("Dana Example"), false);
  assert.equal(JSON.stringify(client.annotations).includes("loggedAt"), false);
  assert.match(JSON.stringify(client.annotations), /Qualified leads rose/);
  const costly = addChartAnnotation({
    seriesId: "qualified",
    date: "2026-10-10",
    body: "The cost line moved.",
    authorName: "Dana Example",
    loggedAt: "2026-10-31T22:05:00.000Z",
  });
  assert.ok(!("error" in costly));
  if ("error" in costly) return;
  const hidden = sealClientReport(withUserAnnotations(staff, [costly], true));
  assert.match(JSON.stringify(hidden.annotations), /A note was added to this chart/);
  assert.equal(JSON.stringify(hidden).includes("The cost line"), false);
});

test("share links stay snapshots unless Keep live is on", async () => {
  const staff = await exampleReportSource.load({ range: "30d", compare: "prior", clientId: "harbor" });
  const sealed = sealClientReport(staff);
  assert.equal(captureMode({ enabled: false, keepLive: true }), "snapshot");
  assert.equal(captureMode({ enabled: true, keepLive: false }), "snapshot");
  assert.equal(captureMode({ enabled: true, keepLive: true }), "live");
  const frozen = shareBody({ enabled: true, keepLive: false, sealed, query: staff });
  assert.equal(frozen, sealed);
  const marker = shareBody({ enabled: false, keepLive: true, sealed, query: staff });
  assert.equal(marker, sealed);
  const live = liveShareMarker(staff);
  assert.equal(isLiveShareMarker(live), true);
  assertNoCost(live);
  const opened = await materializeShare(live, true, async () => staff);
  assert.equal(opened.audience, "client");
  assert.equal(opened.exampleData, true);
  assertNoCost(opened);
  assert.deepEqual(await materializeShare(sealed, false), sealed);
  assert.equal(JSON.stringify(opened).includes("Dana Example"), false);
});

test("scheduled reports force client copies to NO and only log would send", () => {
  resetSchedules();
  const client = presentSchedules("client");
  const share = presentSchedules("share");
  const staff = presentSchedules("staff");
  assertNoCost(client);
  assertNoCost(share);
  assert.equal(client.rows.every((row) => row.moneyInCopy === "NO" && row.audience === "client"), true);
  assert.equal(JSON.stringify(client).includes("YES"), false);
  assert.equal(staff.rows.some((row) => row.moneyInCopy === "YES"), true);
  const forced = createSchedule({ name: "Example extra client", audience: "client", moneyInCopy: "YES" });
  assert.ok(!("error" in forced));
  if ("error" in forced) return;
  assert.equal(forced.moneyInCopy, "NO");
  const sent = deliverScheduledReport(forced.id);
  assert.ok(sent);
  assert.equal(sent?.message, "would send");
  assert.equal(sent?.sent, false);
  assert.equal(sent?.email, false);
  assert.equal(sent?.sms, false);
  assert.equal(sent?.push, false);
  assert.equal(sent?.moneyInCopy, "NO");
  const html = renderToStaticMarkup(createElement(ScheduleScreen, { model: presentSchedules("client"), staff: false }));
  assert.match(html, /Includes cost\?/);
  assert.match(html, />NO</);
  assert.equal(html.includes(">YES<"), false);
  assert.match(html, /EXAMPLE DATA/);
  assert.match(html, /would send/);
});

test("channel reports strip cost for client and share readers", async () => {
  const staffReport = await exampleReportSource.load({ range: "30d", compare: "prior", clientId: "all" });
  const staff = channelFromReport(staffReport, "meta", "staff");
  const client = channelFromReport(staffReport, "meta", "client");
  const share = channelFromReport(staffReport, "meta", "share");
  assert.ok(staff && client && share);
  assert.equal(staff?.name, "Meta");
  assert.equal(client?.name, "Facebook & Instagram ads");
  assert.equal("cpl" in (client || {}), false);
  assert.equal("cpl" in (share || {}), false);
  assertNoCost(client);
  assertNoCost(share);
  assert.equal(client?.exampleData, true);
  assert.equal(channelFromReport(staffReport, "missing", "client"), null);
  const html = renderToStaticMarkup(createElement(ChannelScreen, { model: client! }));
  assert.match(html, /EXAMPLE DATA/);
  assert.match(html, /<table/);
  assert.match(html, /tabindex="0"/);
  assert.equal(html.includes("CPL"), false);
  const css = readFileSync(path.join(ROOT, "components/reports/report.css"), "utf8");
  assert.match(css, /\.jr-p1 \.jr-chart/);
  assert.match(css, /grid-template-columns: 1fr/);
  assert.match(css, /min-height: 44px/);
});

test("client roles are refused on staff-only report routes", () => {
  for (const role of ["viewer", "client_viewer", "all_clients_viewer", "demo_viewer"]) {
    assert.equal(staffOnlyStatus(role), 403);
  }
  assert.equal(staffOnlyStatus(null), 401);
  assert.equal(staffOnlyStatus("account_manager"), 200);
  assert.equal(staffOnlyStatus("super_admin"), 200);
  const annotations = readFileSync(path.join(ROOT, "app/api/marketing/reports/p1/annotations/route.ts"), "utf8");
  const schedules = readFileSync(path.join(ROOT, "app/api/marketing/reports/p1/schedules/route.ts"), "utf8");
  const channel = readFileSync(path.join(ROOT, "app/api/marketing/reports/p1/channels/[channelId]/route.ts"), "utf8");
  assert.match(annotations, /staffOnlyStatus/);
  assert.match(annotations, /reportsP1Enabled/);
  assert.match(schedules, /presentSchedules/);
  assert.match(schedules, /forReader/);
  assert.match(schedules, /staffOnlyStatus/);
  assert.match(channel, /buildChannelReport/);
  assert.match(readFileSync(path.join(ROOT, "lib/marketing/reports/p1/schedule.ts"), "utf8"), /would send/);
  assert.equal(readFileSync(path.join(ROOT, "lib/marketing/reports/p1/schedule.ts"), "utf8").includes("fetch("), false);
});

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
import { saveAudienceDecision } from "../audience-p1/decide";
import { createP1LogTables, createPrismaP1LogStore, memoryP1LogStore, type P1LogStore, type P1Prisma } from "../p1-log-store";
import { forReader, staffOnlyStatus } from "../p1-reader";
import { exampleReportSource } from "./example-source";
import { loadStaffReport } from "./load";
import { addChartAnnotation, notesForReport, resetChartAnnotations, saveChartAnnotation, withUserAnnotations } from "./p1/annotations";
import { channelFromReport } from "./p1/channel";
import { resolveReportCompare, yearAgoValue } from "./p1/compare";
import { createSchedule, createScheduleStored, deliverScheduleStored, deliverScheduledReport, EXAMPLE_SCHEDULES, loadScheduleRows, presentDeliveries, presentSchedules, resetSchedules } from "./p1/schedule";
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

test("REPORTS_P1 off does not read stored chart notes", async () => {
  assert.equal(reportsP1Enabled(), false);
  let calls = 0;
  const read = async () => {
    calls += 1;
    return [];
  };
  assert.deepEqual(await notesForReport(false, read), []);
  assert.equal(calls, 0);
  assert.deepEqual(await notesForReport(true, read), []);
  assert.equal(calls, 1);
  const report = await loadStaffReport({ range: "7d", compare: "none", clientId: "persist-check" }, 50_000, read);
  assert.equal(calls, 1);
  assert.equal(report.audience, "staff");
  const loadSource = readFileSync(path.join(ROOT, "lib/marketing/reports/load.ts"), "utf8");
  assert.match(loadSource, /reportsP1Enabled\(\)/);
  assert.match(loadSource, /notesForReport\(enabled/);
  assert.match(loadSource, /p1-log-prisma/);
});

function fakePrisma(): P1Prisma {
  const notes: {
    id: string;
    workspaceId: string;
    seriesId: string;
    noteDate: string;
    label: string;
    body: string;
    clientBody: string;
    authorName: string;
    loggedAt: Date;
  }[] = [];
  const schedules: {
    workspaceId: string;
    id: string;
    name: string;
    cadence: string;
    audience: string;
    moneyInCopy: string;
    exampleData: boolean;
    createdAt: Date;
  }[] = [];
  const deliveries: {
    id: string;
    workspaceId: string;
    scheduleId: string;
    at: Date;
    audience: string;
    moneyInCopy: string;
    message: string;
    sent: boolean;
    email: boolean;
    sms: boolean;
    push: boolean;
  }[] = [];
  const decisions: {
    id: string;
    workspaceId: string;
    at: Date;
    who: string;
    testId: string;
    action: string;
    campaignWrite: boolean;
    adAccountWrite: boolean;
    manualSteps: unknown;
    message: string;
  }[] = [];
  return {
    reportChartNote: {
      async findMany(args) {
        return notes.filter((row) => row.workspaceId === args.where.workspaceId);
      },
      async create(args) {
        notes.push(args.data);
        return args.data;
      },
    },
    reportSchedule: {
      async findMany(args) {
        return schedules.filter((row) => row.workspaceId === args.where.workspaceId);
      },
      async upsert(args) {
        const key = args.where.workspaceId_id;
        const found = schedules.find((row) => row.workspaceId === key.workspaceId && row.id === key.id);
        if (found) return found;
        schedules.push(args.create);
        return args.create;
      },
    },
    reportScheduleDelivery: {
      async findMany(args) {
        return deliveries.filter((row) => row.workspaceId === args.where.workspaceId);
      },
      async create(args) {
        deliveries.push(args.data);
        return args.data;
      },
    },
    audienceScaleCutLog: {
      async findMany(args) {
        return decisions.filter((row) => row.workspaceId === args.where.workspaceId);
      },
      async create(args) {
        decisions.push(args.data);
        return args.data;
      },
    },
  };
}

async function assertLogsSurviveRestart(open: () => P1LogStore) {
  const writer = open();
  const note = await saveChartAnnotation(writer, "org", {
    seriesId: "qualified",
    date: "2026-10-09",
    body: "Qualified leads rose after the example change.",
    authorName: "Dana Example",
    loggedAt: "2026-10-31T22:00:00.000Z",
  });
  assert.equal("error" in note, false);
  const costly = await saveChartAnnotation(writer, "org", {
    seriesId: "qualified",
    date: "2026-10-10",
    body: "The cost line moved.",
    authorName: "Dana Example",
    loggedAt: "2026-10-31T22:06:00.000Z",
  });
  assert.equal("error" in costly, false);
  const created = await createScheduleStored(writer, "org", { name: "Example extra client", audience: "client", moneyInCopy: "YES" });
  assert.equal("error" in created, false);
  if ("error" in created) return;
  assert.equal(created.moneyInCopy, "NO");
  const sent = await deliverScheduleStored(writer, "org", created.id, "2026-10-31T22:07:00.000Z");
  assert.ok(sent);
  assert.equal(sent?.message, "would send");
  assert.equal(sent?.sent, false);
  const staffSent = await deliverScheduleStored(writer, "org", "ex-staff-week", "2026-10-31T22:08:00.000Z");
  assert.equal(staffSent?.moneyInCopy, "YES");
  assert.equal(staffSent?.email, false);
  assert.equal(staffSent?.sms, false);
  assert.equal(staffSent?.push, false);
  const scaled = await saveAudienceDecision(writer, "org", { testId: "winner", action: "scale", who: "Dana Example", at: "2026-10-31T22:09:00.000Z" });
  assert.equal(scaled.ok, true);
  const refused = await saveAudienceDecision(writer, "org", { testId: "learning", action: "scale", who: "Dana Example", at: "2026-10-31T22:10:00.000Z" });
  assert.equal(refused.ok, false);

  const reader = open();
  const notes = await reader.listNotes("org");
  assert.equal(notes.length, 2);
  assert.equal(notes[0]?.authorName, "Dana Example");
  assert.equal(notes[0]?.loggedAt, "2026-10-31T22:00:00.000Z");
  assert.equal(notes[1]?.clientBody, "A note was added to this chart.");
  assert.equal((await reader.listNotes("other")).length, 0);

  const rows = await loadScheduleRows(reader, "org");
  const clientView = presentSchedules("client", rows);
  const shareView = presentSchedules("share", rows);
  const staffView = presentSchedules("staff", rows);
  assertNoCost(clientView);
  assertNoCost(shareView);
  assert.equal(clientView.rows.every((row) => row.moneyInCopy === "NO" && row.audience === "client"), true);
  assert.equal(JSON.stringify(clientView).includes("YES"), false);
  assert.equal(JSON.stringify(shareView).includes("YES"), false);
  assert.equal(clientView.banner, "EXAMPLE DATA");
  assert.equal(staffView.rows.some((row) => row.id === created.id && row.moneyInCopy === "NO"), true);
  assert.equal(staffView.rows.some((row) => row.moneyInCopy === "YES"), true);

  const storedDeliveries = await reader.listDeliveries("org");
  const clientDeliveries = presentDeliveries("client", storedDeliveries);
  const shareDeliveries = presentDeliveries("share", storedDeliveries);
  assert.equal(storedDeliveries[0]?.message, "would send");
  assert.equal(storedDeliveries.every((row) => row.sent === false && row.email === false && row.sms === false && row.push === false), true);
  assert.equal(storedDeliveries.some((row) => row.audience === "staff" && row.moneyInCopy === "YES"), true);
  assertNoCost(clientDeliveries);
  assertNoCost(shareDeliveries);
  assert.equal(JSON.stringify(clientDeliveries).includes("YES"), false);
  assert.equal(JSON.stringify(shareDeliveries).includes("YES"), false);
  assert.equal(clientDeliveries.rows.length, 1);

  const decisions = await reader.listDecisions("org");
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0]?.who, "Dana Example");
  assert.equal(decisions[0]?.action, "scale");
  assert.equal(decisions[0]?.at, "2026-10-31T22:09:00.000Z");
  assert.equal(decisions[0]?.campaignWrite, false);
  assert.equal(decisions[0]?.adAccountWrite, false);
  assert.equal(decisions[0]?.message, "logged only");
  assert.equal((await reader.listDecisions("other")).length, 0);
  assertNoCost(forReader(decisions, "client"));
  assertNoCost(forReader(decisions, "share"));

  const staff = await exampleReportSource.load({ range: "30d", compare: "prior", clientId: "all" });
  const sealed = sealClientReport(withUserAnnotations(staff, notes, true));
  assertNoCost(sealed);
  assert.equal(JSON.stringify(sealed).includes("Dana Example"), false);
  assert.equal(JSON.stringify(sealed).includes("loggedAt"), false);
  assert.equal(JSON.stringify(sealed).includes("The cost line"), false);
  assert.match(JSON.stringify(sealed), /A note was added to this chart/);
}

test("chart notes, schedules, and scale/cut logs survive a restart", async () => {
  const tables = createP1LogTables();
  await assertLogsSurviveRestart(() => memoryP1LogStore(tables));
  const database = fakePrisma();
  await assertLogsSurviveRestart(() => createPrismaP1LogStore(database));
});

test("the persistence migration only adds tables", () => {
  const schema = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
  const user = schema.slice(schema.indexOf("model User {"), schema.indexOf("model Session {"));
  for (const name of ["ReportChartNote", "ReportSchedule", "ReportScheduleDelivery", "AudienceScaleCutLog", "PushPreference"]) {
    assert.equal(user.includes(name), false, name);
  }
  for (const name of ["model ReportChartNote {", "model ReportSchedule {", "model ReportScheduleDelivery {", "model AudienceScaleCutLog {"]) {
    assert.equal(schema.includes(name), true, name);
  }
  const sql = readFileSync(path.join(ROOT, "prisma/migrations/20261101120000_p1_notes_schedules_scale_cut/migration.sql"), "utf8");
  assert.equal(sql.includes("ALTER TABLE"), false);
  assert.match(sql, /EXAMPLE DATA/);
  assert.match(sql, /would send/);
  for (const row of EXAMPLE_SCHEDULES) {
    assert.equal(sql.includes(row.id), true, row.id);
    assert.equal(sql.includes(row.name), true, row.name);
  }
  assert.match(sql, /'client', 'NO'/);
  for (const banned of ["PushPreference", "CtvExposure", "CtvHousehold", "\"User\"", "budget", "bid"]) {
    assert.equal(sql.includes(banned), false, banned);
  }
  const writes = [
    "app/api/marketing/reports/p1/annotations/route.ts",
    "app/api/marketing/reports/p1/schedules/route.ts",
    "app/api/marketing/audience-p1/tests/decide/route.ts",
  ];
  const fns = ["saveChartAnnotation", "createScheduleStored", "saveAudienceDecision"];
  writes.forEach((file, index) => {
    const source = readFileSync(path.join(ROOT, file), "utf8");
    const gate = source.indexOf("staffOnlyStatus(user.role)");
    const call = source.indexOf(`await ${fns[index]}`);
    assert.ok(gate > 0 && call > gate, file);
    assert.equal(source.includes("fetch("), false, file);
  });
  for (const role of ["viewer", "client_viewer", "all_clients_viewer", "demo_viewer"]) {
    assert.equal(staffOnlyStatus(role), 403);
  }
  for (const file of ["lib/marketing/p1-log-store.ts", "lib/marketing/p1-log-prisma.ts", "lib/marketing/reports/p1/schedule.ts", "lib/marketing/audience-p1/decide.ts"]) {
    const source = readFileSync(path.join(ROOT, file), "utf8");
    assert.equal(source.includes("fetch("), false, file);
    assert.equal(/daily_budget|lifetime_budget|bid_amount|budgetAmount/.test(source), false, file);
  }
});

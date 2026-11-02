import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { zonedISODate, zonedParts } from "../time";
import { channelColumns } from "./channels/columns";
import { deliverUrgentEmail, setUrgentEmailOptIn, snoozeUntil, urgentEmailOptIn } from "./channels/feed";
import { jarvisNav } from "./channels/nav";
import { clientViewerAllowed } from "./client-gate";
import { clientCostFields, contractEndpoint, readScopedClient, scopedBodyIsClean } from "./client-contract";
import { decisionVisibleText } from "./decision-ui";
import { recordLeadMark, undoLoggedLead } from "./lead-undo";
import { ALERT_AFTER_FAILURES, HEALTHY_INTERVAL_MS } from "./pages/policy";

const ROOT = path.resolve(import.meta.dirname, "../..");
const POISON = {
  spend: 9,
  budget: 8,
  cost: 7,
  cpl: 6,
  cpql: 5,
  roas: 4,
  budgetAmount: 3,
  costPerLead: 2,
  leads: 11,
  nested: { clicks: 4, roas: 1 },
};

function files(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) found.push(...files(full));
    else if (name === "route.ts") found.push(full);
  }
  return found;
}

function routeUrl(file: string) {
  const rel = path.relative(path.join(ROOT, "app"), file).split(path.sep);
  const parts = rel.filter((part) => part !== "route.ts" && !part.startsWith("("));
  const url = `/${parts.map((part) => (part.startsWith("[") ? "x" : part)).join("/")}`;
  return url.replace(/\/$/, "") || "/";
}

test("every client owner, client viewer, and share endpoint strips spend, budget, cost, CPL, CPQL, and ROAS", () => {
  const jarvis = { JARVIS_UI_V2: "on" };
  const payloadRoutes: string[] = [];
  for (const file of files(path.join(ROOT, "app/api"))) {
    const url = routeUrl(file);
    const allowed = clientViewerAllowed(url) || clientViewerAllowed(url, jarvis) || url.startsWith("/api/share");
    if (!allowed) continue;
    const source = readFileSync(file, "utf8");
    if (url.includes("/passcode") || url === "/api/health" || url === "/api/auth/logout" || url === "/api/homepage/contact") continue;
    if (source.includes("export { GET }")) {
      const target = path.resolve(path.dirname(file), "../route.ts");
      assert.match(readFileSync(target, "utf8"), /readScopedClient/, url);
    } else {
      assert.match(source, /readScopedClient/, url);
    }
    payloadRoutes.push(url);
  }
  assert.ok(payloadRoutes.includes("/api/marketing/client"));
  assert.ok(payloadRoutes.includes("/api/marketing/client/export"));
  assert.ok(payloadRoutes.includes("/api/share/x"));
  assert.ok(payloadRoutes.includes("/api/marketing/reports"));
  assert.ok(payloadRoutes.includes("/api/marketing/reports/export"));
  assert.ok(payloadRoutes.includes("/api/marketing/jarvis/home"));
  for (const url of payloadRoutes) {
    const result = contractEndpoint(POISON, {
      ownClientId: "harbor",
      assignedClientIds: ["harbor"],
      requestedClientId: "other",
    });
    for (const row of result.bodies) {
      assert.equal(row.read.ok, true, `${url} ${row.kind}`);
      if (!row.read.ok) continue;
      assert.deepEqual(clientCostFields(row.read.body), [], `${url} ${row.kind}`);
      assert.equal(scopedBodyIsClean(row.read.body), true, `${url} ${row.kind}`);
      assert.equal((row.read.body as { leads: number }).leads, 11);
    }
    assert.equal(result.foreign.ok, false, url);
  }
});

test("an account manager is refused another client's payload", () => {
  const refused = readScopedClient({
    kind: "account_manager",
    ownClientId: "harbor",
    assignedClientIds: ["harbor", "gulf"],
    requestedClientId: "other",
    payload: POISON,
  });
  assert.equal(refused.ok, false);
  assert.equal(refused.ok ? false : refused.status, 403);
  const allowed = readScopedClient({
    kind: "account_manager",
    ownClientId: "harbor",
    assignedClientIds: ["harbor", "gulf"],
    requestedClientId: "gulf",
    payload: POISON,
  });
  assert.equal(allowed.ok, true);
  const feed = readFileSync(path.join(ROOT, "app/api/marketing/jarvis/feed/route.ts"), "utf8");
  const reports = readFileSync(path.join(ROOT, "app/api/marketing/reports/route.ts"), "utf8");
  assert.match(feed, /readScopedClient/);
  assert.match(reports, /account_manager/);
  assert.match(reports, /readScopedClient/);
});

test("client jarvis nav groups Leads, Landing pages, and AIS2L under Conversion and Reports under Share", () => {
  const client = jarvisNav({ audience: "client", showAis2l: true, decisionCount: 0, showLive: true, showSegments: true });
  assert.equal(client.find((item) => item.label === "Leads")?.group, "Conversion");
  assert.equal(client.find((item) => item.label === "Landing pages")?.group, "Conversion");
  assert.equal(client.find((item) => item.label === "AIS2L")?.group, "Conversion");
  assert.equal(client.find((item) => item.label === "Reports")?.group, "Share");
  assert.equal(client.find((item) => item.href === "/marketing/segments")?.label, "Audience Data");
  assert.equal(client.find((item) => item.href === "/marketing/segments")?.group, "Results");
  const staff = jarvisNav({ audience: "staff", showAis2l: true, decisionCount: 2, showLive: true, showSegments: true, showAudiences: true });
  assert.equal(staff.find((item) => item.href === "/marketing/segments")?.label, "Audience Data");
  assert.equal(staff.find((item) => item.href === "/marketing/segments")?.group, "Conversion");
});

test("channel columns carry glossary tips and client columns have no cost tooltips", () => {
  const staff = channelColumns("staff");
  assert.equal(staff.find((column) => column.id === "spend")?.glossaryId, "spend");
  assert.equal(staff.find((column) => column.id === "cpl")?.glossaryId, "cpl");
  assert.equal(staff.find((column) => column.id === "leads")?.glossaryId, "leads");
  const client = channelColumns("client");
  assert.equal(client.some((column) => column.cost || column.glossaryId === "spend" || column.glossaryId === "cpl" || column.glossaryId === "cpql" || column.glossaryId === "roas"), false);
  assert.equal(client.some((column) => column.glossaryId === "leads"), true);
  const table = readFileSync(path.join(ROOT, "components/jarvis/channel-table.tsx"), "utf8");
  assert.match(table, /channelColumns/);
  assert.match(table, /<Tip glossaryId=\{column\.glossaryId\}/);
});

test("live feed snooze is 1h, tonight, or tomorrow 8 AM, and urgent email only logs would send", () => {
  const now = new Date("2026-10-30T18:00:00.000Z");
  assert.equal(snoozeUntil("1h", now, "America/New_York").getTime() - now.getTime(), 60 * 60 * 1000);
  const tonight = snoozeUntil("tonight", now, "America/New_York");
  assert.equal(zonedParts(tonight, "America/New_York").hour, 22);
  assert.equal(zonedISODate(tonight, "America/New_York"), "2026-10-30");
  const morning = snoozeUntil("tomorrow_8am", now, "America/New_York");
  assert.equal(zonedISODate(morning, "America/New_York"), "2026-10-31");
  assert.equal(zonedParts(morning, "America/New_York").hour, 8);
  const logs: string[] = [];
  assert.equal(deliverUrgentEmail({ optIn: false, title: "down" }, (line) => logs.push(line)).logged, null);
  assert.equal(deliverUrgentEmail({ optIn: true, title: "down" }, (line) => logs.push(line)).logged, "would send");
  assert.deepEqual(logs, ["would send"]);
  assert.equal(urgentEmailOptIn("am-p0"), false);
  setUrgentEmailOptIn("am-p0", true);
  assert.equal(urgentEmailOptIn("am-p0"), true);
  const feed = readFileSync(path.join(ROOT, "app/api/marketing/jarvis/feed/route.ts"), "utf8");
  assert.match(feed, /text\/event-stream/);
  assert.match(feed, /amRealtimeEnabled/);
  const page = readFileSync(path.join(ROOT, "components/jarvis/pages.tsx"), "utf8");
  assert.match(page, /Snooze 1h/);
  assert.match(page, /Snooze tonight/);
  assert.match(page, /Snooze tomorrow 8 AM/);
  assert.match(page, /EventSource/);
  assert.match(page, /saveUrgentEmailOptIn/);
});

test("jarvis lead undo uses the 30 second log and viewers stay read-only", () => {
  const denied = recordLeadMark({ role: "client_viewer", actorId: "view", leadId: "maria", qualified: true, previous: null, now: 1_000 });
  assert.equal(denied.ok, false);
  const viewerUndo = undoLoggedLead({ role: "viewer", actorId: "view", leadId: "maria", now: 2_000 });
  assert.equal(viewerUndo.ok, false);
  const marked = recordLeadMark({ role: "client_owner", actorId: "owner", leadId: "maria", qualified: true, previous: null, now: 5_000 });
  assert.equal(marked.ok, true);
  if (marked.ok) assert.equal(marked.undoMs, 30_000);
  const undone = undoLoggedLead({ role: "client_owner", actorId: "owner", leadId: "maria", now: 20_000 });
  assert.equal(undone.ok, true);
  if (undone.ok) assert.equal(undone.previous, null);
  const closed = undoLoggedLead({ role: "client_owner", actorId: "owner", leadId: "maria", now: 40_000 });
  assert.equal(closed.ok, false);
  const pages = readFileSync(path.join(ROOT, "components/jarvis/pages.tsx"), "utf8");
  const actions = readFileSync(path.join(ROOT, "lib/marketing/human-actions.ts"), "utf8");
  assert.match(pages, /logJarvisLeadMark/);
  assert.match(pages, /undoJarvisLeadMark/);
  assert.match(actions, /recordLeadMark/);
  assert.match(actions, /undoLoggedLead/);
  assert.equal(recordLeadMark({ role: "viewer", actorId: "view", leadId: "ray", qualified: false, previous: null, now: 1 }).ok, false);
});

test("the live page monitor checks every minute, alerts after 3 failures, and pause stays a dry run", () => {
  assert.equal(HEALTHY_INTERVAL_MS, 60_000);
  assert.equal(ALERT_AFTER_FAILURES, 3);
  const store = readFileSync(path.join(ROOT, "lib/marketing/pages/store.ts"), "utf8");
  assert.match(store, /Pause stays a dry run until write access is approved/);
  assert.match(store, /plan\.to === "PAUSED"/);
});

test("mobile expand control and toast undo are at least 44px", () => {
  const css = readFileSync(path.join(ROOT, "components/jarvis/jarvis.css"), "utf8");
  const mobile = css.slice(css.indexOf("@media (max-width: 639px)"));
  assert.match(mobile, /\.jarvis \.exp/);
  assert.match(mobile, /\.jarvis \.toast button/);
  assert.match(mobile, /min-height: 44px/);
  assert.match(mobile, /min-width: 44px/);
});

test("the nav item Segments is Audience Data without renaming the route", () => {
  const nav = readFileSync(path.join(ROOT, "lib/marketing/channels/nav.ts"), "utf8");
  const shell = readFileSync(path.join(ROOT, "components/shell.tsx"), "utf8");
  const screens = readFileSync(path.join(ROOT, "components/segment-screens.tsx"), "utf8");
  const page = readFileSync(path.join(ROOT, "app/(app)/marketing/segments/page.tsx"), "utf8");
  assert.match(nav, /label: "Audience Data"/);
  assert.equal(nav.includes('label: "Segments"'), false);
  assert.match(shell, /label: "Audience Data"/);
  assert.match(page, /Audience Data/);
  assert.match(screens, /Audience Data/);
  assert.match(screens, /Leaderboard/);
  assert.match(nav, /href: "\/marketing\/segments"/);
  assert.match(readFileSync(path.join(ROOT, "components/portfolio-dashboard.tsx"), "utf8"), />Segments</);
  assert.match(screens, /sub-segment|subSegment|segment test|Segment tests|segment_cut/);
});

test("Yes, cut and Approve new version are dry runs with a confirm preview, and budget flags say RECOMMENDATION ONLY", () => {
  const fatigue = decisionVisibleText({
    id: "1",
    type: "creative_fatigue",
    status: "verified",
    title: "Approve a new version",
    summary: "The ad is tired.",
    rationale: "Current: Smile\nProposed: Smile 2",
    metric: "frequency",
    baseline: "3",
    observed: "4",
    windowStart: "2026-10-01",
    windowEnd: "2026-10-07",
    sampleSize: 100,
    sourceCount: 2,
  });
  assert.match(fatigue, /Approve new version/);
  assert.match(fatigue, /Dry run/);
  assert.match(fatigue, /Confirm preview/);
  const budget = decisionVisibleText({
    id: "2",
    type: "budget_change",
    status: "verified",
    title: "Raise the daily budget",
    summary: "It runs out by lunch.",
    rationale: "",
    metric: "budget",
    baseline: "50",
    observed: "50",
    windowStart: "",
    windowEnd: "",
    sampleSize: 10,
    sourceCount: 1,
    currentBudgetAmount: 50,
    proposedBudgetAmount: 80,
  });
  assert.match(budget, /RECOMMENDATION ONLY/);
  const screens = readFileSync(path.join(ROOT, "components/segment-screens.tsx"), "utf8");
  const queue = readFileSync(path.join(ROOT, "components/decision-queue.tsx"), "utf8");
  assert.match(screens, /Yes, cut/);
  assert.match(screens, /confirm preview/);
  assert.match(screens, /RECOMMENDATION ONLY/);
  assert.match(queue, /confirmPreview/);
  assert.match(queue, /Approve new version/);
  assert.match(queue, /RECOMMENDATION ONLY/);
  assert.match(readFileSync(path.join(ROOT, "components/jarvis/staff.tsx"), "utf8"), /RECOMMENDATION ONLY/);
});

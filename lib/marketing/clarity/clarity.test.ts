import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { runAsWorkspace } from "../../demo/outbound";
import { DEMO_WORKSPACE_ID } from "../../demo/isolation";
import { forbiddenClientKeys } from "../client-view";
import { projectDashboard, type DashboardModel } from "../dashboard-model";
import { isCostDecision, presentDecisions, type DecisionCard } from "../decisions/present";
import { evaluateDecisionRules } from "../decisions/rules";
import {
  ClarityApiError,
  ClarityWriteBlockedError,
  assertClarityReadOnly,
  clarityExportUrl,
  pullClarityInsights,
  redactClaritySecrets,
} from "./client";
import { clarityDecisionsEnabled, clarityTokenEnv, planClarityConnections, scopesToRead } from "./connections";
import {
  CLARITY_DEAD_MIN,
  CLARITY_PAID_MIN_SESSIONS,
  CLARITY_QUICKBACK_RATE,
  CLARITY_SCROLL_MAX,
  evaluateClarityDecisions,
  type ClaritySlice,
} from "./decisions";
import { parseClarityExport } from "./report";
import { clarityHeatmapsUrl, clarityScopeData } from "./scope";
import {
  CLARITY_DAILY_REQUEST_CAP,
  CLARITY_DAILY_WRITE_CHUNK,
  CLARITY_WRITE_MAX_WAIT_MS,
  CLARITY_WRITE_TIMEOUT_MS,
  decideClarity,
  planClarityWriteChunks,
  runClaritySync,
  writeClarityDailyRows,
  type ClarityClaim,
  type ClarityDailyDatabase,
  type ClarityDailyWriteData,
  type ClarityWriteRow,
} from "./sync";
import { clarityForViewer, presentClarityFrustration } from "./view";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const END = "2026-11-06";
const TOKEN = "clarity-project-token";

const SAMPLE = [
  {
    metricName: "Traffic",
    information: [
      {
        totalSessionCount: "220",
        totalBotSessionCount: "4",
        distantUserCount: "180",
        PagesPerSessionPercentage: 1.4,
        Campaign: "Pools spring",
        Source: "google",
        URL: "https://example.com/pools",
      },
    ],
  },
  {
    metricName: "Engagement Time",
    information: [{ activeTime: "42", totalTime: "90", URL: "https://example.com/pools", Source: "google", Campaign: "Pools spring" }],
  },
  {
    metricName: "Scroll Depth",
    information: [{ averageScrollDepth: "12.5", URL: "https://example.com/pools", Source: "google", Campaign: "Pools spring" }],
  },
  {
    metricName: "PopularPages",
    information: [{ visitsCount: "30", URL: "https://example.com/pools", Source: "google", Campaign: "Pools spring" }],
  },
  {
    metricName: "Dead Click Count",
    information: [{ subTotal: "22", sessionsCount: "40", sessionsWithMetricPercentage: 10, URL: "https://example.com/pools", Source: "google", Campaign: "Pools spring" }],
  },
  {
    metricName: "Rage Click Count",
    information: [{ subTotal: "18", sessionsWithMetricPercentage: 9.1, URL: "https://example.com/pools", Source: "google", Campaign: "Pools spring" }],
  },
  {
    metricName: "QuickbackClick",
    information: [{ subTotal: "80", sessionsWithMetricPercentage: 40, URL: "https://example.com/pools", Source: "google", Campaign: "Pools spring" }],
  },
  {
    metricName: "ExcessiveScroll",
    information: [{ subTotal: "3", URL: "https://example.com/pools", Source: "google", Campaign: "Pools spring" }],
  },
  {
    metricName: "ScriptErrorCount",
    information: [{ subTotal: "1", URL: "https://example.com/pools", Source: "google", Campaign: "Pools spring" }],
  },
  {
    metricName: "ErrorClickCount",
    information: [{ subTotal: "2", URL: "https://example.com/pools", Source: "google", Campaign: "Pools spring" }],
  },
];

test("clarity export rows keep each metric's raw values", () => {
  const rows = parseClarityExport(SAMPLE);
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.ok(row);
  assert.equal(row.url, "https://example.com/pools");
  assert.equal(row.source, "google");
  assert.equal(row.campaignName, "Pools spring");
  assert.equal(row.medium, "");
  assert.equal(row.sessions, 220);
  assert.equal(row.botSessions, 4);
  assert.equal(row.users, 180);
  assert.equal(row.pagesPerSession, 1.4);
  assert.equal(row.engagementActive, 42);
  assert.equal(row.engagementTotal, 90);
  assert.equal(row.scrollDepth, 12.5);
  assert.equal(row.popularPages, 30);
  assert.equal(row.deadClicks, 22);
  assert.equal(row.rageClicks, 18);
  assert.equal(row.quickbacks, 80);
  assert.equal(row.excessiveScroll, 3);
  assert.equal(row.scriptErrors, 1);
  assert.equal(row.errorClicks, 2);
  assert.equal(row.raw.Traffic?.totalSessionCount, "220");
  assert.equal(row.raw.ScrollDepth?.averageScrollDepth, "12.5");
  assert.equal(row.raw.RageClickCount?.subTotal, "18");
  assert.equal(row.raw.DeadClickCount?.sessionsWithMetricPercentage, 10);
  assert.equal(row.raw.QuickbackClick?.subTotal, "80");
  const page = parseClarityExport([
    { metricName: "Traffic", information: [{ totalSessionCount: "9", URL: "https://example.com/" }] },
    { metricName: "ScrollDepth", information: [{ averageScrollDepth: 0.125, URL: "https://example.com/" }] },
  ]);
  assert.equal(page.length, 1);
  assert.equal(page[0]?.source, "");
  assert.equal(page[0]?.scrollDepth, 12.5);
  assert.equal(parseClarityExport({ metricName: "Traffic" }).length, 0);
});

test("clarity calls are limited to one read endpoint", async () => {
  const allowed = clarityExportUrl({ numOfDays: 1, dimensions: ["URL", "Source", "Campaign"] });
  assert.equal(allowed.startsWith("https://www.clarity.ms/export-data/api/v1/project-live-insights?"), true);
  assert.doesNotThrow(() => assertClarityReadOnly("GET", allowed));
  assert.doesNotThrow(() => assertClarityReadOnly("GET", clarityExportUrl({ numOfDays: 3, dimensions: ["URL"] })));
  assert.throws(() => assertClarityReadOnly("POST", allowed), ClarityWriteBlockedError);
  assert.throws(() => assertClarityReadOnly("DELETE", allowed), ClarityWriteBlockedError);
  assert.throws(() => assertClarityReadOnly("GET", "https://clarity.microsoft.com/export-data/api/v1/project-live-insights?numOfDays=1"), ClarityWriteBlockedError);
  assert.throws(() => assertClarityReadOnly("GET", "http://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=1"), ClarityWriteBlockedError);
  assert.throws(() => assertClarityReadOnly("GET", "https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=4"), ClarityWriteBlockedError);
  assert.throws(() => assertClarityReadOnly("GET", `${allowed}&token=${TOKEN}`), ClarityWriteBlockedError);
  assert.throws(() => assertClarityReadOnly("GET", "https://www.clarity.ms/export-data/api/v1/project-live-insights/delete?numOfDays=1"), ClarityWriteBlockedError);
  assert.throws(() => clarityExportUrl({ numOfDays: 1, dimensions: ["User"] }), ClarityWriteBlockedError);
  const seen: { url: string; method: string; authorization: string }[] = [];
  const body = await pullClarityInsights({
    token: TOKEN,
    numOfDays: 1,
    dimensions: ["URL"],
    fetchImpl: async (url, init) => {
      seen.push({ url, method: init?.method || "", authorization: new Headers(init?.headers).get("authorization") || "" });
      return Response.json(SAMPLE);
    },
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.method, "GET");
  assert.equal(seen[0]?.authorization, `Bearer ${TOKEN}`);
  assert.equal(seen[0]?.url.includes(TOKEN), false);
  assert.doesNotThrow(() => assertClarityReadOnly("GET", seen[0]?.url || ""));
  assert.equal(parseClarityExport(body).length, 1);
  await assert.rejects(
    () => pullClarityInsights({
      token: TOKEN,
      numOfDays: 1,
      dimensions: ["URL"],
      fetchImpl: async () => {
        throw new Error(`socket hang up ${TOKEN}`);
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof ClarityApiError);
      assert.equal(String(error.message).includes(TOKEN), false);
      return true;
    },
  );
  assert.equal(redactClaritySecrets(`Bearer ${TOKEN}`, [TOKEN]).includes(TOKEN), false);
  const client = readFileSync(path.join(ROOT, "lib/marketing/clarity/client.ts"), "utf8");
  const sync = readFileSync(path.join(ROOT, "lib/marketing/clarity/sync.ts"), "utf8");
  const script = readFileSync(path.join(ROOT, "scripts/clarity-client-scope.ts"), "utf8");
  assert.equal(client.includes("GOOGLE_ADS_REFRESH_TOKEN"), false);
  assert.equal(sync.includes("GOOGLE_ADS_REFRESH_TOKEN"), false);
  assert.equal(client.includes("console."), false);
  assert.equal(sync.includes("console."), false);
  assert.match(client, /assertClarityReadOnly/);
  assert.match(script, /--write/);
  assert.match(script, /if \(!write\)/);
  assert.equal(/metaLiveRead\s*:/.test(script), false);
  assert.equal(script.includes("googleAdsLiveRead"), false);
  assert.equal(script.includes("process.env"), false);
});

test("clarity stays off without the flag and a listed token", () => {
  assert.equal(clarityDecisionsEnabled({}), false);
  assert.equal(clarityDecisionsEnabled({ CLARITY_SYNC: "on" }), false);
  assert.equal(clarityDecisionsEnabled({ CLARITY_BEFOUND_API_TOKEN: TOKEN }), false);
  assert.equal(clarityDecisionsEnabled({ CLARITY_SYNC: "on", CLARITY_CONNECTIONS: "befound", CLARITY_BEFOUND_API_TOKEN: TOKEN }), true);
  assert.equal(clarityTokenEnv("befound"), "CLARITY_BEFOUND_API_TOKEN");
  const plan = planClarityConnections({ CLARITY_CONNECTIONS: "befound, primary", CLARITY_BEFOUND_API_TOKEN: TOKEN });
  assert.deepEqual(plan.connections.map((row) => row.name), ["befound"]);
  assert.equal(plan.connections[0]?.tokenEnv, "CLARITY_BEFOUND_API_TOKEN");
  assert.equal(JSON.stringify(plan.skipped).includes(TOKEN), false);
  const mapped = scopesToRead(
    [
      { id: "s1", clientId: "be", clientName: "Be Found AI", projectId: "abc123xyz", label: "", connectionName: "befound" },
      { id: "s2", clientId: "other", clientName: "Other", projectId: "def456uvw", label: "", connectionName: "missing" },
    ],
    plan,
  );
  assert.equal(mapped.ready.length, 1);
  assert.equal(mapped.skipped[0]?.client, "Other");
  assert.equal(clarityScopeData({ projectId: "abc123xyz", connection: "befound", label: "Be Found site" }).ok, true);
  assert.equal(clarityScopeData({ projectId: "../admin", connection: "befound" }).ok, false);
  assert.equal(clarityScopeData({ projectId: "abc123xyz", connection: "primary" }).ok, false);
  assert.equal(clarityHeatmapsUrl("abc123xyz"), "https://clarity.microsoft.com/projects/view/abc123xyz/heatmaps");
  assert.equal(clarityHeatmapsUrl("../admin"), "");
  const skipped = decideClarity({ CLARITY_SYNC: "off", CLARITY_CONNECTIONS: "befound", CLARITY_BEFOUND_API_TOKEN: TOKEN });
  assert.equal(skipped.action, "skip");
  if (skipped.action === "skip") assert.equal(skipped.reason, "CLARITY_SYNC is off");
});

function clarityRow(index: number, sessions = 1): ClarityWriteRow {
  return {
    url: `https://example.com/p/${index}`,
    source: "google",
    medium: "",
    campaignName: `campaign-${index}`,
    channel: "",
    device: "",
    browser: "",
    os: "",
    country: "",
    sessions,
    botSessions: 0,
    users: 0,
    pagesPerSession: 0,
    engagementActive: 0,
    engagementTotal: 0,
    scrollDepth: 20,
    popularPages: 0,
    deadClicks: 0,
    rageClicks: 0,
    quickbacks: 0,
    excessiveScroll: 0,
    scriptErrors: 0,
    errorClicks: 0,
    deadClickRate: null,
    rageClickRate: null,
    quickbackRate: null,
    raw: { Traffic: { totalSessionCount: String(sessions) } },
    clientId: "capital",
    scopeId: "scope-capital",
    projectId: "abc123xyz",
    connectionName: "befound",
    date: END,
    breakdown: "url",
    dimensionKey: `key-${index}`,
    campaignId: null,
  };
}

function memoryClarityDb(seed: ClarityDailyWriteData[] = []) {
  const rows = seed.map((row) => ({ ...row, raw: { ...row.raw } }));
  const calls: { timeout?: number; maxWait?: number; created: number; deleted: string[] }[] = [];
  const db: ClarityDailyDatabase = {
    $transaction: async (fn, options) => {
      const snapshot = rows.map((row) => ({ ...row, raw: { ...row.raw } }));
      let created = 0;
      const deleted: string[] = [];
      const tx = {
        clarityDaily: {
          deleteMany: async (args: { where: { clientId: string; projectId: string; breakdown: string; date: { in: Date[] } } }) => {
            deleted.push(...args.where.date.in.map((date) => date.toISOString().slice(0, 10)));
            for (let i = rows.length - 1; i >= 0; i -= 1) {
              const row = rows[i];
              if (!row || row.clientId !== args.where.clientId || row.projectId !== args.where.projectId || row.breakdown !== args.where.breakdown) continue;
              if (args.where.date.in.some((date) => date.getTime() === row.date.getTime())) rows.splice(i, 1);
            }
          },
          createMany: async (args: { data: ClarityDailyWriteData[] }) => {
            created += args.data.length;
            rows.push(...args.data.map((row) => ({ ...row, raw: { ...row.raw } })));
          },
        },
      };
      try {
        const result = await fn(tx);
        calls.push({ timeout: options?.timeout, maxWait: options?.maxWait, created, deleted });
        return result;
      } catch (error) {
        rows.splice(0, rows.length, ...snapshot);
        throw error;
      }
    },
  };
  return { db, rows, calls };
}

test("a large clarity project is written in short chunks and a second run replaces that day", async () => {
  const count = CLARITY_DAILY_WRITE_CHUNK + 25;
  const rows = Array.from({ length: count }, (_, index) => clarityRow(index));
  rows.push(clarityRow(0, 42));
  const scope = { clientId: "capital", projectId: "abc123xyz", breakdown: "url" };
  const chunks = planClarityWriteChunks(rows, END, scope);
  assert.equal(chunks.some((chunk) => chunk.rows.length > CLARITY_DAILY_WRITE_CHUNK), false);
  assert.equal(chunks.length, 2);
  assert.deepEqual(chunks[0]?.deleteDates, [END]);
  assert.deepEqual(chunks[1]?.deleteDates, []);
  assert.equal(chunks[0]?.rows.length, CLARITY_DAILY_WRITE_CHUNK);
  assert.equal(chunks[1]?.rows.length, 25);
  const keys = chunks.flatMap((chunk) => chunk.rows.map((row) => row.dimensionKey));
  assert.equal(new Set(keys).size, count);
  assert.equal(chunks.flatMap((chunk) => chunk.rows).find((row) => row.dimensionKey === "key-0")?.sessions, 42);
  assert.deepEqual(planClarityWriteChunks([], END, scope), [{ clientId: "capital", projectId: "abc123xyz", breakdown: "url", deleteDates: [END], rows: [] }]);

  const store = memoryClarityDb([
    { ...clarityRow(1), date: new Date("2026-11-05T00:00:00.000Z"), dimensionKey: "keep-other-day", sessions: 3 } as unknown as ClarityDailyWriteData,
    { ...clarityRow(2), date: new Date(`${END}T00:00:00.000Z`), breakdown: "url_source_campaign", dimensionKey: "keep-other-breakdown", sessions: 4 } as unknown as ClarityDailyWriteData,
    { ...clarityRow(3), date: new Date(`${END}T00:00:00.000Z`), dimensionKey: "stale", sessions: 9 } as unknown as ClarityDailyWriteData,
  ]);
  const written = await writeClarityDailyRows(store.db, rows, END, scope);
  assert.equal(written, count);
  assert.equal(store.calls.every((call) => call.timeout === CLARITY_WRITE_TIMEOUT_MS && call.maxWait === CLARITY_WRITE_MAX_WAIT_MS), true);
  assert.equal(store.calls.every((call) => call.created <= CLARITY_DAILY_WRITE_CHUNK), true);
  const today = store.rows.filter((row) => row.breakdown === "url" && row.date.toISOString().slice(0, 10) === END);
  assert.equal(today.length, count);
  assert.equal(today.some((row) => row.dimensionKey === "stale"), false);
  assert.equal(today.find((row) => row.dimensionKey === "key-0")?.sessions, 42);
  assert.equal(store.rows.some((row) => row.dimensionKey === "keep-other-day"), true);
  assert.equal(store.rows.some((row) => row.dimensionKey === "keep-other-breakdown"), true);

  const again = [clarityRow(7, 5)];
  const second = await writeClarityDailyRows(store.db, again, END, scope);
  assert.equal(second, 1);
  const replaced = store.rows.filter((row) => row.breakdown === "url" && row.date.toISOString().slice(0, 10) === END);
  assert.equal(replaced.length, 1);
  assert.equal(replaced[0]?.dimensionKey, "key-7");
  assert.equal(store.rows.filter((row) => row.dimensionKey === "keep-other-day").length, 1);
  assert.equal(store.rows.filter((row) => row.dimensionKey === "keep-other-breakdown").length, 1);
});

function requestBook() {
  const state = new Map<string, { count: number; done: string[] }>();
  return {
    state,
    claimRequest(scopeId: string, _day: string, breakdown: string): Promise<ClarityClaim> {
      const row = state.get(scopeId) ?? { count: 0, done: [] };
      if (row.done.includes(breakdown)) return Promise.resolve({ claimed: false, reason: "already synced today" });
      if (row.count >= CLARITY_DAILY_REQUEST_CAP) return Promise.resolve({ claimed: false, reason: "daily Clarity request cap" });
      row.count += 1;
      state.set(scopeId, row);
      return Promise.resolve({ claimed: true });
    },
    completeBreakdown(scopeId: string, _day: string, breakdown: string) {
      const row = state.get(scopeId) ?? { count: 0, done: [] };
      row.done.push(breakdown);
      state.set(scopeId, row);
      return Promise.resolve();
    },
    exhaustDay(scopeId: string) {
      const row = state.get(scopeId) ?? { count: 0, done: [] };
      row.count = CLARITY_DAILY_REQUEST_CAP;
      state.set(scopeId, row);
      return Promise.resolve();
    },
  };
}

const LIVE = {
  CLARITY_SYNC: "on",
  MARKETING_SYNC_MODE: "live",
  CLARITY_CONNECTIONS: "befound",
  CLARITY_BEFOUND_API_TOKEN: TOKEN,
};

test("one clarity client that fails does not stop the next, and the same day is not pulled again", async () => {
  const book = requestBook();
  const written: string[] = [];
  const calls: string[] = [];
  const scopes = [
    { id: "scope-capital", clientId: "capital", clientName: "Capital Financial USA", projectId: "abc123xyz", label: "", connectionName: "befound" },
    { id: "scope-small", clientId: "small", clientName: "Be Found AI", projectId: "def456uvw", label: "Be Found", connectionName: "befound" },
  ];
  const result = await runClaritySync({
    env: LIVE,
    now: new Date("2026-11-06T16:00:00.000Z"),
    timezone: "America/New_York",
    scopes,
    campaigns: [{ id: "camp-1", name: "Pools spring", externalId: "", clientId: "small" }],
    claimRequest: book.claimRequest,
    completeBreakdown: book.completeBreakdown,
    exhaustDay: book.exhaustDay,
    writeRows: async (rows, _date, scope) => {
      if (scope.clientId === "capital") throw new Error("Transaction already closed: timeout for this transaction was 5000 ms");
      written.push(scope.clientId);
      return rows.length;
    },
    fetchImpl: async (url, init) => {
      calls.push(`${init?.method || ""} ${url}`);
      assert.equal(url.includes(TOKEN), false);
      assert.doesNotThrow(() => assertClarityReadOnly(init?.method || "", url));
      return Response.json([{ metricName: "Traffic", information: [{ totalSessionCount: "4", URL: "https://example.com/pools", Source: "google", Campaign: "Pools spring" }] }]);
    },
  });
  assert.equal(result.status, "failed");
  assert.deepEqual(written, ["small", "small"]);
  assert.equal(result.rowsWritten, 2);
  assert.equal(result.requests, 4);
  assert.equal(calls.length, 4);
  assert.match(result.error || "", /Capital Financial USA/);
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
  assert.equal(book.state.get("scope-small")?.done.length, 2);
  assert.equal(book.state.get("scope-capital")?.count, CLARITY_DAILY_REQUEST_CAP);

  calls.length = 0;
  const again = await runClaritySync({
    env: LIVE,
    now: new Date("2026-11-06T18:00:00.000Z"),
    timezone: "America/New_York",
    scopes,
    campaigns: [],
    claimRequest: book.claimRequest,
    completeBreakdown: book.completeBreakdown,
    exhaustDay: book.exhaustDay,
    fetchImpl: async () => {
      calls.push("again");
      return Response.json([]);
    },
  });
  assert.equal(again.status, "skipped");
  assert.equal(again.reason, "already synced today");
  assert.equal(again.requests, 0);
  assert.equal(calls.length, 0);
});

test("the demo workspace does not sync clarity", async () => {
  let called = false;
  const result = await runAsWorkspace(DEMO_WORKSPACE_ID, () => runClaritySync({
    env: LIVE,
    fetchImpl: async () => {
      called = true;
      return Response.json([]);
    },
    scopes: [{ id: "s", clientId: "be", clientName: "Be Found AI", projectId: "abc123xyz", label: "", connectionName: "befound" }],
  }));
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "demo workspace does not sync");
  assert.equal(called, false);
});

function slice(patch: Partial<ClaritySlice> & { id: string; date?: string }): ClaritySlice {
  return {
    clientId: "client-1",
    clientName: "Burnett Pools",
    date: patch.date || END,
    url: "https://example.com/pools",
    source: "google",
    medium: "",
    campaignName: "Pools spring",
    campaignId: "camp-1",
    sessions: 220,
    scrollDepth: 40,
    rageClicks: 0,
    deadClicks: 0,
    quickbacks: 0,
    ...patch,
  };
}

function card(patch: Partial<DecisionCard> & { type: string; rule: string }): DecisionCard {
  return {
    id: patch.id || patch.rule,
    status: "verified",
    severity: "warning",
    clientId: "client-1",
    clientName: "Burnett Pools",
    campaignId: "camp-1",
    campaignName: "Pools spring",
    campaignStatus: "active",
    title: patch.title || "title",
    summary: patch.summary || "summary",
    rationale: patch.rationale || "rationale",
    metric: patch.metric || "sessions",
    baseline: "0",
    observed: "1",
    windowStart: END,
    windowEnd: END,
    sampleSize: 1,
    sourceMetricIds: [],
    evidence: {},
    recency: "",
    snoozedUntil: null,
    archivedAt: null,
    steps: [],
    ...patch,
  };
}

test("clarity decision rules stay conservative, deduped, and hide spend", () => {
  const quiet = evaluateClarityDecisions({
    end: END,
    clarity: [slice({ id: "small", sessions: 20, rageClicks: 2, deadClicks: 2 })],
    spend: [{ id: "spend-1", clientId: "client-1", campaignId: "camp-1", campaignName: "Pools spring", date: END, spend: 80 }],
  });
  assert.equal(quiet.length, 0);

  const unpaid = evaluateClarityDecisions({
    end: END,
    clarity: [slice({ id: "rage", rageClicks: 18, deadClicks: 22 })],
    spend: [{ id: "spend-1", clientId: "client-1", campaignId: "camp-1", campaignName: "Pools spring", date: END, spend: 10 }],
  });
  assert.equal(unpaid.some((row) => row.type === "clarity_paid_frustration"), false);

  const paid = evaluateClarityDecisions({
    end: END,
    clarity: [
      slice({ id: "rage-a", date: "2026-11-05", sessions: 110, rageClicks: 9, deadClicks: 11 }),
      slice({ id: "rage-b", sessions: 110, rageClicks: 9, deadClicks: 11 }),
      slice({ id: "old", date: "2026-11-01", sessions: 999, rageClicks: 999, deadClicks: 999 }),
    ],
    spend: [
      { id: "spend-a", clientId: "client-1", campaignId: "camp-1", campaignName: "Pools spring", date: "2026-11-05", spend: 40 },
      { id: "spend-b", clientId: "client-1", campaignId: "camp-1", campaignName: "Pools spring", date: END, spend: 40 },
    ],
  });
  const paidRows = paid.filter((row) => row.type === "clarity_paid_frustration");
  assert.equal(paidRows.length, 1);
  assert.equal(paidRows[0]?.sampleSize, 220);
  assert.equal(paidRows[0]?.evidence.rageClicks, 18);
  assert.equal(paidRows[0]?.evidence.spend, 80);
  assert.ok((paidRows[0]?.sampleSize || 0) >= CLARITY_PAID_MIN_SESSIONS);
  assert.ok(18 >= 10 && 22 >= CLARITY_DEAD_MIN);
  const again = evaluateClarityDecisions({
    end: END,
    clarity: [slice({ id: "rage", rageClicks: 18, deadClicks: 22 })],
    spend: [{ id: "spend-1", clientId: "client-1", campaignId: "camp-1", campaignName: "Pools spring", date: END, spend: 80 }],
  });
  assert.equal(again.filter((row) => row.rule === "clarity_paid_frustration").length, 1);
  assert.equal(again[0]?.dedupeKey, paidRows[0]?.dedupeKey);

  const hidden = presentDecisions(paidRows.map((row) => card({
    type: row.type,
    rule: row.rule,
    metric: row.metric,
    title: row.title,
    summary: row.summary,
    rationale: row.rationale,
    evidence: row.evidence,
  })), { seesCost: false, hasLeadValue: false });
  assert.equal(hidden.length, 0);
  assert.equal(isCostDecision({ type: "clarity_paid_frustration", metric: "sessions" }), true);

  const deep = evaluateClarityDecisions({
    end: END,
    clarity: [slice({ id: "scroll", sessions: 400, scrollDepth: 40, rageClicks: 0 })],
  });
  assert.equal(deep.some((row) => row.type === "clarity_low_scroll"), false);
  const shallow = evaluateClarityDecisions({
    end: END,
    clarity: [
      slice({ id: "scroll-a", sessions: 200, scrollDepth: 12, campaignName: "Pools spring" }),
      slice({ id: "scroll-b", sessions: 200, scrollDepth: 12, campaignName: "Pools spring" }),
    ],
  });
  const scrollRows = shallow.filter((row) => row.type === "clarity_low_scroll");
  assert.equal(scrollRows.length, 1);
  assert.equal(scrollRows[0]?.sampleSize, 400);
  assert.ok(Number(scrollRows[0]?.observed) <= CLARITY_SCROLL_MAX);
  assert.equal(scrollRows[0]?.summary.toLowerCase().includes("spend"), false);
  assert.equal(scrollRows[0]?.title.toLowerCase().includes("spend"), false);
  assert.equal("spend" in (scrollRows[0]?.evidence || {}), false);
  assert.equal(JSON.stringify(scrollRows).includes("$"), false);
  assert.equal(isCostDecision({ type: "clarity_low_scroll", metric: "scrollDepth" }), false);

  const leaving = evaluateClarityDecisions({
    end: END,
    clarity: [slice({ id: "back", sessions: 200, quickbacks: 40 })],
  });
  assert.equal(leaving.some((row) => row.type === "clarity_quickback"), false);
  const backs = evaluateClarityDecisions({
    end: END,
    clarity: [
      slice({ id: "back-a", sessions: 100, quickbacks: 40 }),
      slice({ id: "back-b", sessions: 100, quickbacks: 40 }),
    ],
  });
  const quickRows = backs.filter((row) => row.type === "clarity_quickback");
  assert.equal(quickRows.length, 1);
  assert.equal(quickRows[0]?.evidence.quickbacks, 80);
  assert.ok(Number(quickRows[0]?.observed) >= CLARITY_QUICKBACK_RATE);
  assert.equal(quickRows[0]?.summary.toLowerCase().includes("spend"), false);
  assert.equal(quickRows[0]?.title.toLowerCase().includes("spend"), false);
  assert.equal("spend" in (quickRows[0]?.evidence || {}), false);
  assert.equal(JSON.stringify(quickRows).includes("$"), false);

  const off = evaluateDecisionRules({ end: END, clarityEnabled: false, clarity: [slice({ id: "rage", rageClicks: 18, deadClicks: 22 })], claritySpend: [{ id: "spend-1", clientId: "client-1", campaignId: "camp-1", campaignName: "Pools spring", date: END, spend: 80 }] });
  assert.equal(off.some((row) => row.type.startsWith("clarity_")), false);
  const on = evaluateDecisionRules({ end: END, clarityEnabled: true, clarity: [slice({ id: "scroll", sessions: 400, scrollDepth: 12 })], claritySpend: [] });
  assert.equal(on.filter((row) => row.type === "clarity_low_scroll").length, 1);
  assert.equal(on.some((row) => row.type === "clarity_paid_frustration"), false);
});

test("the clarity card shows frustrated pages and no spend", () => {
  const view = presentClarityFrustration(
    [
      { date: END, clientId: "client-1", projectId: "abc123xyz", breakdown: "url", url: "https://example.com/pools", sessions: 220, rageClicks: 18, deadClicks: 22, quickbacks: 10, scrollDepth: 12 },
      { date: END, clientId: "client-1", projectId: "abc123xyz", breakdown: "url_source_campaign", url: "https://example.com/pools", sessions: 999, rageClicks: 999, deadClicks: 999, quickbacks: 999, scrollDepth: 1 },
      { date: END, clientId: "client-1", projectId: "abc123xyz", breakdown: "url", url: "https://example.com/calm", sessions: 50, rageClicks: 0, deadClicks: 0, quickbacks: 0, scrollDepth: 80 },
      { date: "2026-10-01", clientId: "client-1", projectId: "abc123xyz", breakdown: "url", url: "https://example.com/old", sessions: 80, rageClicks: 40, deadClicks: 10, quickbacks: 10, scrollDepth: 10 },
    ],
    ["abc123xyz"],
    "2026-11-01",
  );
  assert.equal(view.pages.length, 1);
  assert.equal(view.pages[0]?.url, "https://example.com/pools");
  assert.equal(view.pages[0]?.rageClicks, 18);
  assert.equal(view.clarityUrl, "https://clarity.microsoft.com/projects/view/abc123xyz/heatmaps");
  const safe = clarityForViewer({ ...view, pages: view.pages });
  assert.equal(JSON.stringify(safe).toLowerCase().includes("spend"), false);
  assert.equal(JSON.stringify(safe).includes("$"), false);
  assert.equal(JSON.stringify(safe).includes("cpc"), false);
  const model: DashboardModel = {
    mode: "staff",
    showMoney: true,
    dates: [END],
    campaigns: [],
    notes: [],
    sourceLine: "Source: your ads",
    workspaceName: "Gulf",
    mock: false,
    clarity: safe,
  };
  const client = projectDashboard(model, { mode: "client", showMoney: false, canEditLeadValue: false });
  assert.equal(client.clarity?.clarityUrl, view.clarityUrl);
  assert.deepEqual(forbiddenClientKeys(client), []);
  assert.equal(JSON.stringify(client.clarity).includes("$"), false);
});

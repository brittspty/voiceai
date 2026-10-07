import assert from "node:assert/strict";
import test from "node:test";
import { parseMetaSyncArgs } from "./cli-args";
import { lookbackDays } from "./config";
import { ASYNC_INSIGHTS_AFTER_DAYS, inclusiveDays, pullAdInsights } from "./connectors/meta";
import {
  RATE_LIMIT_CODES,
  appSecretProof,
  businessUseCaseDelayMs,
  graphGet,
  graphPost,
  insightsThrottleDelayMs,
  type FetchLike,
} from "./connectors/meta-client";

const TOKEN = "token-value";
const SECRET = "secret-value";

function graph(input: { fetchImpl: FetchLike; sleep?: (ms: number) => Promise<void> }) {
  return {
    version: "v23.0",
    path: "act_1",
    token: TOKEN,
    appSecret: SECRET,
    fetchImpl: input.fetchImpl,
    sleep: input.sleep ?? (async () => {}),
  };
}

test("appsecret_proof is sent on GET and POST only when the app secret is set", async () => {
  const calls: { method: string; proof: string | null }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const parsed = new URL(url);
    calls.push({ method: init?.method ?? "", proof: parsed.searchParams.get("appsecret_proof") });
    return Response.json({ id: "1" });
  };
  const expected = appSecretProof(TOKEN, SECRET);
  await graphGet(graph({ fetchImpl }));
  await graphPost(graph({ fetchImpl }));
  assert.deepEqual(
    calls.map((call) => call.proof),
    [expected, expected],
  );
  assert.deepEqual(
    calls.map((call) => call.method),
    ["GET", "POST"],
  );

  calls.length = 0;
  await graphGet({ ...graph({ fetchImpl }), appSecret: "   " });
  await graphPost({ ...graph({ fetchImpl }), appSecret: "" });
  assert.deepEqual(
    calls.map((call) => call.proof),
    [null, null],
  );
});

test("rate-limit error codes back off and then succeed", async () => {
  assert.deepEqual([...RATE_LIMIT_CODES], [4, 17, 32, 613, 80004]);
  for (const code of RATE_LIMIT_CODES) {
    let calls = 0;
    const waits: number[] = [];
    const fetchImpl: FetchLike = async () => {
      calls += 1;
      if (calls === 1) {
        return Response.json(
          { error: { code, message: `limit ${TOKEN}` } },
          { status: code === 80004 ? 400 : 403, headers: { "retry-after": "2" } },
        );
      }
      return Response.json({ id: "ok" });
    };
    const body = await graphGet(graph({ fetchImpl, sleep: async (ms) => waits.push(ms) }));
    assert.equal((body as { id: string }).id, "ok");
    assert.equal(calls, 2);
    assert.equal(waits[0], 2000);
  }
});

test("HTTP 429 retries and a plain 400 does not", async () => {
  let calls = 0;
  const fetchImpl: FetchLike = async () => {
    calls += 1;
    if (calls === 1) return new Response("busy", { status: 429, headers: { "retry-after": "1" } });
    return Response.json({ id: "ok" });
  };
  await graphGet(graph({ fetchImpl }));
  assert.equal(calls, 2);

  let once = 0;
  const failing: FetchLike = async () => {
    once += 1;
    return Response.json({ error: { message: "bad request", code: 100 } }, { status: 400 });
  };
  await assert.rejects(() => graphGet(graph({ fetchImpl: failing })));
  assert.equal(once, 1);
});

test("usage headers delay the next call", () => {
  const usage = JSON.stringify({
    "123": [{ type: "ads_insights", call_count: 90, total_cputime: 10, total_time: 10, estimated_time_to_regain_access: 0 }],
  });
  assert.equal(businessUseCaseDelayMs(usage), 5_000);
  const saturated = JSON.stringify({
    "123": [{ call_count: 100, total_cputime: 10, total_time: 10, estimated_time_to_regain_access: 2 }],
  });
  assert.equal(businessUseCaseDelayMs(saturated), 120_000);
  assert.equal(insightsThrottleDelayMs(JSON.stringify({ app_id_util_pct: 10, acc_id_util_pct: 96 })), 30_000);
  assert.equal(businessUseCaseDelayMs("not-json"), 0);
});

test("a high usage header is applied after a successful response", async () => {
  const waits: number[] = [];
  const fetchImpl: FetchLike = async () =>
    new Response(JSON.stringify({ id: "1" }), {
      headers: {
        "x-business-use-case-usage": JSON.stringify({
          "123": [{ call_count: 85, total_cputime: 1, total_time: 1, estimated_time_to_regain_access: 0 }],
        }),
      },
    });
  await graphGet(graph({ fetchImpl, sleep: async (ms) => waits.push(ms) }));
  assert.deepEqual(waits, [5_000]);
});

test("windows longer than 7 days use an async insights job", async () => {
  assert.equal(inclusiveDays("2026-10-01", "2026-10-07"), ASYNC_INSIGHTS_AFTER_DAYS);
  assert.equal(inclusiveDays("2026-09-08", "2026-10-07"), 30);

  const calls: { method: string; path: string; proof: string | null }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const parsed = new URL(url);
    calls.push({
      method: init?.method ?? "",
      path: parsed.pathname,
      proof: parsed.searchParams.get("appsecret_proof"),
    });
    if (init?.method === "POST" && parsed.pathname.endsWith("/act_1/insights")) {
      return Response.json({ report_run_id: "job_1" });
    }
    if (parsed.pathname.endsWith("/job_1")) {
      return Response.json({ async_status: "Job Completed", async_percent_completion: 100 });
    }
    if (parsed.pathname.endsWith("/job_1/insights")) {
      return Response.json({ data: [{ ad_id: "ad_1", spend: "1", date_start: "2026-09-08" }] });
    }
    return Response.json({ data: [] });
  };

  const rows = await pullAdInsights({
    accountIds: ["act_1"],
    accountId: "act_1",
    accessToken: TOKEN,
    appSecret: SECRET,
    graphVersion: "v23.0",
    since: "2026-09-08",
    until: "2026-10-07",
    attributionWindows: ["7d_click", "1d_view"],
    fetchImpl,
    sleep: async () => {},
  });
  assert.equal(rows.length, 1);
  assert.equal(calls[0]?.method, "POST");
  assert.equal(calls[0]?.proof?.length, 64);
  assert.ok(calls.every((call) => call.proof?.length === 64));
  assert.ok(calls.some((call) => call.path.endsWith("/job_1/insights")));

  const syncCalls: string[] = [];
  const syncFetch: FetchLike = async (url, init) => {
    syncCalls.push(init?.method ?? "");
    return Response.json({ data: [] });
  };
  await pullAdInsights({
    accountIds: ["act_1"],
    accountId: "act_1",
    accessToken: TOKEN,
    appSecret: SECRET,
    graphVersion: "v23.0",
    since: "2026-10-01",
    until: "2026-10-07",
    attributionWindows: ["7d_click"],
    fetchImpl: syncFetch,
    sleep: async () => {},
  });
  assert.deepEqual(syncCalls, ["GET"]);
});

test("a short insights window falls back to an async job after a timeout", async () => {
  const methods: string[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const parsed = new URL(url);
    methods.push(`${init?.method} ${parsed.pathname}`);
    if (init?.method === "GET" && parsed.pathname.endsWith("/act_1/insights")) {
      return Response.json({ error: { message: "Please reduce the amount of data", code: 1 } }, { status: 500 });
    }
    if (init?.method === "POST") return Response.json({ report_run_id: "job_2" });
    if (parsed.pathname.endsWith("/job_2")) return Response.json({ async_status: "Job Completed" });
    return Response.json({ data: [{ ad_id: "ad_1" }] });
  };
  const rows = await pullAdInsights({
    accountIds: ["act_1"],
    accountId: "act_1",
    accessToken: TOKEN,
    appSecret: SECRET,
    graphVersion: "v23.0",
    since: "2026-10-05",
    until: "2026-10-07",
    attributionWindows: ["7d_click"],
    fetchImpl,
    sleep: async () => {},
  });
  assert.equal(rows.length, 1);
  assert.ok(methods.some((method) => method.startsWith("POST")));
});

test("meta sync cli flags", () => {
  const parsed = parseMetaSyncArgs(["--account", "act_532471207924121", "--days=30", "--dry-run"]);
  assert.equal(parsed.error, null);
  assert.equal(parsed.dryRun, true);
  assert.equal(parsed.days, 30);
  assert.deepEqual(parsed.accounts, ["act_532471207924121"]);

  const repeated = parseMetaSyncArgs(["--account=111", "--account", "act_222"]);
  assert.deepEqual(repeated.accounts, ["act_111", "act_222"]);

  assert.match(parseMetaSyncArgs(["--days", "0"]).error ?? "", /1 to 90/);
  assert.match(parseMetaSyncArgs(["--days", "91"]).error ?? "", /1 to 90/);
  assert.match(parseMetaSyncArgs(["--account", "not-an-account"]).error ?? "", /not an ad account/);
  assert.match(parseMetaSyncArgs(["--nope"]).error ?? "", /unknown argument/);
  assert.equal(parseMetaSyncArgs(["--help"]).help, true);
  assert.equal(lookbackDays({ MARKETING_LOOKBACK_DAYS: "30" }), 30);
  assert.equal(lookbackDays({ MARKETING_LOOKBACK_DAYS: "400" }), 90);
});

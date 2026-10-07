import assert from "node:assert/strict";
import test from "node:test";
import { parseMetaSyncArgs } from "./cli-args";
import { lookbackDays } from "./config";
import { ASYNC_INSIGHTS_AFTER_DAYS, ID_BATCH, inclusiveDays, pullAdInsights, pullMetaAccount, pullMetaSnapshot } from "./connectors/meta";
import {
  RATE_LIMIT_CODES,
  appSecretProof,
  businessUseCaseDelayMs,
  graphGet,
  graphList,
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

test("saturated cpu without a regain time waits 5s, not 60s", () => {
  const stuck = JSON.stringify({
    "123": [{ call_count: 3, total_cputime: 102, total_time: 78, estimated_time_to_regain_access: 0 }],
  });
  assert.equal(businessUseCaseDelayMs(stuck), 5_000);
});

test("graphList halves the page limit on 5xx and on reduce-the-amount-of-data", async () => {
  const limits: string[] = [];
  let calls = 0;
  const fetchImpl: FetchLike = async (url) => {
    limits.push(new URL(url).searchParams.get("limit") ?? "");
    calls += 1;
    if (calls < 3) {
      return Response.json({ error: { message: "Please reduce the amount of data", code: 1 } }, { status: 400 });
    }
    return Response.json({ data: [{ id: "a" }] });
  };
  const rows = await graphList({ ...graph({ fetchImpl }), path: "act_1/ads", log: () => {} });
  assert.deepEqual(limits, ["100", "50", "25"]);
  assert.equal(rows.length, 1);

  const statusLimits: string[] = [];
  const always: FetchLike = async (url) => {
    statusLimits.push(new URL(url).searchParams.get("limit") ?? "");
    return Response.json({ error: { message: "internal", code: 1 } }, { status: 500 });
  };
  await assert.rejects(() => graphList({ ...graph({ fetchImpl: always }), path: "act_1/ads", log: () => {} }));
  assert.deepEqual(statusLimits, ["100", "50", "25", "12", "10"]);
});

test("progress lines name the page and sleep without secrets", async () => {
  const token = "super-secret-token-value";
  const lines: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("access_token"), token);
    if (!parsed.searchParams.get("after")) {
      return Response.json(
        {
          data: [{ id: "1" }],
          paging: { next: "https://graph.facebook.com/next?access_token=super-secret-token-value", cursors: { after: "cursor-1" } },
        },
        {
          headers: {
            "x-business-use-case-usage": JSON.stringify({
              "123": [{ call_count: 3, total_cputime: 102, total_time: 70, estimated_time_to_regain_access: 0 }],
            }),
          },
        },
      );
    }
    return Response.json({ data: [{ id: "2" }] });
  };
  const rows = await graphList({
    version: "v23.0",
    path: "act_1/ads",
    token,
    appSecret: SECRET,
    fetchImpl,
    sleep: async () => {},
    log: (line) => lines.push(line),
  });
  assert.equal(rows.length, 2);
  assert.equal(lines[0], "Meta GET /v23.0/act_1/ads page 1 rows 1 sleep 5s (total_cputime 102)");
  assert.equal(lines[1], "Meta GET /v23.0/act_1/ads page 2 rows 2 sleep 0s");
  assert.equal(lines.some((line) => line.includes(token) || line.includes("appsecret_proof") || line.includes("access_token")), false);
});

test("a regain wait past the run limit fails instead of sleeping", async () => {
  let slept = 0;
  const fetchImpl: FetchLike = async () =>
    Response.json(
      { id: "1" },
      {
        headers: {
          "x-business-use-case-usage": JSON.stringify({
            "123": [{ call_count: 3, total_cputime: 102, total_time: 80, estimated_time_to_regain_access: 2 }],
          }),
        },
      },
    );
  await assert.rejects(
    () => graphGet({ ...graph({ fetchImpl, sleep: async (ms) => { slept = ms; } }), deadline: Date.now() + 1_000, log: () => {} }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Development access tier/);
      assert.match(error.message, /Standard Access/);
      assert.equal(error.message.includes(TOKEN), false);
      return true;
    },
  );
  assert.equal(slept, 0);
});

test("async insight polls back off from 5s to 30s", async () => {
  const waits: number[] = [];
  let polls = 0;
  const fetchImpl: FetchLike = async (url, init) => {
    const path = new URL(url).pathname;
    if (init?.method === "POST") return Response.json({ report_run_id: "job_b" });
    if (path.endsWith("/job_b")) {
      polls += 1;
      if (polls < 5) return Response.json({ async_status: "Job Running", async_percent_completion: polls * 10 });
      return Response.json({ async_status: "Job Completed", async_percent_completion: 100 });
    }
    return Response.json({ data: [] });
  };
  await pullAdInsights({
    accountIds: ["act_1"],
    accountId: "act_1",
    accessToken: TOKEN,
    appSecret: SECRET,
    graphVersion: "v23.0",
    since: "2026-09-08",
    until: "2026-10-07",
    attributionWindows: ["7d_click"],
    fetchImpl,
    sleep: async (ms) => waits.push(ms),
    log: () => {},
  });
  assert.deepEqual(waits, [5_000, 10_000, 20_000, 30_000]);
});

test("insights run first and creatives are loaded only for ads that delivered", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const calls: { path: string; fields: string; ids: string; filtering: string; level: string }[] = [];
  const fetchImpl: FetchLike = async (url) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    const parsed = new URL(url);
    const filtering = parsed.searchParams.get("filtering") ?? "";
    calls.push({
      path: parsed.pathname,
      fields: parsed.searchParams.get("fields") ?? "",
      ids: parsed.searchParams.get("ids") ?? "",
      filtering,
      level: parsed.searchParams.get("level") ?? "",
    });
    try {
      if (parsed.pathname === "/v23.0/act_1") {
        return Response.json({ id: "act_1", name: "Specificity", currency: "USD", timezone_name: "America/New_York", account_status: 1 });
      }
      if (parsed.pathname.endsWith("/insights")) {
        return Response.json({
          data: [{ ad_id: "ad_9", adset_id: "as_9", campaign_id: "c_9", spend: "2", impressions: "10", clicks: "1", date_start: "2026-10-07" }],
        });
      }
      if (parsed.searchParams.has("ids")) {
        return Response.json({ error: { message: "The ids query parameter is deprecated in v26.0+.", code: 100 } }, { status: 500 });
      }
      if (filtering.includes("campaign.id")) {
        return Response.json({ data: [{ id: "c_9", name: "Camp", objective: "OUTCOME_LEADS", effective_status: "ACTIVE" }] });
      }
      if (filtering.includes("adset.id")) {
        return Response.json({ data: [{ id: "as_9", name: "Set", campaign_id: "c_9", effective_status: "ACTIVE", targeting: {} }] });
      }
      if (filtering.includes('"ad.id"') || filtering.includes("ad.id")) {
        return Response.json({ data: [{ id: "ad_9", name: "Ad", adset_id: "as_9", effective_status: "ACTIVE", creative: { id: "cr_9" } }] });
      }
      if (filtering.includes("adcreative.id")) {
        return Response.json({
          data: [
            {
              id: "cr_9",
              name: "Creative",
              title: "Headline",
              body: "Body copy",
              object_story_spec: { link_data: { name: "Headline", message: "Body copy", link: "https://example.com/offer" } },
            },
          ],
        });
      }
      if (parsed.pathname.endsWith("/ads")) {
        return Response.json({
          data: [
            { id: "ad_9", name: "Ad", adset_id: "as_9", effective_status: "ACTIVE", creative: { id: "cr_9" } },
            { id: "ad_recent", name: "Recent", adset_id: "as_9", effective_status: "PAUSED", creative: { id: "cr_recent" } },
          ],
        });
      }
      if (parsed.pathname.endsWith("/campaigns")) {
        return Response.json({ data: [{ id: "c_9", name: "Camp", objective: "OUTCOME_LEADS", effective_status: "ACTIVE" }] });
      }
      if (parsed.pathname.endsWith("/adsets")) {
        return Response.json({ data: [{ id: "as_9", name: "Set", campaign_id: "c_9", effective_status: "ACTIVE" }] });
      }
      return Response.json({ data: [] });
    } finally {
      inFlight -= 1;
    }
  };

  const bundle = await pullMetaAccount({
    accountIds: ["act_1"],
    accountId: "act_1",
    accessToken: TOKEN,
    appSecret: SECRET,
    graphVersion: "v23.0",
    since: "2026-10-01",
    until: "2026-10-07",
    attributionWindows: ["7d_click"],
    fetchImpl,
    sleep: async () => {},
    log: () => {},
  });
  const insightAt = calls.findIndex((call) => call.path.endsWith("/insights"));
  const adsAt = calls.findIndex((call) => call.path.endsWith("/ads"));
  assert.ok(insightAt >= 0 && insightAt < adsAt);
  assert.equal(calls[insightAt]?.level, "ad");
  assert.equal(maxInFlight, 1);
  assert.ok(calls.some((call) => call.path.endsWith("/campaigns") && call.filtering.includes("updated_time") && call.filtering.includes("ARCHIVED")));
  assert.equal(calls.some((call) => call.ids), false);
  assert.equal(calls.some((call) => call.fields.includes("object_story_spec") && call.path.endsWith("/ads")), false);
  const creativeCall = calls.find((call) => call.fields.includes("object_story_spec"));
  assert.equal(creativeCall?.path.endsWith("/adcreatives"), true);
  assert.match(creativeCall?.filtering ?? "", /cr_9/);
  assert.match(calls.find((call) => call.filtering.includes("campaign.id"))?.filtering ?? "", /"operator":"IN"/);
  const delivered = (bundle.ads as { id: string; creative?: { title?: string } }[]).find((ad) => ad.id === "ad_9");
  const recent = (bundle.ads as { id: string; creative?: { title?: string; id?: string } }[]).find((ad) => ad.id === "ad_recent");
  assert.equal(delivered?.creative?.title, "Headline");
  assert.equal(recent?.creative?.id, "cr_recent");
  assert.equal(recent?.creative?.title, undefined);
});

function filterInValues(filtering: string, field: string) {
  if (!filtering.includes(field)) return null;
  try {
    const rows = JSON.parse(filtering) as { field?: string; value?: unknown }[];
    const match = rows.find((row) => row.field === field);
    return Array.isArray(match?.value) ? match.value.map(String) : null;
  } catch {
    return null;
  }
}

test("id filters are chunked and a late rate-limit stop keeps insights", async () => {
  const adIds = Array.from({ length: ID_BATCH + 1 }, (_, index) => `ad_${index}`);
  const adBatches: string[][] = [];
  const fetchImpl: FetchLike = async (url) => {
    const parsed = new URL(url);
    if (parsed.searchParams.has("ids")) {
      return Response.json({ error: { message: "The ids query parameter is deprecated in v26.0+.", code: 100 } }, { status: 500 });
    }
    if (parsed.pathname === "/v23.0/act_1") {
      return Response.json({ id: "act_1", name: "A", currency: "USD", timezone_name: "UTC", account_status: 1 });
    }
    if (parsed.pathname.endsWith("/insights")) {
      return Response.json({
        data: adIds.map((adId) => ({ ad_id: adId, adset_id: "as_1", campaign_id: "c_1", spend: "1", date_start: "2026-10-07" })),
      });
    }
    const filtering = parsed.searchParams.get("filtering") ?? "";
    const ads = filterInValues(filtering, "ad.id");
    if (ads) {
      adBatches.push(ads);
      if (ads.length < ID_BATCH) {
        return Response.json(
          { data: [] },
          {
            headers: {
              "x-business-use-case-usage": JSON.stringify({
                "123": [{ call_count: 1, total_cputime: 1, total_time: 1, estimated_time_to_regain_access: 2 }],
              }),
            },
          },
        );
      }
      return Response.json({
        data: ads.map((id) => ({ id, name: id, adset_id: "as_1", effective_status: "ACTIVE", creative: { id: "cr_1" } })),
      });
    }
    return Response.json({ data: [] });
  };
  const bundle = await pullMetaAccount({
    accountIds: ["act_1"],
    accountId: "act_1",
    accessToken: TOKEN,
    appSecret: SECRET,
    graphVersion: "v23.0",
    since: "2026-10-01",
    until: "2026-10-07",
    attributionWindows: ["7d_click"],
    fetchImpl,
    sleep: async () => {},
    log: () => {},
    deadline: Date.now() + 1_000,
  });
  assert.deepEqual(
    adBatches.map((ids) => ids.length),
    [ID_BATCH, 1],
  );
  assert.equal(bundle.insights.length, ID_BATCH + 1);
  assert.match(bundle.stopped ?? "", /Standard Access/);
  const pulled = await pullMetaSnapshot({
    accountIds: ["act_1"],
    accessToken: TOKEN,
    appSecret: SECRET,
    graphVersion: "v23.0",
    since: "2026-10-01",
    until: "2026-10-07",
    attributionWindows: ["7d_click"],
    fetchImpl,
    sleep: async () => {},
    log: () => {},
    deadline: Date.now() + 1_000,
  });
  assert.equal(pulled.snapshot.accounts.length, 1);
  assert.equal(pulled.snapshot.metrics.length, ID_BATCH + 1);
  assert.match(pulled.failures[0] ?? "", /Standard Access/);
});

test("a deprecated ids error does not drop insights already pulled", async () => {
  const deprecated = () =>
    Response.json({ error: { message: "The ids query parameter is deprecated in v26.0+.", code: 100 } }, { status: 500 });
  const urls: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    urls.push(url);
    const parsed = new URL(url);
    if (parsed.searchParams.has("ids")) return deprecated();
    if (parsed.pathname === "/v23.0/act_1") {
      return Response.json({ id: "act_1", name: "Specificity Inc Marketing", currency: "USD", timezone_name: "America/New_York", account_status: 1 });
    }
    if (parsed.pathname.endsWith("/insights")) {
      return Response.json({
        data: [
          { ad_id: "ad_9", adset_id: "as_9", campaign_id: "c_9", spend: "4.5", impressions: "20", clicks: "2", date_start: "2026-10-07" },
          { ad_id: "ad_9", adset_id: "as_9", campaign_id: "c_9", spend: "1.5", impressions: "8", clicks: "1", date_start: "2026-10-06" },
        ],
      });
    }
    const filtering = parsed.searchParams.get("filtering") ?? "";
    if (filtering.includes("campaign.id")) return deprecated();
    if (filtering.includes("adset.id")) {
      return Response.json({ data: [{ id: "as_9", name: "Set", campaign_id: "c_9", effective_status: "ACTIVE" }] });
    }
    if (filtering.includes("ad.id")) {
      return Response.json({
        data: [{ id: "ad_9", name: "Delivered ad", adset_id: "as_9", effective_status: "ACTIVE", creative: { id: "cr_9" } }],
      });
    }
    if (parsed.pathname.endsWith("/adcreatives")) return deprecated();
    return Response.json({ data: [] });
  };
  const pulled = await pullMetaSnapshot({
    accountIds: ["act_1"],
    accessToken: TOKEN,
    appSecret: SECRET,
    graphVersion: "v23.0",
    since: "2026-10-01",
    until: "2026-10-07",
    attributionWindows: ["7d_click"],
    fetchImpl,
    sleep: async () => {},
    log: () => {},
  });
  assert.equal(urls.some((url) => new URL(url).searchParams.has("ids")), false);
  assert.equal(pulled.failures.length, 0);
  assert.equal(pulled.snapshot.accounts.length, 1);
  assert.equal(pulled.snapshot.adGroups.length, 1);
  assert.equal(pulled.snapshot.ads.length, 1);
  assert.equal(pulled.snapshot.metrics.length, 2);
  assert.equal(pulled.snapshot.campaigns[0]?.name, "c_9");
  assert.match(pulled.snapshot.warnings.join("\n"), /campaigns skipped: Meta 500 code 100: The ids query parameter is deprecated/);
  assert.match(pulled.snapshot.warnings.join("\n"), /creatives skipped: Meta 500 code 100: The ids query parameter is deprecated/);
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

import { createHmac } from "node:crypto";
import { asRecord, str } from "./meta-map";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
export type Sleep = (ms: number) => Promise<void>;

/** HMAC-SHA256 of the access token, keyed by the app secret. Meta's appsecret_proof. */
export function appSecretProof(accessToken: string, appSecret: string) {
  return createHmac("sha256", appSecret).update(accessToken).digest("hex");
}

export const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80004]);
export const MAX_GRAPH_PAGES = 200;
export const MIN_PAGE_LIMIT = 10;
/** Stop an account pull instead of sleeping for the rest of a development-tier window. */
export const MAX_PULL_MS = 12 * 60_000;
const MAX_ATTEMPTS = 5;

export type MetaProgressLog = (line: string) => void;

export type MetaProgress = {
  method: string;
  path: string;
  page: number;
  rows: number;
  sleepMs: number;
  reason: string;
};

export function formatMetaProgress(event: MetaProgress) {
  const reason = event.reason ? ` (${event.reason})` : "";
  return `Meta ${event.method} ${event.path} page ${event.page} rows ${event.rows} sleep ${Math.round(event.sleepMs / 1000)}s${reason}`;
}

export function emitMetaProgress(event: MetaProgress, log?: MetaProgressLog) {
  const line = formatMetaProgress(event);
  (log ?? ((text: string) => console.error(text)))(line);
  return line;
}

export function redactSecrets(value: string, secrets: string[] = []) {
  let redacted = value
    .replace(/access_token=[^&\s]+/gi, "access_token=[redacted]")
    .replace(/appsecret_proof=[^&\s]+/gi, "appsecret_proof=[redacted]");
  for (const secret of secrets) {
    if (secret.length >= 6) redacted = redacted.split(secret).join("[redacted]");
  }
  return redacted;
}

export class MetaGraphError extends Error {
  status: number;
  code: number | null;

  constructor(message: string, options: { status?: number; code?: number | null } = {}) {
    super(message);
    this.name = "MetaGraphError";
    this.status = options.status ?? 0;
    this.code = options.code ?? null;
  }
}

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function graphUrl(input: {
  version: string;
  path: string;
  token: string;
  appSecret: string;
  params?: Record<string, string>;
}) {
  const url = new URL(`https://graph.facebook.com/${input.version}/${input.path.replace(/^\//, "")}`);
  url.searchParams.set("access_token", input.token);
  if (input.appSecret.trim()) {
    url.searchParams.set("appsecret_proof", appSecretProof(input.token, input.appSecret));
  }
  for (const [key, value] of Object.entries(input.params ?? {})) {
    if (value) url.searchParams.set(key, value);
  }
  return url;
}

function errorCode(body: unknown) {
  const code = Number(asRecord(asRecord(body).error).code);
  return Number.isFinite(code) ? code : null;
}

export type Pace = { ms: number; reason: string };

/**
 * Development access reports total_cputime around 100 with estimated_time_to_regain_access 0.
 * Honor a positive regain time. Otherwise a high percentage is a 5s gap, not a 60s sleep per page.
 */
export function businessUseCasePace(header: string | null): Pace {
  if (!header) return { ms: 0, reason: "" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(header);
  } catch {
    return { ms: 0, reason: "" };
  }
  let peak = 0;
  let peakKey = "";
  let regainMinutes = 0;
  const buckets = parsed && typeof parsed === "object" ? Object.values(parsed as Record<string, unknown>) : [];
  for (const bucket of buckets) {
    const rows = Array.isArray(bucket) ? bucket : [bucket];
    for (const row of rows) {
      const record = asRecord(row);
      for (const key of ["call_count", "total_cputime", "total_time"]) {
        const value = Number(record[key]);
        if (Number.isFinite(value) && value >= peak) {
          peak = value;
          peakKey = key;
        }
      }
      const estimate = Number(record.estimated_time_to_regain_access);
      if (Number.isFinite(estimate)) regainMinutes = Math.max(regainMinutes, estimate);
    }
  }
  if (regainMinutes > 0) {
    return {
      ms: Math.min(regainMinutes * 60_000, 15 * 60_000),
      reason: `estimated_time_to_regain_access ${regainMinutes}m`,
    };
  }
  if (peak >= 80) return { ms: 5_000, reason: `${peakKey} ${peak}` };
  return { ms: 0, reason: "" };
}

/** Delay implied by Meta's x-business-use-case-usage header. 0 means send the next call now. */
export function businessUseCaseDelayMs(header: string | null) {
  return businessUseCasePace(header).ms;
}

/** x-fb-ads-insights-throttle percentages are on a 0–100 scale. */
export function insightsThrottlePace(header: string | null): Pace {
  if (!header) return { ms: 0, reason: "" };
  try {
    const record = asRecord(JSON.parse(header));
    const app = Number(record.app_id_util_pct);
    const account = Number(record.acc_id_util_pct);
    const peak = Math.max(Number.isFinite(app) ? app : 0, Number.isFinite(account) ? account : 0);
    if (peak >= 95) return { ms: 30_000, reason: `insights throttle ${peak}` };
    if (peak >= 80) return { ms: 5_000, reason: `insights throttle ${peak}` };
    return { ms: 0, reason: "" };
  } catch {
    return { ms: 0, reason: "" };
  }
}

export function insightsThrottleDelayMs(header: string | null) {
  return insightsThrottlePace(header).ms;
}

export function paceFromHeaders(headers: { get(name: string): string | null }): Pace {
  const usage = businessUseCasePace(headers.get("x-business-use-case-usage"));
  const insights = insightsThrottlePace(headers.get("x-fb-ads-insights-throttle"));
  return insights.ms > usage.ms ? insights : usage;
}

export function isMetaBudgetStop(error: unknown) {
  return error instanceof MetaGraphError && error.message.startsWith("Meta rate limit");
}

export function retryDelayMs(attempt: number, retryAfterHeader: string | null) {
  const retryAfter = Number(retryAfterHeader);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 15 * 60_000);
  const backoff = 1000 * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(backoff + jitter, 60_000);
}

function metaErrorMessage(body: unknown, status: number, secrets: string[]) {
  const error = asRecord(asRecord(body).error);
  const message = str(error.message) || (typeof body === "string" ? body : "");
  const code = errorCode(body);
  const prefix = code ? `Meta ${status} code ${code}` : `Meta ${status}`;
  return `${prefix}: ${redactSecrets(message, secrets).slice(0, 300)}`;
}

export type GraphCall = {
  version: string;
  path: string;
  token: string;
  appSecret: string;
  params?: Record<string, string>;
  fetchImpl?: FetchLike;
  sleep?: Sleep;
  log?: MetaProgressLog;
  deadline?: number;
  page?: number;
  rowsBefore?: number;
};

function safePath(input: { version: string; path: string; params?: Record<string, string> }) {
  if (!input.path.replace(/\//g, "") && input.params?.ids) return `/${input.version}/ids`;
  const clean = input.path.replace(/^\//, "").split("?")[0];
  const joined = `/${input.version}/${clean}`.replace(/\/{2,}/g, "/").replace(/\/$/, "");
  return joined || `/${input.version}`;
}

function countedRows(body: unknown, rowsBefore: number, params?: Record<string, string>) {
  const data = asRecord(body).data;
  if (Array.isArray(data)) return rowsBefore + data.length;
  if (params?.ids) return rowsBefore + Object.keys(asRecord(body)).length;
  if (body && typeof body === "object") return Math.max(rowsBefore, 1);
  return rowsBefore;
}

function budgetStop(waitMs: number, reason: string, remainingMs: number) {
  const left = Math.max(0, Math.round(remainingMs / 1000));
  const asked =
    waitMs > 0
      ? `asked for a ${Math.ceil(waitMs / 1000)}s wait (${reason || "rate limit"}). `
      : "reached before the next call. ";
  return new MetaGraphError(
    `Meta rate limit ${asked}${left}s left in the ${MAX_PULL_MS / 60_000} minute limit, so the sync stopped instead of waiting. Development access tier is slow; Standard Access is needed to sync multiple accounts.`,
    { status: 429, code: null },
  );
}

function assertBudget(deadline: number | undefined, waitMs: number, reason: string) {
  if (!deadline) return;
  const remaining = deadline - Date.now();
  if (remaining <= 0 || waitMs > remaining) throw budgetStop(waitMs, reason, remaining);
}

export async function waitForMeta(input: {
  ms: number;
  reason: string;
  path: string;
  method?: string;
  sleep?: Sleep;
  deadline?: number;
  log?: MetaProgressLog;
}) {
  if (input.ms <= 0) return;
  assertBudget(input.deadline, input.ms, input.reason);
  emitMetaProgress(
    {
      method: input.method ?? "WAIT",
      path: input.path,
      page: 1,
      rows: 0,
      sleepMs: input.ms,
      reason: input.reason,
    },
    input.log,
  );
  await (input.sleep ?? defaultSleep)(input.ms);
}

async function pause(input: GraphCall & { method: string }, waitMs: number, reason: string, rows: number) {
  assertBudget(input.deadline, waitMs, reason);
  emitMetaProgress(
    {
      method: input.method,
      path: safePath(input),
      page: input.page ?? 1,
      rows,
      sleepMs: waitMs,
      reason,
    },
    input.log,
  );
  if (waitMs > 0) await (input.sleep ?? defaultSleep)(waitMs);
}

async function graphRequest(input: GraphCall & { method: "GET" | "POST" }) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const url = graphUrl(input);
  const secrets = [input.token, input.appSecret].filter((value) => value.trim().length >= 6);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    assertBudget(input.deadline, 0, "next call");
    let response: Response;
    try {
      response = await fetchImpl(url.toString(), {
        method: input.method,
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      const message = redactSecrets(error instanceof Error ? error.message : "Meta request failed", secrets);
      lastError = new MetaGraphError(message, { status: 0, code: null });
      if (attempt < MAX_ATTEMPTS - 1) {
        const wait = retryDelayMs(attempt, null);
        await pause(input, wait, "network retry", input.rowsBefore ?? 0);
        continue;
      }
      throw lastError;
    }

    const text = await response.text();
    let body: unknown = {};
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    const code = errorCode(body);
    const failed = !response.ok || (body && typeof body === "object" && "error" in (body as object));
    if (failed) {
      const retryable = response.status === 429 || (code !== null && RATE_LIMIT_CODES.has(code));
      lastError = new MetaGraphError(metaErrorMessage(body, response.status, secrets), { status: response.status, code });
      if (retryable && attempt < MAX_ATTEMPTS - 1) {
        const decision = paceFromHeaders(response.headers);
        const retry = retryDelayMs(attempt, response.headers.get("retry-after"));
        const wait = Math.max(retry, decision.ms);
        const reason = decision.ms >= retry && decision.reason ? decision.reason : `retry-after ${Math.round(retry / 1000)}s`;
        await pause(input, wait, reason, input.rowsBefore ?? 0);
        continue;
      }
      await pause(input, 0, `error ${response.status}`, input.rowsBefore ?? 0);
      throw lastError;
    }

    const decision = paceFromHeaders(response.headers);
    await pause(input, decision.ms, decision.reason, countedRows(body, input.rowsBefore ?? 0, input.params));
    return body;
  }

  throw lastError ?? new MetaGraphError("Meta request failed");
}

export async function graphGet(input: GraphCall) {
  return graphRequest({ ...input, method: "GET" });
}

export async function graphPost(input: GraphCall) {
  return graphRequest({ ...input, method: "POST" });
}

function shouldShrinkPage(error: unknown, limit: number) {
  if (limit <= MIN_PAGE_LIMIT) return false;
  if (!(error instanceof MetaGraphError)) return false;
  if (error.code !== null && RATE_LIMIT_CODES.has(error.code)) return false;
  // Code 100 is an invalid parameter. A smaller page will not make it succeed.
  if (error.code === 100) return false;
  const message = error.message;
  return error.status >= 500 || /reduce the amount of data/i.test(message);
}

export async function graphList(input: GraphCall) {
  const rows: unknown[] = [];
  let after = "";
  const requested = Number(input.params?.limit);
  let limit = Number.isFinite(requested) && requested > 0 ? Math.min(100, Math.floor(requested)) : 100;
  for (let page = 0; page < MAX_GRAPH_PAGES; page += 1) {
    const params: Record<string, string> = { ...(input.params ?? {}), limit: String(limit) };
    if (after) params.after = after;
    let body: Record<string, unknown>;
    try {
      body = asRecord(
        await graphGet({
          ...input,
          params,
          page: page + 1,
          rowsBefore: rows.length,
        }),
      );
    } catch (error) {
      if (shouldShrinkPage(error, limit)) {
        limit = Math.max(MIN_PAGE_LIMIT, Math.floor(limit / 2));
        page -= 1;
        continue;
      }
      throw error;
    }
    if (Array.isArray(body.data)) rows.push(...body.data);
    const paging = asRecord(body.paging);
    const cursors = asRecord(paging.cursors);
    const nextAfter = str(cursors.after);
    const hasNext = Boolean(str(paging.next)) && Boolean(nextAfter) && nextAfter !== after;
    if (!hasNext) return rows;
    if (page === MAX_GRAPH_PAGES - 1) {
      throw new MetaGraphError(`Meta results exceeded ${MAX_GRAPH_PAGES} pages for ${input.path}`, { status: 0, code: null });
    }
    after = nextAfter;
  }
  return rows;
}

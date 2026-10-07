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
const MAX_ATTEMPTS = 5;

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

/** Delay implied by Meta's x-business-use-case-usage header. 0 means send the next call now. */
export function businessUseCaseDelayMs(header: string | null) {
  if (!header) return 0;
  let parsed: unknown;
  try {
    parsed = JSON.parse(header);
  } catch {
    return 0;
  }
  let peak = 0;
  let regainMinutes = 0;
  const buckets = parsed && typeof parsed === "object" ? Object.values(parsed as Record<string, unknown>) : [];
  for (const bucket of buckets) {
    const rows = Array.isArray(bucket) ? bucket : [bucket];
    for (const row of rows) {
      const record = asRecord(row);
      for (const key of ["call_count", "total_cputime", "total_time"]) {
        const value = Number(record[key]);
        if (Number.isFinite(value)) peak = Math.max(peak, value);
      }
      const estimate = Number(record.estimated_time_to_regain_access);
      if (Number.isFinite(estimate)) regainMinutes = Math.max(regainMinutes, estimate);
    }
  }
  if (regainMinutes > 0) return Math.min(regainMinutes * 60_000, 15 * 60_000);
  if (peak >= 100) return 60_000;
  if (peak >= 80) return 5_000;
  return 0;
}

/** x-fb-ads-insights-throttle percentages are on a 0–100 scale. */
export function insightsThrottleDelayMs(header: string | null) {
  if (!header) return 0;
  try {
    const record = asRecord(JSON.parse(header));
    const app = Number(record.app_id_util_pct);
    const account = Number(record.acc_id_util_pct);
    const peak = Math.max(Number.isFinite(app) ? app : 0, Number.isFinite(account) ? account : 0);
    if (peak >= 95) return 30_000;
    if (peak >= 80) return 5_000;
    return 0;
  } catch {
    return 0;
  }
}

export function paceFromHeaders(headers: { get(name: string): string | null }) {
  return Math.max(
    businessUseCaseDelayMs(headers.get("x-business-use-case-usage")),
    insightsThrottleDelayMs(headers.get("x-fb-ads-insights-throttle")),
  );
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

async function graphRequest(input: {
  method: "GET" | "POST";
  version: string;
  path: string;
  token: string;
  appSecret: string;
  params?: Record<string, string>;
  fetchImpl?: FetchLike;
  sleep?: Sleep;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const sleep = input.sleep ?? defaultSleep;
  const url = graphUrl(input);
  const secrets = [input.token, input.appSecret].filter((value) => value.trim().length >= 6);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
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
        await sleep(retryDelayMs(attempt, null));
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
        const wait = Math.max(retryDelayMs(attempt, response.headers.get("retry-after")), paceFromHeaders(response.headers));
        await sleep(wait);
        continue;
      }
      throw lastError;
    }

    const pace = paceFromHeaders(response.headers);
    if (pace > 0) await sleep(pace);
    return body;
  }

  throw lastError ?? new MetaGraphError("Meta request failed");
}

export async function graphGet(input: {
  version: string;
  path: string;
  token: string;
  appSecret: string;
  params?: Record<string, string>;
  fetchImpl?: FetchLike;
  sleep?: Sleep;
}) {
  return graphRequest({ ...input, method: "GET" });
}

export async function graphPost(input: {
  version: string;
  path: string;
  token: string;
  appSecret: string;
  params?: Record<string, string>;
  fetchImpl?: FetchLike;
  sleep?: Sleep;
}) {
  return graphRequest({ ...input, method: "POST" });
}

export async function graphList(input: {
  version: string;
  path: string;
  token: string;
  appSecret: string;
  params?: Record<string, string>;
  fetchImpl?: FetchLike;
  sleep?: Sleep;
}) {
  const rows: unknown[] = [];
  let after = "";
  for (let page = 0; page < MAX_GRAPH_PAGES; page += 1) {
    const params: Record<string, string> = { ...(input.params ?? {}), limit: "100" };
    if (after) params.after = after;
    const body = asRecord(
      await graphGet({
        version: input.version,
        path: input.path,
        token: input.token,
        appSecret: input.appSecret,
        params,
        fetchImpl: input.fetchImpl,
        sleep: input.sleep,
      }),
    );
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

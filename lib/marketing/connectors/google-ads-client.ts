/**
 * Google Ads HTTP client.
 *
 * The adwords OAuth scope can read and write. This file is the least-privilege
 * boundary: the only Google Ads API calls that can leave the process are
 * GoogleAdsService search and searchStream. Every mutate method is rejected
 * before fetch runs.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
export type Sleep = (ms: number) => Promise<void>;

export const GOOGLE_ADS_HOST = "googleads.googleapis.com";
export const GOOGLE_ADS_TOKEN_URL = "https://oauth2.googleapis.com/token";
const READ_ONLY_PATH = /^\/v\d+\/customers\/\d{10}\/googleAds:(search|searchStream)$/;
const MAX_ATTEMPTS = 3;
const MAX_SEARCH_PAGES = 100;

/**
 * Known write methods. The allowlist above is what blocks them. This list is
 * the set the tests call, so a new mutate name still fails closed.
 */
export const GOOGLE_ADS_MUTATE_PATHS = [
  "campaigns:mutate",
  "campaignBudgets:mutate",
  "campaignCriteria:mutate",
  "campaignAssets:mutate",
  "campaignSharedSets:mutate",
  "campaignBidModifiers:mutate",
  "adGroups:mutate",
  "adGroupAds:mutate",
  "adGroupCriteria:mutate",
  "adGroupAssets:mutate",
  "adGroupBidModifiers:mutate",
  "ads:mutate",
  "assets:mutate",
  "assetGroups:mutate",
  "assetGroupAssets:mutate",
  "customers:mutate",
  "customerAssets:mutate",
  "conversionActions:mutate",
  "conversionValueRules:mutate",
  "customerClientLinks:mutate",
  "customerUserAccesses:mutate",
  "userLists:mutate",
  "biddingStrategies:mutate",
  "recommendations:apply",
  "experiments:mutate",
  "experimentArms:mutate",
  "batchJobs:mutate",
  "googleAds:mutate",
  "offlineUserDataJobs:create",
  "labels:mutate",
  "sharedCriteria:mutate",
  "sharedSets:mutate",
  "billingSetups:mutate",
  "accountBudgetProposals:mutate",
  "paymentsAccounts:mutate",
  "keywordPlanAdGroupKeywords:mutate",
  ":uploadClickConversions",
  ":uploadCallConversions",
  ":uploadConversionAdjustments",
] as const;

const WRITE_MARKER = /mutate|upload|offlineUserData|:apply|batchJob/i;

export class GoogleAdsWriteBlockedError extends Error {
  constructor(method: string, rawUrl: string) {
    super(`Blocked Google Ads ${method} ${safeGoogleAdsPath(rawUrl)}. Only GoogleAdsService search and searchStream are allowed.`);
    this.name = "GoogleAdsWriteBlockedError";
  }
}

export class GoogleAdsApiError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "GoogleAdsApiError";
    this.status = status;
  }
}

export function redactGoogleSecrets(value: string, secrets: string[] = []) {
  let redacted = value
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(/developer-token[=:\s]+\S+/gi, "developer-token=[redacted]")
    .replace(/refresh_token=[^&\s]+/gi, "refresh_token=[redacted]")
    .replace(/client_secret=[^&\s]+/gi, "client_secret=[redacted]")
    .replace(/access_token=[^&\s]+/gi, "access_token=[redacted]");
  for (const secret of secrets) {
    if (secret.trim().length >= 6) redacted = redacted.split(secret).join("[redacted]");
  }
  return redacted;
}

export function safeGoogleAdsPath(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return `${url.hostname}${url.pathname}`.slice(0, 180);
  } catch {
    return rawUrl.split("?")[0]?.slice(0, 180) || "invalid-url";
  }
}

export type GoogleAdsReadMethod = "search" | "searchStream";

/** Allow POST search and searchStream on googleads.googleapis.com. Everything else is blocked. */
export function classifyGoogleAdsRequest(method: string, rawUrl: string): GoogleAdsReadMethod | "blocked" {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return "blocked";
  }
  if (method.toUpperCase() !== "POST") return "blocked";
  if (url.protocol !== "https:") return "blocked";
  if (url.username || url.password || url.port) return "blocked";
  if (url.hostname !== GOOGLE_ADS_HOST) return "blocked";
  if (url.search || url.hash) return "blocked";
  if (rawUrl.includes("..") || rawUrl.includes("\\")) return "blocked";
  if (WRITE_MARKER.test(rawUrl)) return "blocked";
  const match = url.pathname.match(READ_ONLY_PATH);
  if (!match) return "blocked";
  return match[1] === "searchStream" ? "searchStream" : "search";
}

export function assertGoogleAdsReadOnly(method: string, rawUrl: string): GoogleAdsReadMethod {
  const kind = classifyGoogleAdsRequest(method, rawUrl);
  if (kind === "blocked") throw new GoogleAdsWriteBlockedError(method, rawUrl);
  return kind;
}

export function googleAdsServiceUrl(apiVersion: string, customerId: string, method: GoogleAdsReadMethod) {
  if (!/^v\d+$/.test(apiVersion) || !/^\d{10}$/.test(customerId)) {
    throw new GoogleAdsWriteBlockedError("POST", `${apiVersion}/customers/${customerId}/googleAds:${method}`);
  }
  const url = `https://${GOOGLE_ADS_HOST}/${apiVersion}/customers/${customerId}/googleAds:${method}`;
  assertGoogleAdsReadOnly("POST", url);
  return url;
}

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function retryDelay(attempt: number, retryAfterHeader: string | null) {
  const retryAfter = Number(retryAfterHeader);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 30_000);
  return Math.min(500 * 2 ** attempt, 8_000);
}

export type GoogleAdsCall = {
  method: string;
  url: string;
  body?: string;
  headers?: Record<string, string>;
  fetchImpl?: FetchLike;
  sleep?: Sleep;
  secrets?: string[];
};

function errorMessage(body: unknown, status: number, secrets: string[]) {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const error = record.error && typeof record.error === "object" ? (record.error as Record<string, unknown>) : {};
  const message = typeof error.message === "string" ? error.message : typeof body === "string" ? body : "Google Ads request failed";
  const code = typeof error.status === "string" ? error.status : "";
  const prefix = code ? `Google Ads ${status} ${code}` : `Google Ads ${status}`;
  return redactGoogleSecrets(`${prefix}: ${message}`.slice(0, 400), secrets);
}

/** Performs one allowlisted Google Ads call. Mutate URLs throw and do not call fetch. */
export async function googleAdsRequest(input: GoogleAdsCall) {
  assertGoogleAdsReadOnly(input.method, input.url);
  const fetchImpl = input.fetchImpl ?? fetch;
  const sleep = input.sleep ?? defaultSleep;
  const secrets = input.secrets ?? [];
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(input.url, {
        method: "POST",
        headers: { "content-type": "application/json", ...(input.headers ?? {}) },
        body: input.body,
        redirect: "error",
      });
    } catch (error) {
      const message = redactGoogleSecrets(error instanceof Error ? error.message : "Google Ads request failed", secrets);
      lastError = new GoogleAdsApiError(message, 0);
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(retryDelay(attempt, null));
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
    if (!response.ok) {
      lastError = new GoogleAdsApiError(errorMessage(body, response.status, secrets), response.status);
      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < MAX_ATTEMPTS - 1) {
        await sleep(retryDelay(attempt, response.headers.get("retry-after")));
        continue;
      }
      throw lastError;
    }
    return body;
  }

  throw lastError ?? new GoogleAdsApiError("Google Ads request failed");
}

export async function refreshGoogleAdsAccessToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetchImpl?: FetchLike;
}) {
  const secrets = [input.clientSecret, input.refreshToken, input.clientId].filter((value) => value.length >= 6);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: input.clientId,
    client_secret: input.clientSecret,
    refresh_token: input.refreshToken,
  });
  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(GOOGLE_ADS_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      redirect: "error",
    });
  } catch (error) {
    throw new GoogleAdsApiError(redactGoogleSecrets(error instanceof Error ? error.message : "Google token request failed", secrets));
  }
  const text = await response.text();
  let parsed: unknown = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  const record = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const token = typeof record.access_token === "string" ? record.access_token.trim() : "";
  if (!response.ok || !token) {
    const message = typeof record.error_description === "string" ? record.error_description : typeof record.error === "string" ? record.error : text;
    throw new GoogleAdsApiError(redactGoogleSecrets(`Google token ${response.status}: ${message}`.slice(0, 300), secrets), response.status);
  }
  return token;
}

function adsHeaders(input: { accessToken: string; developerToken: string; loginCustomerId: string }) {
  return {
    authorization: `Bearer ${input.accessToken}`,
    "developer-token": input.developerToken,
    "login-customer-id": input.loginCustomerId,
  };
}

function resultRows(body: unknown) {
  if (Array.isArray(body)) {
    const rows: unknown[] = [];
    for (const chunk of body) {
      const results = chunk && typeof chunk === "object" ? (chunk as Record<string, unknown>).results : undefined;
      if (Array.isArray(results)) rows.push(...results);
    }
    return rows;
  }
  const results = body && typeof body === "object" ? (body as Record<string, unknown>).results : undefined;
  return Array.isArray(results) ? results : [];
}

export type GoogleAdsQuery = {
  customerId: string;
  query: string;
  accessToken: string;
  developerToken: string;
  loginCustomerId: string;
  apiVersion: string;
  fetchImpl?: FetchLike;
  sleep?: Sleep;
};

function callSecrets(input: { accessToken: string; developerToken: string }) {
  return [input.accessToken, input.developerToken].filter((value) => value.length >= 6);
}

export async function googleAdsSearch(input: GoogleAdsQuery) {
  const rows: unknown[] = [];
  let pageToken = "";
  for (let page = 0; page < MAX_SEARCH_PAGES; page += 1) {
    const url = googleAdsServiceUrl(input.apiVersion, input.customerId, "search");
    const payload: Record<string, string> = { query: input.query };
    if (pageToken) payload.pageToken = pageToken;
    const body = await googleAdsRequest({
      method: "POST",
      url,
      body: JSON.stringify(payload),
      headers: adsHeaders(input),
      fetchImpl: input.fetchImpl,
      sleep: input.sleep,
      secrets: callSecrets(input),
    });
    rows.push(...resultRows(body));
    const next = body && typeof body === "object" ? (body as Record<string, unknown>).nextPageToken : "";
    const token = typeof next === "string" ? next : "";
    if (!token || token === pageToken) return rows;
    pageToken = token;
  }
  throw new GoogleAdsApiError(`Google Ads search exceeded ${MAX_SEARCH_PAGES} pages`);
}

export async function googleAdsSearchStream(input: GoogleAdsQuery) {
  const url = googleAdsServiceUrl(input.apiVersion, input.customerId, "searchStream");
  const body = await googleAdsRequest({
    method: "POST",
    url,
    body: JSON.stringify({ query: input.query }),
    headers: adsHeaders(input),
    fetchImpl: input.fetchImpl,
    sleep: input.sleep,
    secrets: callSecrets(input),
  });
  return resultRows(body);
}

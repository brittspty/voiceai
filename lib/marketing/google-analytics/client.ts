/**
 * Google Analytics Data API client.
 * Refreshes GOOGLE_ANALYTICS_REFRESH_TOKEN (or a named extra) with the web OAuth client.
 * The request scope is analytics.readonly. The Google Ads refresh token is not read.
 * runReport is the only Analytics call. Admin writes and adwords URLs are refused.
 */

import { assertOutboundOpen } from "../../demo/outbound";
import { assertNoAdBudgetWrite } from "../connectors/budget-lock";
import { ANALYTICS_ADS_SCOPE, ANALYTICS_READONLY_SCOPE } from "./connections";
import { ANALYTICS_DIMENSIONS, ANALYTICS_METRICS } from "./report";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const ANALYTICS_DATA_HOST = "analyticsdata.googleapis.com";
export const ANALYTICS_TOKEN_URL = "https://oauth2.googleapis.com/token";
const PAGE_LIMIT = 10_000;
const MAX_PAGES = 20;

export class AnalyticsWriteBlockedError extends Error {
  constructor(method: string, rawUrl: string) {
    super(`Blocked Google Analytics ${method} ${safePath(rawUrl)}. Only properties/{id}:runReport is allowed.`);
    this.name = "AnalyticsWriteBlockedError";
  }
}

export class AnalyticsApiError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "AnalyticsApiError";
    this.status = status;
  }
}

export function redactAnalyticsSecrets(value: string, secrets: string[] = []) {
  let redacted = value
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(/refresh_token=[^&\s]+/gi, "refresh_token=[redacted]")
    .replace(/client_secret=[^&\s]+/gi, "client_secret=[redacted]")
    .replace(/access_token=[^&\s]+/gi, "access_token=[redacted]");
  for (const secret of secrets) {
    if (secret.trim().length >= 6) redacted = redacted.split(secret).join("[redacted]");
  }
  return redacted;
}

function safePath(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return `${url.hostname}${url.pathname}`.slice(0, 180);
  } catch {
    return rawUrl.split("?")[0]?.slice(0, 180) || "invalid-url";
  }
}

/** True when a token response says the grant includes the ads scope. */
export function scopeIncludesAds(scope: string) {
  const value = scope.toLowerCase();
  return value.includes(ANALYTICS_ADS_SCOPE) || /\badwords\b/.test(value);
}

export function analyticsTokenBody(input: { clientId: string; clientSecret: string; refreshToken: string }) {
  return new URLSearchParams({
    grant_type: "refresh_token",
    client_id: input.clientId,
    client_secret: input.clientSecret,
    refresh_token: input.refreshToken,
    scope: ANALYTICS_READONLY_SCOPE,
  }).toString();
}

/** POST runReport on analyticsdata.googleapis.com for one numeric property. Everything else is blocked. */
export function assertAnalyticsReadOnly(method: string, rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AnalyticsWriteBlockedError(method, rawUrl);
  }
  const runReport = method.toUpperCase() === "POST" && url.protocol === "https:" && url.hostname === ANALYTICS_DATA_HOST && /^\/v1beta\/properties\/\d{6,12}:runReport$/.test(url.pathname) && !url.username && !url.password && !url.port && !url.search && !url.hash;
  if (!runReport || /mutate|delete|insert|update|upload|adwords/i.test(url.pathname)) {
    throw new AnalyticsWriteBlockedError(method, rawUrl);
  }
}

export function analyticsReportUrl(propertyId: string) {
  if (!/^\d{6,12}$/.test(propertyId)) throw new AnalyticsWriteBlockedError("POST", propertyId);
  const url = `https://${ANALYTICS_DATA_HOST}/v1beta/properties/${propertyId}:runReport`;
  assertAnalyticsReadOnly("POST", url);
  return url;
}

export function analyticsReportBody(input: { since: string; until: string; offset: number }) {
  return {
    dateRanges: [{ startDate: input.since, endDate: input.until }],
    dimensions: ANALYTICS_DIMENSIONS.map((name) => ({ name })),
    metrics: ANALYTICS_METRICS.map((name) => ({ name })),
    limit: String(PAGE_LIMIT),
    offset: String(input.offset),
    keepEmptyRows: false,
  };
}

export async function refreshAnalyticsAccessToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetchImpl?: FetchLike;
}) {
  const secrets = [input.clientSecret, input.refreshToken, input.clientId].filter((value) => value.length >= 6);
  const body = analyticsTokenBody(input);
  if (scopeIncludesAds(body) || body.includes(ANALYTICS_ADS_SCOPE)) {
    throw new AnalyticsApiError("Refused to refresh an Analytics token with an ads scope");
  }
  assertOutboundOpen("google");
  assertNoAdBudgetWrite({ method: "POST", url: ANALYTICS_TOKEN_URL, body });
  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(ANALYTICS_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      redirect: "error",
    });
  } catch (error) {
    throw new AnalyticsApiError(redactAnalyticsSecrets(error instanceof Error ? error.message : "Google token request failed", secrets));
  }
  const text = await response.text();
  let parsed: unknown = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {};
    }
  }
  const record = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const token = typeof record.access_token === "string" ? record.access_token.trim() : "";
  const scope = typeof record.scope === "string" ? record.scope : "";
  if (scopeIncludesAds(scope)) {
    throw new AnalyticsApiError("Analytics token included an ads scope and was not used");
  }
  if (!response.ok || !token) {
    const message = typeof record.error_description === "string" ? record.error_description : typeof record.error === "string" ? record.error : "token request failed";
    throw new AnalyticsApiError(redactAnalyticsSecrets(`Google token ${response.status}: ${message}`.slice(0, 300), secrets), response.status);
  }
  return token;
}

export async function pullAnalyticsReport(input: {
  propertyId: string;
  accessToken: string;
  since: string;
  until: string;
  fetchImpl?: FetchLike;
}) {
  const secrets = [input.accessToken].filter((value) => value.length >= 6);
  const fetchImpl = input.fetchImpl ?? fetch;
  const pages: unknown[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = analyticsReportUrl(input.propertyId);
    const body = JSON.stringify(analyticsReportBody({ since: input.since, until: input.until, offset: page * PAGE_LIMIT }));
    assertOutboundOpen("google");
    assertNoAdBudgetWrite({ method: "POST", url, body });
    assertAnalyticsReadOnly("POST", url);
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: { authorization: `Bearer ${input.accessToken}`, "content-type": "application/json" },
        body,
        redirect: "error",
      });
    } catch (error) {
      throw new AnalyticsApiError(redactAnalyticsSecrets(error instanceof Error ? error.message : "Analytics report failed", secrets));
    }
    const text = await response.text();
    let parsed: unknown = {};
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = {};
      }
    }
    if (!response.ok) {
      const record = parsed && typeof parsed === "object" ? (parsed as { error?: { message?: string } }) : {};
      const message = record.error?.message || "Analytics report failed";
      throw new AnalyticsApiError(redactAnalyticsSecrets(`Analytics ${response.status}: ${message}`.slice(0, 300), secrets), response.status);
    }
    pages.push(parsed);
    const record = parsed && typeof parsed === "object" ? (parsed as { rows?: unknown[]; rowCount?: number }) : {};
    const count = Array.isArray(record.rows) ? record.rows.length : 0;
    if (count < PAGE_LIMIT) break;
  }
  return pages;
}

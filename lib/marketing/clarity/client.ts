/**
 * Microsoft Clarity Data Export API client.
 * Sends the project token from CLARITY_<NAME>_API_TOKEN as a Bearer header.
 * The only call is GET project-live-insights. The token is never logged.
 */

import { assertNoAdBudgetWrite } from "../connectors/budget-lock";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const CLARITY_EXPORT_HOST = "www.clarity.ms";
export const CLARITY_EXPORT_PATH = "/export-data/api/v1/project-live-insights";
export const CLARITY_EXPORT_URL = `https://${CLARITY_EXPORT_HOST}${CLARITY_EXPORT_PATH}`;

export const CLARITY_DIMENSIONS = ["Browser", "Device", "Country/Region", "OS", "Source", "Medium", "Campaign", "Channel", "URL"] as const;
const DIMENSION_OK = new Set<string>(CLARITY_DIMENSIONS);
const QUERY_KEYS = new Set(["numOfDays", "dimension1", "dimension2", "dimension3"]);

export class ClarityWriteBlockedError extends Error {
  constructor(method: string, rawUrl: string) {
    super(`Blocked Microsoft Clarity ${method} ${safePath(rawUrl)}. Only GET project-live-insights is allowed.`);
    this.name = "ClarityWriteBlockedError";
  }
}

export class ClarityApiError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "ClarityApiError";
    this.status = status;
  }
}

export function redactClaritySecrets(value: string, secrets: string[] = []) {
  let redacted = value
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(/authorization:\s*\S+/gi, "authorization: [redacted]");
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

/** GET the live-insights export on www.clarity.ms. Every other method, host, and path is blocked. */
export function assertClarityReadOnly(method: string, rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ClarityWriteBlockedError(method, rawUrl);
  }
  const keys = [...url.searchParams.keys()];
  const days = url.searchParams.get("numOfDays");
  const dimensions = [url.searchParams.get("dimension1"), url.searchParams.get("dimension2"), url.searchParams.get("dimension3")];
  const present = dimensions.filter((value): value is string => value !== null);
  const gap = (dimensions[1] !== null && dimensions[0] === null) || (dimensions[2] !== null && (dimensions[0] === null || dimensions[1] === null));
  const read =
    method.toUpperCase() === "GET" &&
    url.protocol === "https:" &&
    url.hostname === CLARITY_EXPORT_HOST &&
    url.pathname === CLARITY_EXPORT_PATH &&
    !url.username &&
    !url.password &&
    !url.port &&
    !url.hash &&
    keys.every((key) => QUERY_KEYS.has(key)) &&
    (days === "1" || days === "2" || days === "3") &&
    !gap &&
    present.every((value) => DIMENSION_OK.has(value)) &&
    !/mutate|delete|insert|update|upload/i.test(url.pathname);
  if (!read) throw new ClarityWriteBlockedError(method, rawUrl);
}

export function clarityExportUrl(input: { numOfDays: 1 | 2 | 3; dimensions: readonly string[] }) {
  if (input.dimensions.length > 3) throw new ClarityWriteBlockedError("GET", CLARITY_EXPORT_URL);
  const url = new URL(CLARITY_EXPORT_URL);
  url.searchParams.set("numOfDays", String(input.numOfDays));
  input.dimensions.forEach((name, index) => url.searchParams.set(`dimension${index + 1}`, name));
  const built = url.toString();
  assertClarityReadOnly("GET", built);
  return built;
}

export async function pullClarityInsights(input: {
  token: string;
  numOfDays: 1 | 2 | 3;
  dimensions: readonly string[];
  fetchImpl?: FetchLike;
}) {
  const secrets = [input.token].filter((value) => value.length >= 6);
  const url = clarityExportUrl({ numOfDays: input.numOfDays, dimensions: input.dimensions });
  assertClarityReadOnly("GET", url);
  assertNoAdBudgetWrite({ method: "GET", url });
  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { authorization: `Bearer ${input.token}`, accept: "application/json" },
      redirect: "error",
    });
  } catch (error) {
    throw new ClarityApiError(redactClaritySecrets(error instanceof Error ? error.message : "Clarity export failed", secrets));
  }
  const text = await response.text();
  let parsed: unknown = [];
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = [];
    }
  }
  if (!response.ok) {
    const record = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as { message?: string; Message?: string }) : {};
    const message = record.message || record.Message || "Clarity export failed";
    throw new ClarityApiError(redactClaritySecrets(`Clarity ${response.status}: ${message}`.slice(0, 300), secrets), response.status);
  }
  return parsed;
}

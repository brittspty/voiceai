/**
 * OpenAI Advertiser API client.
 * Allowlist only. Mock unless CHATGPT_ADS_MODE=live.
 * The API key is an argument. It is never read from the environment and never logged.
 * Pixel and conversion-event ingestion are not on the allowlist.
 * POST /conversions/insights is the one read-only POST.
 */

import { demoForcesMock } from "../../demo/outbound";
import type { Env } from "../config";
import { mockChatgptAdsResponse } from "../chatgpt-ads/fixtures";
import { assertNoAdBudgetWrite, assertStaffChatgptWrite, type AdBudgetWrite } from "./budget-lock";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const CHATGPT_ADS_ORIGIN = "https://api.ads.openai.com";

export type ChatgptAdsKind = "read" | "read_post" | "staff_write";

type Rule = { method: "GET" | "POST"; pattern: RegExp; kind: ChatgptAdsKind };

/** Pathnames under /v1. Query strings are not part of the match. */
export const CHATGPT_ADS_ALLOWLIST: readonly Rule[] = [
  { method: "GET", pattern: /^\/ad_account$/, kind: "read" },
  { method: "GET", pattern: /^\/campaigns$/, kind: "read" },
  { method: "GET", pattern: /^\/campaigns\/[A-Za-z0-9_-]+$/, kind: "read" },
  { method: "GET", pattern: /^\/ad_groups$/, kind: "read" },
  { method: "GET", pattern: /^\/ad_groups\/[A-Za-z0-9_-]+$/, kind: "read" },
  { method: "GET", pattern: /^\/ads$/, kind: "read" },
  { method: "GET", pattern: /^\/ads\/[A-Za-z0-9_-]+$/, kind: "read" },
  { method: "GET", pattern: /^\/ad_account\/insights$/, kind: "read" },
  { method: "GET", pattern: /^\/campaigns\/[A-Za-z0-9_-]+\/insights$/, kind: "read" },
  { method: "GET", pattern: /^\/ad_groups\/[A-Za-z0-9_-]+\/insights$/, kind: "read" },
  { method: "GET", pattern: /^\/ads\/[A-Za-z0-9_-]+\/insights$/, kind: "read" },
  { method: "GET", pattern: /^\/custom_audiences$/, kind: "read" },
  { method: "POST", pattern: /^\/conversions\/insights$/, kind: "read_post" },
  { method: "POST", pattern: /^\/campaigns$/, kind: "staff_write" },
  { method: "POST", pattern: /^\/ad_groups$/, kind: "staff_write" },
  { method: "POST", pattern: /^\/ads$/, kind: "staff_write" },
  { method: "POST", pattern: /^\/campaigns\/[A-Za-z0-9_-]+\/activate$/, kind: "staff_write" },
  { method: "POST", pattern: /^\/ad_groups\/[A-Za-z0-9_-]+\/activate$/, kind: "staff_write" },
  { method: "POST", pattern: /^\/ads\/[A-Za-z0-9_-]+\/activate$/, kind: "staff_write" },
];

export class ChatgptAdsNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatgptAdsNotAllowedError";
  }
}

export class ChatgptAdsRequestError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "ChatgptAdsRequestError";
    this.status = status;
  }
}

export function redactAdsSecrets(value: string, secrets: string[] = []) {
  let redacted = value.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  for (const secret of secrets) {
    const trimmed = secret.trim();
    if (trimmed.length >= 6) redacted = redacted.split(trimmed).join("[redacted]");
  }
  return redacted;
}

export function chatgptAdsMode(env: Env = process.env, requested?: "mock" | "live"): "mock" | "live" {
  if (demoForcesMock()) return "mock";
  if (requested) return requested;
  return (env.CHATGPT_ADS_MODE || "").trim().toLowerCase() === "live" ? "live" : "mock";
}

function matchRule(method: string, path: string) {
  const verb = method.toUpperCase();
  return CHATGPT_ADS_ALLOWLIST.find((rule) => rule.method === verb && rule.pattern.test(path)) ?? null;
}

export function classifyChatgptAdsRequest(method: string, rawUrl: string): ChatgptAdsKind | "blocked" {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return "blocked";
  }
  if (url.protocol !== "https:" || url.hostname !== "api.ads.openai.com") return "blocked";
  if (url.username || url.password || url.port) return "blocked";
  if (!url.pathname.startsWith("/v1/")) return "blocked";
  const path = url.pathname.slice("/v1".length);
  if (path.includes("..") || path.includes("//")) return "blocked";
  return matchRule(method, path)?.kind ?? "blocked";
}

function resolveTarget(method: string, path: string, query?: Record<string, string | string[] | number | undefined>) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (!normalized.startsWith("/") || normalized.includes("..") || normalized.includes("//")) {
    throw new ChatgptAdsNotAllowedError("That ChatGPT Ads path is not allowed.");
  }
  const rule = matchRule(method, normalized);
  if (!rule) throw new ChatgptAdsNotAllowedError(`That ChatGPT Ads call is not allowed (${method.toUpperCase()} ${normalized}).`);
  const url = new URL(`${CHATGPT_ADS_ORIGIN}/v1${normalized}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value == null || value === "") continue;
    const items = Array.isArray(value) ? value : [String(value)];
    for (const item of items) url.searchParams.append(key, item);
  }
  if (classifyChatgptAdsRequest(rule.method, url.toString()) === "blocked") {
    throw new ChatgptAdsNotAllowedError("That ChatGPT Ads call is not allowed.");
  }
  return { method: rule.method, path: normalized, url: url.toString(), kind: rule.kind };
}

export type ChatgptAdsCapture = { method: string; path: string; body: unknown };

export type ChatgptAdsCall = {
  method: string;
  path: string;
  query?: Record<string, string | string[] | number | undefined>;
  body?: unknown;
  apiKey: string;
  actor?: "bot" | "staff";
  staffGrant?: symbol;
  mode?: "mock" | "live";
  env?: Env;
  fetchImpl?: FetchLike;
  log?: (line: string) => void;
  capture?: ChatgptAdsCapture[];
};

export type ChatgptAdsResponse = { ok: true; status: number; data: unknown } | { ok: false; status: number; message: string };

/** Performs one allowlisted call. Mock mode does not touch the network. */
export async function chatgptAdsRequest(input: ChatgptAdsCall): Promise<ChatgptAdsResponse> {
  const mode = chatgptAdsMode(input.env ?? process.env, input.mode);
  const target = resolveTarget(input.method, input.path, input.query);
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new ChatgptAdsRequestError("ChatGPT Ads key is missing.");
  const secrets = [apiKey];
  const wire: AdBudgetWrite = {
    method: target.method,
    url: target.url,
    body: input.body,
    params: input.query,
    staffGrant: target.kind === "staff_write" ? input.staffGrant : undefined,
  };
  if (target.kind === "staff_write") assertStaffChatgptWrite(wire);
  assertNoAdBudgetWrite(wire);
  input.capture?.push({ method: target.method, path: target.path, body: input.body ?? null });
  input.log?.(redactAdsSecrets(`${target.method} ${target.path}`, secrets));
  if (mode !== "live") {
    return { ok: true, status: 200, data: mockChatgptAdsResponse(target.method, target.path, input.body) };
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(target.url, {
      method: target.method,
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: "application/json",
        ...(target.method === "POST" ? { "content-type": "application/json" } : {}),
      },
      body: target.method === "POST" ? JSON.stringify(input.body ?? {}) : undefined,
      redirect: "error",
    });
  } catch (error) {
    const message = redactAdsSecrets(error instanceof Error ? error.message : "ChatGPT Ads request failed", secrets);
    throw new ChatgptAdsRequestError(message.slice(0, 400));
  }
  const text = await response.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    const raw = typeof data === "string" ? data : "ChatGPT Ads request failed";
    return { ok: false, status: response.status, message: redactAdsSecrets(raw, secrets).slice(0, 400) };
  }
  return { ok: true, status: response.status, data };
}

import { consentPopupEnabled, type Env } from "./flags";
import { isChoiceAction, isChoiceLevel, type ChoiceAction, type ChoiceLevel } from "./levels";
import { CONSENT_WORDING_VERSION } from "./copy";
import {
  clientKeyIssue,
  matchKeysFromContact,
  normalizePageUrl,
  pageUrlIssue,
  privacyIp,
  summarizeUserAgent,
  visitorIdIssue,
  wordingProof,
  type ContactMatchInput,
} from "./record";

export type EnvMap = Env;

export type ConsentLimiter = {
  allow(key: string, now: number): boolean;
};

export function createConsentLimiter(limit = 120, windowMs = 60_000): ConsentLimiter {
  const buckets = new Map<string, { n: number; at: number }>();
  return {
    allow(key, now) {
      const bucket = buckets.get(key) ?? { n: 0, at: now };
      if (now - bucket.at >= windowMs) {
        bucket.n = 0;
        bucket.at = now;
      }
      if (bucket.n >= limit) {
        buckets.set(key, bucket);
        return false;
      }
      bucket.n += 1;
      buckets.set(key, bucket);
      return true;
    },
  };
}

export const CONSENT_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
};

export type ConsentLog = {
  workspaceId: string;
  clientKey: string;
  visitorId: string;
  deviceId: string;
  contactMatchKey: string;
  matchKeys: string[];
  level: ChoiceLevel;
  action: ChoiceAction;
  wordingVersionId: string;
  wordingHash: string;
  wordingText: string;
  pageUrl: string;
  userAgentSummary: string;
  ipHash: string;
  createdAt: string;
};

export type ConsentResult = {
  status: number;
  body: Record<string, unknown>;
  headers: Record<string, string>;
  record?: ConsentLog;
};

function objectBody(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function clientIp(request: { headers: { get(name: string): string | null } }) {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function handleConsentChoice(input: {
  env: EnvMap;
  now: Date;
  ip: string;
  userAgent: string;
  body: unknown;
  limiter: ConsentLimiter;
  resolveClient: (clientKey: string) => Promise<{ workspaceId: string; clientKey: string } | null>;
}): Promise<ConsentResult> {
  if (!consentPopupEnabled(input.env)) {
    return { status: 404, body: { error: "Not found" }, headers: CONSENT_HEADERS };
  }
  if (!input.limiter.allow(input.ip || "unknown", input.now.getTime())) {
    return { status: 429, body: { error: "Too many requests" }, headers: CONSENT_HEADERS };
  }
  const body = objectBody(input.body);
  if (!body) return { status: 400, body: { error: "Enter a consent choice." }, headers: CONSENT_HEADERS };
  const clientKey = text(body.clientKey);
  if (clientKeyIssue(clientKey)) return { status: 400, body: { error: "Unknown client." }, headers: CONSENT_HEADERS };
  const visitorId = text(body.visitorId);
  if (visitorIdIssue(visitorId)) return { status: 400, body: { error: "A visitor id is required." }, headers: CONSENT_HEADERS };
  const deviceId = text(body.deviceId);
  if (deviceId && visitorIdIssue(deviceId)) return { status: 400, body: { error: "A device id is not valid." }, headers: CONSENT_HEADERS };
  const levelRaw = text(body.level);
  const actionRaw = text(body.action) || "grant";
  if (!isChoiceLevel(levelRaw) || !isChoiceAction(actionRaw)) {
    return { status: 400, body: { error: "Choose low, medium, high, or reject." }, headers: CONSENT_HEADERS };
  }
  if (actionRaw === "withdraw" && levelRaw !== "reject") {
    return { status: 400, body: { error: "Choose low, medium, high, or reject." }, headers: CONSENT_HEADERS };
  }
  if (pageUrlIssue(body.pageUrl)) return { status: 400, body: { error: "Enter a page URL." }, headers: CONSENT_HEADERS };
  const requestedVersion = text(body.wordingVersion);
  if (requestedVersion && requestedVersion !== CONSENT_WORDING_VERSION) {
    return { status: 409, body: { error: "The consent wording changed. Choose again." }, headers: CONSENT_HEADERS };
  }
  const client = await input.resolveClient(clientKey);
  if (!client) return { status: 404, body: { error: "Not found" }, headers: CONSENT_HEADERS };
  const matchInput: ContactMatchInput = {
    email: text(body.email),
    phone: text(body.phone),
    ghlContactId: text(body.ghlContactId),
    gclid: text(body.gclid),
    fbclid: text(body.fbclid),
    gbraid: text(body.gbraid),
    wbraid: text(body.wbraid),
  };
  const matchKeys = matchKeysFromContact(matchInput);
  const proof = wordingProof();
  const level: ChoiceLevel = actionRaw === "withdraw" ? "reject" : levelRaw;
  const record: ConsentLog = {
    workspaceId: client.workspaceId,
    clientKey: client.clientKey,
    visitorId,
    deviceId,
    contactMatchKey: matchKeys[0] || "",
    matchKeys,
    level,
    action: actionRaw,
    wordingVersionId: proof.wordingVersionId,
    wordingHash: proof.wordingHash,
    wordingText: proof.wordingText,
    pageUrl: normalizePageUrl(text(body.pageUrl)),
    userAgentSummary: summarizeUserAgent(input.userAgent),
    ipHash: privacyIp(input.ip),
    createdAt: input.now.toISOString(),
  };
  return {
    status: 200,
    body: { ok: true, level: record.level, wordingVersion: record.wordingVersionId },
    headers: CONSENT_HEADERS,
    record,
  };
}

export async function handleConsentInstall(input: {
  env: EnvMap;
  now: Date;
  ip: string;
  body: unknown;
  limiter: ConsentLimiter;
  resolveClient: (clientKey: string) => Promise<{ workspaceId: string; clientKey: string } | null>;
}): Promise<ConsentResult & { install?: { workspaceId: string; clientKey: string; pageUrl: string; kind: "installed" } }> {
  if (!consentPopupEnabled(input.env)) {
    return { status: 404, body: { error: "Not found" }, headers: CONSENT_HEADERS };
  }
  if (!input.limiter.allow(`install:${input.ip || "unknown"}`, input.now.getTime())) {
    return { status: 429, body: { error: "Too many requests" }, headers: CONSENT_HEADERS };
  }
  const body = objectBody(input.body);
  if (!body) return { status: 400, body: { error: "Unknown client." }, headers: CONSENT_HEADERS };
  const clientKey = text(body.clientKey);
  if (clientKeyIssue(clientKey)) return { status: 400, body: { error: "Unknown client." }, headers: CONSENT_HEADERS };
  if (pageUrlIssue(body.pageUrl)) return { status: 400, body: { error: "Enter a page URL." }, headers: CONSENT_HEADERS };
  const client = await input.resolveClient(clientKey);
  if (!client) return { status: 404, body: { error: "Not found" }, headers: CONSENT_HEADERS };
  return {
    status: 204,
    body: {},
    headers: CONSENT_HEADERS,
    install: {
      workspaceId: client.workspaceId,
      clientKey: client.clientKey,
      pageUrl: normalizePageUrl(text(body.pageUrl)),
      kind: "installed",
    },
  };
}

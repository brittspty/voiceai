import { createHmac, timingSafeEqual } from "crypto";
import type { Env } from "./config";
import { speedToLeadEnabled } from "./config";
import { clampWebhookStamp, readLandingStamp } from "./speed-to-lead";
import { WORKSPACE_ID } from "./types";

export const LANDING_SIGNATURE_HEADER = "x-voiceops-signature";
export const LANDING_WORKSPACE_HEADER = "x-voiceops-workspace";
export const LANDING_RATE_LIMIT = 30;
export const LANDING_RATE_WINDOW_MS = 60_000;

export function signLandingBody(secret: string, workspaceId: string, body: string) {
  return createHmac("sha256", secret).update(`${workspaceId}.${body}`).digest("hex");
}

export function landingSecrets(env: Env = process.env) {
  const secrets: Record<string, string> = {};
  const raw = (env.SPEED_TO_LEAD_WEBHOOK_SECRETS || "").trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof value === "string" && value.trim() && key.trim()) secrets[key.trim()] = value.trim();
        }
      }
    } catch {
      /* A bad map does not unlock the webhook. */
    }
  }
  const single = (env.SPEED_TO_LEAD_WEBHOOK_SECRET || "").trim();
  if (single && !secrets[WORKSPACE_ID]) secrets[WORKSPACE_ID] = single;
  return secrets;
}

function signaturesMatch(supplied: string, expected: string) {
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function verifyLandingSignature(input: { env?: Env; workspaceId: string; body: string; signature: string | null }) {
  const workspaceId = input.workspaceId.trim();
  const signature = (input.signature || "").trim();
  const secret = landingSecrets(input.env)[workspaceId];
  if (!workspaceId || !signature || !secret) return false;
  return signaturesMatch(signature, signLandingBody(secret, workspaceId, input.body));
}

export function takeLandingSlot(ip: string, nowMs: number, state: Map<string, number[]>, limit = LANDING_RATE_LIMIT, windowMs = LANDING_RATE_WINDOW_MS) {
  const recent = (state.get(ip) || []).filter((at) => nowMs - at < windowMs);
  if (recent.length >= limit) {
    state.set(ip, recent);
    return false;
  }
  recent.push(nowMs);
  state.set(ip, recent);
  return true;
}

export type LandingWrite =
  | { action: "reject"; status: 404 | 401 | 413 | 400 | 429; error: string }
  | { action: "landing"; workspaceId: string; sessionKey: string; landedAt: Date }
  | {
      action: "lead";
      workspaceId: string;
      kind: "form" | "call";
      name: string;
      phone: string;
      email: string;
      sessionKey: string;
      leadSource: string;
      landedAt: Date | null;
      submittedAt: Date | null;
      callStartedAt: Date | null;
      arrivalAt: Date;
    };

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/** Auth, rate limit, and timestamp checks. Unsigned requests never reach storage. */
export function decideLandingWrite(input: {
  env?: Env;
  rawBody: string;
  workspaceId: string | null;
  signature: string | null;
  ip: string;
  now?: Date;
  rateState: Map<string, number[]>;
}): LandingWrite {
  const env = input.env ?? process.env;
  if (!speedToLeadEnabled(env)) return { action: "reject", status: 404, error: "Not found" };
  const now = input.now ?? new Date();
  if (!takeLandingSlot(input.ip || "unknown", now.getTime(), input.rateState)) {
    return { action: "reject", status: 429, error: "Too many requests" };
  }
  const workspaceId = (input.workspaceId || "").trim();
  if (workspaceId !== WORKSPACE_ID || !verifyLandingSignature({ env, workspaceId, body: input.rawBody, signature: input.signature })) {
    return { action: "reject", status: 401, error: "Unauthorized" };
  }
  if (input.rawBody.length > 4000) return { action: "reject", status: 413, error: "Payload is too large" };
  let body: unknown = {};
  try {
    body = input.rawBody ? JSON.parse(input.rawBody) : {};
  } catch {
    return { action: "reject", status: 400, error: "Send JSON" };
  }
  const root = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const landing = readLandingStamp(body, now);
  const kind = text(root.kind) || "landing";
  if (kind === "form" || kind === "call") {
    const submittedAt = kind === "form" ? clampWebhookStamp(root.submittedAt, now) : null;
    const callStartedAt = kind === "call" ? clampWebhookStamp(root.callStartedAt ?? root.startedAt, now) : null;
    return {
      action: "lead",
      workspaceId,
      kind,
      name: text(root.name),
      phone: text(root.phone),
      email: text(root.email),
      sessionKey: landing.sessionKey,
      leadSource: landing.leadSource || (kind === "call" ? "Call" : "Form"),
      landedAt: landing.landedAt,
      submittedAt,
      callStartedAt,
      arrivalAt: now,
    };
  }
  if (!landing.sessionKey) return { action: "reject", status: 400, error: "Add a sessionKey" };
  return {
    action: "landing",
    workspaceId,
    sessionKey: landing.sessionKey,
    landedAt: landing.landedAt ?? now,
  };
}

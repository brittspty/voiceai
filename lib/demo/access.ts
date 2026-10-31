import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { demoAccessSecret } from "./flags";

export const DEMO_COOKIE = "voiceops_demo";
export const DEMO_ROLE = "demo_viewer";

export type DemoCookie = { role: typeof DEMO_ROLE; exp: number };

function sign(body: string, secret: string) {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decode(body: string) {
  return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as unknown;
}

export function secretMatches(provided: string, secret: string) {
  const left = createHash("sha256").update(provided).digest();
  const right = createHash("sha256").update(secret).digest();
  return timingSafeEqual(left, right);
}

export function demoLoginAccepted(provided: string, env: Record<string, string | undefined> = process.env) {
  const secret = demoAccessSecret(env);
  if (!secret || !provided) return false;
  return secretMatches(provided, secret);
}

export function signDemoCookie(exp: number, secret: string): string {
  const body = encode({ kind: "demo-session", role: DEMO_ROLE, exp });
  return `${body}.${sign(body, secret)}`;
}

export function readDemoCookie(token: string | undefined | null, secret: string, now = Math.floor(Date.now() / 1000)): DemoCookie | null {
  if (!token || !secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body, secret);
  const left = Buffer.from(expected);
  const right = Buffer.from(sig);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const json = decode(body) as { kind?: string; role?: string; exp?: number };
    if (json.kind !== "demo-session" || json.role !== DEMO_ROLE || !json.exp || json.exp < now) return null;
    return { role: DEMO_ROLE, exp: json.exp };
  } catch {
    return null;
  }
}

export type DemoGrantRecord = {
  id: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createDemoLinkToken(grantId: string, exp: number, secret: string) {
  const body = encode({ kind: "demo-link", g: grantId, exp });
  return `${body}.${sign(body, secret)}`;
}

export function readDemoLinkToken(token: string, secret: string, now = Math.floor(Date.now() / 1000)): { grantId: string; exp: number } | null {
  if (!token || !secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body, secret);
  const left = Buffer.from(expected);
  const right = Buffer.from(sig);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const json = decode(body) as { kind?: string; g?: string; exp?: number };
    if (json.kind !== "demo-link" || !json.g || !json.exp || json.exp < now) return null;
    return { grantId: json.g, exp: json.exp };
  } catch {
    return null;
  }
}

export function assessDemoGrant(token: string, secret: string, grant: DemoGrantRecord | null, now = new Date()): "ok" | "invalid" {
  const parsed = readDemoLinkToken(token, secret, Math.floor(now.getTime() / 1000));
  if (!parsed || !grant) return "invalid";
  if (grant.id !== parsed.grantId) return "invalid";
  if (grant.tokenHash !== hashToken(token)) return "invalid";
  if (grant.revokedAt) return "invalid";
  if (grant.expiresAt.getTime() <= now.getTime()) return "invalid";
  return "ok";
}

export function newGrantId() {
  return randomBytes(16).toString("hex");
}

export function demoView(value: string | string[] | undefined): "staff" | "client" {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "client" ? "client" : "staff";
}

export function demoWriteStatus(role: string | null | undefined): 403 | null {
  if (role === DEMO_ROLE || role === "viewer" || role === "client_viewer") return 403;
  return null;
}

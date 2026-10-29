import { createHash, randomBytes } from "node:crypto";
import { clientLinksEnabled, type Env } from "./config";
import type { MarketingAccess } from "./access";

export function newShareToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashShareToken(token) };
}

export function hashShareToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type ShareLinkRecord = {
  id: string;
  workspaceId: string;
  tokenHash: string;
  label: string;
  createdById: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

export function shareLinkState(link: ShareLinkRecord | null, now: Date, env: Env = process.env) {
  if (!clientLinksEnabled(env)) return "disabled" as const;
  if (!link) return "missing" as const;
  if (link.revokedAt) return "revoked" as const;
  if (link.expiresAt && link.expiresAt.getTime() <= now.getTime()) return "expired" as const;
  return "ok" as const;
}

export function assertCanCreateShareLink(access: MarketingAccess, workspaceId: string, env: Env = process.env) {
  if (!clientLinksEnabled(env)) throw new Error("Client links are turned off.");
  if (!access.canCreateShareLink) throw new Error("You can't create a client link.");
  if (access.workspaceId !== workspaceId && access.kind !== "super_admin") {
    throw new Error("That client is outside your scope.");
  }
}

export type ClientViewEvent = {
  workspaceId: string;
  viewerUserId: string | null;
  shareLinkId: string | null;
  page: string;
  ip: string;
  userAgent: string;
  viewedAt: Date;
};

export function clientViewEvent(input: {
  workspaceId: string;
  viewerUserId?: string | null;
  shareLinkId?: string | null;
  page: string;
  ip: string;
  userAgent: string;
  viewedAt?: Date;
}): ClientViewEvent {
  const viewerUserId = input.viewerUserId || null;
  const shareLinkId = input.shareLinkId || null;
  if (!viewerUserId && !shareLinkId) throw new Error("A view needs a person or a link.");
  if (!input.page.trim()) throw new Error("A view needs a page.");
  return {
    workspaceId: input.workspaceId,
    viewerUserId,
    shareLinkId,
    page: input.page.trim(),
    ip: input.ip.trim() || "unknown",
    userAgent: input.userAgent.trim() || "unknown",
    viewedAt: input.viewedAt ?? new Date(),
  };
}

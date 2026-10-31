import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { isolatedWhere } from "../marketing/workspace";
import { DEMO_WORKSPACE_ID } from "../demo/isolation";

export const PLAN_CONTACT_HREF = "/contact";
export const PLAN_START_LABEL = "Let's start";
export const PLAN_RENEW_LABEL = "Request a new link";
export const DEFAULT_PLAN_LINK_DAYS = 30;
export const PLAN_CHANNELS = ["Meta", "Google", "TikTok", "StackAdapt", "AIS2L voice"] as const;

export type PlanStatus = "draft" | "preview" | "approved";
export type DashboardSource = "demo" | "baseline";

export type PlanRecord = {
  id: string;
  slug: string;
  clientName: string;
  goals: string;
  channels: string[];
  audiences: string[];
  segments: string[];
  dashboardSource: DashboardSource;
  baselineWorkspaceId: string;
  timeline: string;
  weekly: string;
  ctaLabel: string;
  ctaHref: string;
  showCost: boolean;
  linkDays: number;
  status: PlanStatus;
  approvedById: string | null;
  approvedAt: string | null;
  tokenHash: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
};

export type PlanEditor = {
  role: string;
};

export function canEditPlans(role: string) {
  return role === "super_admin" || role === "account_manager";
}

export function planLinkDays(env: Record<string, string | undefined> = process.env, override?: number) {
  const raw = override ?? Number(env.CLIENT_PLAN_LINK_DAYS ?? DEFAULT_PLAN_LINK_DAYS);
  if (!Number.isFinite(raw)) return DEFAULT_PLAN_LINK_DAYS;
  return Math.min(365, Math.max(1, Math.floor(raw)));
}

export function slugify(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "client";
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createPlanToken(bytes: Buffer = randomBytes(32)) {
  if (bytes.length < 16) throw new Error("token must be at least 128 bits");
  return { token: bytes.toString("hex"), hash: hashToken(bytes.toString("hex")), bits: bytes.length * 8 };
}

export function parsePlanCode(code: string): { slug: string; token: string } | null {
  const match = code.match(/^(.*)-([a-f0-9]{32,})$/);
  if (!match) return null;
  const slug = match[1] || "";
  const token = match[2] || "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  return { slug, token };
}

export function tokensMatch(storedHash: string, token: string) {
  const next = Buffer.from(hashToken(token));
  const prev = Buffer.from(storedHash);
  return next.length === prev.length && timingSafeEqual(next, prev);
}

export function blankPlan(id: string, clientName: string, days = DEFAULT_PLAN_LINK_DAYS): PlanRecord {
  return {
    id,
    slug: slugify(clientName),
    clientName,
    goals: "",
    channels: [],
    audiences: [],
    segments: [],
    dashboardSource: "demo",
    baselineWorkspaceId: "",
    timeline: "",
    weekly: "",
    ctaLabel: PLAN_START_LABEL,
    ctaHref: PLAN_CONTACT_HREF,
    showCost: false,
    linkDays: days,
    status: "draft",
    approvedById: null,
    approvedAt: null,
    tokenHash: null,
    expiresAt: null,
    revokedAt: null,
  };
}

export function validCtaHref(value: string) {
  const raw = value.trim();
  if (raw === PLAN_CONTACT_HREF || raw.startsWith("/contact")) return true;
  if (raw.startsWith("mailto:")) {
    const email = raw.slice("mailto:".length).split("?")[0] || "";
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  }
  try {
    return new URL(raw).protocol === "https:";
  } catch {
    return false;
  }
}

export function cleanChannels(values: readonly string[]) {
  const allowed = new Set<string>(PLAN_CHANNELS);
  return [...new Set(values.map((value) => value.trim()).filter((value) => allowed.has(value)))];
}

export function lines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 40);
}

export function sendToPreview(plan: PlanRecord): PlanRecord {
  if (plan.status !== "draft") throw new Error("Only a draft can be sent to preview");
  return { ...plan, status: "preview" };
}

export function approvePlan(plan: PlanRecord, actorId: string, now: Date, token: { token: string; hash: string }, days = plan.linkDays): { plan: PlanRecord; token: string } {
  if (plan.status !== "preview") throw new Error("Approve the preview first");
  if (!actorId.trim()) throw new Error("An approver is required");
  const linkDays = planLinkDays({}, days);
  const expires = new Date(now.getTime() + linkDays * 24 * 60 * 60 * 1000);
  return {
    token: token.token,
    plan: {
      ...plan,
      status: "approved",
      approvedById: actorId,
      approvedAt: now.toISOString(),
      tokenHash: token.hash,
      expiresAt: expires.toISOString(),
      revokedAt: null,
      linkDays,
    },
  };
}

export function revokePlan(plan: PlanRecord, now: Date): PlanRecord {
  if (plan.status !== "approved") throw new Error("Only an approved plan can be revoked");
  return { ...plan, revokedAt: now.toISOString() };
}

export function sharePath(plan: PlanRecord, token: string | null, now = new Date()) {
  if (plan.status !== "approved" || !token || !plan.tokenHash || !plan.expiresAt) return null;
  if (plan.revokedAt) return null;
  if (new Date(plan.expiresAt).getTime() <= now.getTime()) return null;
  if (!tokensMatch(plan.tokenHash, token)) return null;
  return `/plan/${plan.slug}-${token}`;
}

export type PublicAccess = "ok" | "unknown" | "expired" | "revoked";

export function resolvePublicPlan(plan: PlanRecord | null, token: string, now = new Date()): PublicAccess {
  if (!plan || !plan.tokenHash || !tokensMatch(plan.tokenHash, token)) return "unknown";
  if (plan.status !== "approved") return "unknown";
  if (plan.revokedAt) return "revoked";
  if (!plan.expiresAt || new Date(plan.expiresAt).getTime() <= now.getTime()) return "expired";
  return "ok";
}

export function metricsWhereForPlan(plan: Pick<PlanRecord, "dashboardSource" | "baselineWorkspaceId">) {
  if (plan.dashboardSource === "demo") return isolatedWhere(DEMO_WORKSPACE_ID);
  const id = plan.baselineWorkspaceId.trim();
  if (!id) throw new Error("baseline workspace required");
  if (id === DEMO_WORKSPACE_ID) throw new Error("baseline cannot be the demo workspace");
  return isolatedWhere(id);
}

export function assertOwnBaseline(planWorkspaceId: string, requestedWorkspaceId: string) {
  if (requestedWorkspaceId.trim() !== planWorkspaceId.trim()) throw new Error("workspace mismatch");
  return isolatedWhere(planWorkspaceId.trim());
}

export function metricSelect(showCost: boolean) {
  const base = { impressions: true, clicks: true, platformLeads: true };
  if (!showCost) return base;
  return { ...base, spend: true, conversionValue: true };
}

export type DashboardNumbers = {
  impressions: number;
  clicks: number;
  leads: number;
  spendCents?: number;
  roas?: number;
};

export function dashboardFromMetrics(
  rows: Array<{ impressions: number; clicks: number; leads: number; spendCents?: number; conversionValueCents?: number }>,
  showCost: boolean,
): DashboardNumbers {
  const totals = rows.reduce<{ impressions: number; clicks: number; leads: number; spendCents: number; conversionValueCents: number }>(
    (sum, row) => ({
      impressions: sum.impressions + row.impressions,
      clicks: sum.clicks + row.clicks,
      leads: sum.leads + row.leads,
      spendCents: sum.spendCents + (row.spendCents || 0),
      conversionValueCents: sum.conversionValueCents + (row.conversionValueCents || 0),
    }),
    { impressions: 0, clicks: 0, leads: 0, spendCents: 0, conversionValueCents: 0 },
  );
  if (!showCost) return { impressions: totals.impressions, clicks: totals.clicks, leads: totals.leads };
  const roas = totals.spendCents > 0 ? Math.round((totals.conversionValueCents / totals.spendCents) * 100) / 100 : 0;
  return { impressions: totals.impressions, clicks: totals.clicks, leads: totals.leads, spendCents: totals.spendCents, roas };
}

const COARSE = new Set(["mobile", "tablet", "desktop", "bot", "unknown"]);

export function coarseUserAgent(ua: string) {
  const text = ua.slice(0, 180);
  if (!text.trim() || /@/.test(text)) return "unknown";
  if (/bot|spider|crawl/i.test(text)) return "bot";
  if (/ipad|tablet/i.test(text)) return "tablet";
  if (/mobile|iphone|android/i.test(text)) return "mobile";
  return "desktop";
}

export function planViewRecord(ua: string, now: Date) {
  const userAgentCoarse = coarseUserAgent(ua);
  if (!COARSE.has(userAgentCoarse)) throw new Error("coarse user agent required");
  return { viewedAt: now.toISOString(), userAgentCoarse };
}

export function planAllowsEditor(editor: PlanEditor) {
  if (!canEditPlans(editor.role)) throw new Error("Plans are limited to super admins and account managers");
}

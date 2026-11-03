import type { EntityStatus } from "../types";

/**
 * StackAdapt campaignStatus.state is the high-level state
 * (LIVE, PAUSED, ENDED, DRAFT, PENDING, APPROVED, REJECTED, ERROR).
 * campaignStatus.status is the detail list
 * (CAMPAIGN_PAUSED, CREATIVES_PAUSED, END_DATE_REACHED, DAILY_BUDGET_REACHED, …).
 * A daily cap still belongs to a live campaign. An ended flight does not.
 */
const ACTIVE = new Set([
  "ACTIVE",
  "ENABLED",
  "LIVE",
  "RUNNING",
  "DAILY_BUDGET_REACHED",
  "DAILY_CAP_REACHED",
  "DAILY_BUDGET_CAP_REACHED",
  "CAMPAIGN_GROUP_DAILY_CAP_REACHED",
  "CAMPAIGN_GROUP_DAILY_BUDGET_REACHED",
]);

const PAUSED = new Set([
  "PAUSED",
  "PAUSED_CAMPAIGN",
  "CAMPAIGN_PAUSED",
  "CAMPAIGN_GROUP_PAUSED",
  "LINE_ITEM_PAUSED",
  "CREATIVES_PAUSED",
  "CREATIVE_PAUSED",
  "ADS_PAUSED",
  "AD_PAUSED",
  "DRAFT",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "ERROR",
  "NO_CREATIVES",
  "CREATIVES_PENDING",
  "CREATIVES_REJECTED",
  "ASSETS_REJECTED",
]);

const ARCHIVED = new Set([
  "ARCHIVED",
  "ENDED",
  "END_DATE_REACHED",
  "COMPLETED",
  "COMPLETE",
  "INACTIVE",
  "BUDGET_REACHED",
  "LIFETIME_BUDGET_REACHED",
  "CAMPAIGN_GROUP_BUDGET_REACHED",
  "CAMPAIGN_GROUP_END_DATE_REACHED",
]);

const DELETED = new Set(["DELETED", "REMOVED"]);

export function stackAdaptStatusToken(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function normalize(value: string) {
  return value.trim().toUpperCase().replace(/[\s-]+/g, "_");
}

function collectTokens(value: unknown, into: string[]) {
  if (Array.isArray(value)) {
    for (const item of value) collectTokens(item, into);
    return;
  }
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    collectTokens(row.state, into);
    collectTokens(row.code, into);
    collectTokens(row.status, into);
    return;
  }
  const token = stackAdaptStatusToken(value);
  if (token) into.push(token);
}

export function mapStackAdaptStatus(raw: string): EntityStatus {
  const key = normalize(raw);
  if (!key || key === "UNKNOWN") return "unknown";
  if (ACTIVE.has(key)) return "active";
  if (PAUSED.has(key)) return "paused";
  if (ARCHIVED.has(key)) return "archived";
  if (DELETED.has(key)) return "deleted";
  return "unknown";
}

function pickDetail(details: string[]) {
  const ranked = details.map((value) => ({ value, status: mapStackAdaptStatus(value) }));
  return (
    ranked.find((row) => row.status === "archived") ||
    ranked.find((row) => row.status === "deleted") ||
    ranked.find((row) => row.status === "paused") ||
    ranked.find((row) => row.status === "active") ||
    ranked[0]
  ).value;
}

/** One raw StackAdapt state. The high-level state wins. Details fill in when state is empty. */
export function stackAdaptRawStatus(input: {
  isArchived?: boolean;
  isDraft?: boolean;
  state?: unknown;
  detail?: unknown;
  fallback?: unknown;
}) {
  if (input.isArchived) return "ARCHIVED";
  const state = stackAdaptStatusToken(input.state);
  if (state) return state;
  if (input.isDraft) return "DRAFT";
  const details: string[] = [];
  collectTokens(input.detail, details);
  if (details.length) return pickDetail(details);
  const fallback = stackAdaptStatusToken(input.fallback);
  return fallback || "unknown";
}

/**
 * Stored rows keep their mapped status. Unknown rows are mapped again from statusRaw
 * so an ended or paused StackAdapt state is not left as Other until the next sync.
 */
export function presentedCampaignStatus(platform: string, status: string, statusRaw = ""): EntityStatus {
  if (platform !== "stackadapt") {
    if (status === "active" || status === "paused" || status === "archived" || status === "deleted") return status;
    return "unknown";
  }
  if (status === "active" || status === "paused" || status === "archived" || status === "deleted") return status;
  return mapStackAdaptStatus(statusRaw || status);
}

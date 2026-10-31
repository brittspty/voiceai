import type { ScopeAssignment } from "./access";
import { isSuperAdmin } from "./access";
import { amRealtimeEnabled, type Env } from "./config";
import { fatigueChoice } from "./digest";
import { isolatedWhere } from "./workspace";

export const AM_FEED_KEY = "voiceops:am-feed";

export type FeedKind = "metric_note" | "anomaly" | "opportunity" | "fatigue_decision";

export type FeedDraft = {
  workspaceId: string;
  campaignId: string;
  adAccountId: string;
  kind: FeedKind;
  title: string;
  body: string;
  reason: string;
  decision: "" | "pause" | "rotate";
  sourceId: string;
  recommendationId?: string;
};

export type FeedScope =
  | { kind: "all" }
  | { kind: "assigned"; assignments: ScopeAssignment[] };

export function realtimeDeliveryPlan(env: Env = process.env) {
  if (!amRealtimeEnabled(env)) return { live: false as const, notify: false as const, reason: "AM_REALTIME_FEED is off" };
  return { live: true as const, notify: true as const, channel: AM_FEED_KEY, reason: "live" };
}

export function feedVisible(scope: FeedScope, item: { workspaceId: string; adAccountId: string; campaignId: string }) {
  if (scope.kind === "all") return true;
  return scope.assignments.some((row) => {
    if (row.workspaceId !== item.workspaceId) return false;
    if (row.scopeKind === "client") return true;
    if (row.scopeKind === "ad_account") return Boolean(row.adAccountId) && row.adAccountId === item.adAccountId;
    return Boolean(row.campaignId) && row.campaignId === item.campaignId;
  });
}

/** One isolatedWhere per assigned workspace. Campaign limits stay inside that where. */
export function assignmentWhere(workspaceId: string, assignments: ScopeAssignment[]) {
  const mine = assignments.filter((row) => row.workspaceId === workspaceId);
  if (!mine.length) throw new Error("A workspace is required.");
  if (mine.some((row) => row.scopeKind === "client")) return isolatedWhere(workspaceId);
  const campaignIds = mine.map((row) => row.campaignId).filter((id): id is string => Boolean(id));
  if (mine.every((row) => row.scopeKind === "campaign") && campaignIds.length) {
    return isolatedWhere(workspaceId, { campaignId: { in: campaignIds } });
  }
  const accountIds = mine.map((row) => row.adAccountId).filter((id): id is string => Boolean(id));
  if (accountIds.length) return isolatedWhere(workspaceId, { adAccountId: { in: accountIds } });
  throw new Error("A workspace is required.");
}

export function metricNoteCopy(input: {
  campaignName: string;
  clicks: number;
  leads: number;
  impressions: number;
  previousClicks?: number | null;
}): Pick<FeedDraft, "kind" | "title" | "body" | "reason"> | null {
  const name = input.campaignName.trim() || "This campaign";
  const previous = input.previousClicks;
  if (previous != null && previous > 0) {
    const delta = input.clicks - previous;
    const pct = Math.round((delta / previous) * 100);
    if (pct <= -40) {
      return {
        kind: "anomaly",
        title: `${name} lost clicks`,
        body: `Clicks went from ${previous} to ${input.clicks}.`,
        reason: `Clicks fell about ${Math.abs(pct)} percent from the previous result.`,
      };
    }
    if (pct >= 40 && input.leads > 0) {
      return {
        kind: "opportunity",
        title: `${name} is picking up`,
        body: `Clicks went from ${previous} to ${input.clicks}, with ${input.leads} leads.`,
        reason: `Clicks rose about ${pct} percent and leads are coming in.`,
      };
    }
    if (delta !== 0) {
      return {
        kind: "metric_note",
        title: `${name} results changed`,
        body: `Clicks are ${input.clicks} (was ${previous}). Leads are ${input.leads}.`,
        reason: delta > 0 ? "Clicks are higher than the previous stored result." : "Clicks are lower than the previous stored result.",
      };
    }
  }
  if (input.impressions === 0 && input.clicks === 0 && input.leads === 0) return null;
  return {
    kind: "metric_note",
    title: `${name} latest results`,
    body: `${input.impressions} views, ${input.clicks} clicks, and ${input.leads} leads.`,
    reason: "This is the latest stored result for that campaign.",
  };
}

export function alertFeedCopy(input: { title: string; summary: string; code: string; severity: string }): Pick<FeedDraft, "kind" | "title" | "body" | "reason"> {
  const opportunity = /up|opportunity|improvement|roi_within/i.test(input.code);
  const kind: FeedKind = opportunity ? "opportunity" : input.severity === "info" ? "metric_note" : "anomaly";
  return {
    kind,
    title: input.title,
    body: input.summary,
    reason: input.summary,
  };
}

export function fatigueFeedItem(input: {
  id: string;
  adName: string;
  reasons?: string[];
  severity?: string;
  metric?: string;
  workspaceId: string;
  campaignId: string;
  adAccountId: string;
}): FeedDraft {
  const choice = fatigueChoice(input);
  const name = input.adName.trim() || "This ad";
  return {
    workspaceId: input.workspaceId,
    campaignId: input.campaignId,
    adAccountId: input.adAccountId,
    kind: "fatigue_decision",
    decision: choice.prompt,
    title: choice.prompt === "pause" ? `Pause ${name}?` : `Rotate ${name}?`,
    body: choice.reason,
    reason: choice.reason,
    sourceId: `fatigue:${input.id}`,
    recommendationId: input.id,
  };
}

export type FeedUser = {
  id: string;
  email: string;
  role: string;
  assignments: ScopeAssignment[];
};

/** Super admins see every event. Account managers see assigned campaigns and clients only. */
export function feedRecipients(event: { workspaceId: string; campaignId: string; adAccountId: string }, users: FeedUser[], env: Env = process.env) {
  const ids: string[] = [];
  for (const user of users) {
    if (isSuperAdmin(user, env)) {
      ids.push(user.id);
      continue;
    }
    if (user.role !== "account_manager") continue;
    if (feedVisible({ kind: "assigned", assignments: user.assignments }, event)) ids.push(user.id);
  }
  return [...new Set(ids)];
}

export function unreadBadge(count: number) {
  if (count <= 0) return "";
  if (count > 9) return "9+";
  return String(count);
}

export function feedSseChunk(event: { id: string; title: string; kind: string }) {
  return `event: feed\ndata: ${JSON.stringify({ id: event.id, title: event.title, kind: event.kind })}\n\n`;
}

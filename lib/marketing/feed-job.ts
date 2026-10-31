import { prisma } from "../db";
import { redisPushTrim } from "../redis";
import { amRealtimeEnabled } from "./config";
import {
  AM_FEED_KEY,
  alertFeedCopy,
  assignmentWhere,
  fatigueFeedItem,
  feedRecipients,
  feedVisible,
  metricNoteCopy,
  realtimeDeliveryPlan,
  type FeedDraft,
  type FeedScope,
  type FeedUser,
} from "./feed";
import { isolatedWhere } from "./workspace";
import { WORKSPACE_ID } from "./types";

function reasonsOf(evidence: unknown) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return [] as string[];
  const reasons = (evidence as { reasons?: unknown }).reasons;
  return Array.isArray(reasons) ? reasons.filter((reason): reason is string => typeof reason === "string") : [];
}

function severityOf(evidence: unknown) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return "";
  const severity = (evidence as { severity?: unknown }).severity;
  return typeof severity === "string" ? severity : "";
}

function isUnique(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002");
}

export async function runAmRealtimeFeed(now = new Date()) {
  const plan = realtimeDeliveryPlan();
  if (!plan.live) return { status: "skipped" as const, reason: plan.reason };
  const workspaces = await prisma.workspace.findMany({ select: { id: true } });
  const ids = workspaces.length ? workspaces.map((row) => row.id) : [WORKSPACE_ID];
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const drafts: FeedDraft[] = [];
  for (const id of ids) {
    const where = isolatedWhere(id);
    const [alerts, fatigue, metrics] = await Promise.all([
      prisma.adAlert.findMany({ where: { ...where, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 40 }),
      prisma.recommendation.findMany({
        where: { ...where, type: "creative_fatigue", status: "verified", decidedAt: null },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      prisma.dailyMetric.findMany({
        where: { ...where, campaignId: { not: null } },
        orderBy: { date: "desc" },
        take: 80,
        select: {
          campaignId: true,
          date: true,
          impressions: true,
          clicks: true,
          platformLeads: true,
          campaign: { select: { name: true, adAccountId: true } },
        },
      }),
    ]);
    for (const alert of alerts) {
      const copy = alertFeedCopy(alert);
      drafts.push({
        workspaceId: alert.workspaceId,
        campaignId: alert.campaignId,
        adAccountId: alert.adAccountId,
        ...copy,
        decision: "",
        sourceId: `alert:${alert.id}`,
      });
    }
    for (const rec of fatigue) {
      drafts.push(fatigueFeedItem({
        id: rec.id,
        adName: rec.title,
        reasons: reasonsOf(rec.evidence),
        severity: severityOf(rec.evidence),
        metric: rec.metric,
        workspaceId: rec.workspaceId,
        campaignId: rec.campaignId || "",
        adAccountId: rec.adAccountId || "",
      }));
    }
    const byCampaign = new Map<string, typeof metrics>();
    for (const row of metrics) {
      if (!row.campaignId) continue;
      const bucket = byCampaign.get(row.campaignId) ?? [];
      bucket.push(row);
      byCampaign.set(row.campaignId, bucket);
    }
    for (const [campaignId, rows] of byCampaign) {
      const latest = rows[0];
      const previous = rows[1];
      if (!latest) continue;
      const copy = metricNoteCopy({
        campaignName: latest.campaign?.name || "This campaign",
        clicks: Number(latest.clicks ?? 0),
        leads: Number(latest.platformLeads ?? 0),
        impressions: Number(latest.impressions ?? 0),
        previousClicks: previous ? Number(previous.clicks ?? 0) : null,
      });
      if (!copy) continue;
      const day = latest.date.toISOString().slice(0, 10);
      drafts.push({
        workspaceId: id,
        campaignId,
        adAccountId: latest.campaign?.adAccountId || "",
        ...copy,
        decision: "",
        sourceId: `metric:${id}:${campaignId}:${day}`,
      });
    }
  }
  const written = await publishFeedDrafts(drafts);
  return { status: "ran" as const, written };
}

export async function publishFeedDrafts(drafts: FeedDraft[]) {
  if (!amRealtimeEnabled()) return 0;
  const users = await prisma.user.findMany({
    where: { role: { in: ["account_manager", "super_admin", "owner", "admin", "viewer"] } },
    include: { marketingScopes: true },
  });
  const feedUsers: FeedUser[] = users.map((user) => ({
    id: user.id,
    email: user.email,
    role: user.role,
    assignments: user.marketingScopes.map((row) => ({
      workspaceId: row.workspaceId,
      scopeKind: row.scopeKind,
      adAccountId: row.adAccountId,
      campaignId: row.campaignId,
    })),
  }));
  let written = 0;
  for (const draft of drafts) {
    try {
      const saved = await prisma.amFeedEvent.create({
        data: {
          workspaceId: draft.workspaceId,
          campaignId: draft.campaignId,
          adAccountId: draft.adAccountId,
          kind: draft.kind,
          title: draft.title,
          body: draft.body,
          reason: draft.reason,
          decision: draft.decision,
          sourceId: draft.sourceId,
        },
      });
      const recipients = feedRecipients(draft, feedUsers);
      if (recipients.length) {
        await prisma.staffNotification.createMany({
          data: recipients.map((userId) => ({
            userId,
            kind: draft.kind,
            title: draft.title,
            body: draft.reason ? `${draft.body} ${draft.reason}` : draft.body,
            href: "/marketing",
            payload: {
              sourceId: draft.sourceId,
              recommendationId: draft.recommendationId || "",
              decision: draft.decision,
              workspaceId: draft.workspaceId,
              campaignId: draft.campaignId,
              adAccountId: draft.adAccountId,
            },
          })),
        });
      }
      await redisPushTrim(AM_FEED_KEY, saved.id);
      written += 1;
    } catch (error) {
      if (isUnique(error)) continue;
      throw error;
    }
  }
  return written;
}

export function feedScopeFor(input: { kind: string; assignments: FeedUser["assignments"] }): FeedScope {
  if (input.kind === "super_admin") return { kind: "all" };
  return { kind: "assigned", assignments: input.assignments };
}

export async function loadFeedForAccess(input: {
  kind: string;
  assignments: FeedUser["assignments"];
  since?: Date | null;
  limit?: number;
}) {
  if (!amRealtimeEnabled()) return [];
  const scope = feedScopeFor(input);
  const since = input.since ?? null;
  const limit = input.limit ?? 30;
  if (scope.kind === "all") {
    const workspaces = await prisma.workspace.findMany({ select: { id: true } });
    const ids = workspaces.length ? workspaces.map((row) => row.id) : [WORKSPACE_ID];
    const batches = await Promise.all(ids.map((id) => prisma.amFeedEvent.findMany({
      where: { ...isolatedWhere(id), ...(since ? { createdAt: { gt: since } } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
    })));
    return batches.flat().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
  }
  const workspaceIds = [...new Set(scope.assignments.map((row) => row.workspaceId))];
  if (!workspaceIds.length) return [];
  const batches = await Promise.all(workspaceIds.map(async (workspaceId) => {
    let where: ReturnType<typeof assignmentWhere>;
    try {
      where = assignmentWhere(workspaceId, scope.assignments);
    } catch {
      return [];
    }
    const rows = await prisma.amFeedEvent.findMany({
      where: { ...where, ...(since ? { createdAt: { gt: since } } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.filter((row) => feedVisible(scope, row));
  }));
  return batches.flat().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
}

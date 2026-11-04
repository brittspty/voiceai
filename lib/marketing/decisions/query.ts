import { prisma } from "../../db";
import type { SP } from "../../params";
import { zonedISODate } from "../../time";
import { canApproveMarketing, canSwitchMarketingClient, type MarketingAccess } from "../access";
import { parseRealViewQuery, realClientId, realDateWindow, type RealStatus } from "../real-view";
import { WORKSPACE_ID } from "../types";
import { stepsFor } from "./workflow";
import { filterDecisionRows, groupDecisions, presentDecisions, type DecisionCard } from "./present";
import type { DashWindow } from "../dashboard-model";

function iso(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function evidenceRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export type DecisionListModel = {
  days: DashWindow;
  status: RealStatus;
  clientId: string | null;
  clientName: string;
  hasLeadValue: boolean;
  seesCost: boolean;
  canAct: boolean;
  groups: ReturnType<typeof groupDecisions>;
};

function toCard(row: {
  id: string;
  type: string;
  rule: string;
  status: string;
  severity: string;
  clientId: string | null;
  title: string;
  summary: string;
  rationale: string;
  metric: string;
  baseline: string;
  observed: string;
  windowStart: Date | null;
  windowEnd: Date | null;
  sampleSize: number;
  sourceMetricIds: string[];
  evidence: unknown;
  lastSeenAt: Date | null;
  createdAt: Date;
  snoozedUntil: Date | null;
  archivedAt: Date | null;
  campaignId: string | null;
  campaign: { name: string; status: string; clientId: string | null; client: { name: string } | null } | null;
  client: { id: string; name: string } | null;
}): DecisionCard {
  const evidence = evidenceRecord(row.evidence);
  const clientId = row.clientId || row.client?.id || row.campaign?.clientId || "";
  return {
    id: row.id,
    type: row.type,
    rule: row.rule || (typeof evidence.rule === "string" ? evidence.rule : row.metric),
    status: row.status,
    severity: row.severity || "warning",
    clientId,
    clientName: row.client?.name || row.campaign?.client?.name || "Unassigned",
    campaignId: row.campaignId,
    campaignName: row.campaign?.name || "",
    campaignStatus: row.campaign?.status || "",
    title: row.title,
    summary: row.summary,
    rationale: row.rationale,
    metric: row.metric,
    baseline: row.baseline,
    observed: row.observed,
    windowStart: iso(row.windowStart),
    windowEnd: iso(row.windowEnd),
    sampleSize: row.sampleSize,
    sourceMetricIds: row.sourceMetricIds,
    evidence,
    recency: (row.lastSeenAt ?? row.createdAt).toISOString(),
    snoozedUntil: iso(row.snoozedUntil) || null,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    steps: stepsFor(row.rule || row.type, evidence),
  };
}

const include = {
  campaign: { select: { name: true, status: true, clientId: true, client: { select: { name: true } } } },
  client: { select: { id: true, name: true } },
} as const;

export async function loadDecisionList(access: MarketingAccess, source: SP, now = new Date()): Promise<DecisionListModel> {
  const { days, status } = parseRealViewQuery(source, true);
  const requested = typeof source.client === "string" ? source.client : Array.isArray(source.client) ? source.client[0] || "" : "";
  const [clients, org, settings] = await Promise.all([
    prisma.marketingClient.findMany({ where: { workspaceId: WORKSPACE_ID }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.org.findUnique({ where: { id: "org" }, select: { timezone: true } }),
    prisma.clientSettings.findUnique({ where: { workspaceId: WORKSPACE_ID }, select: { leadValueCents: true } }),
  ]);
  const clientId = realClientId({
    enabled: true,
    staff: canSwitchMarketingClient(access),
    requestedId: requested || null,
    knownIds: clients.map((client) => client.id),
  });
  const end = zonedISODate(now, org?.timezone || "America/New_York");
  const dates = realDateWindow(end, days);
  const rows = await prisma.recommendation.findMany({
    where: {
      AND: [
        { workspaceId: WORKSPACE_ID, archivedAt: null, status: { in: ["draft", "verified"] } },
        { OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] },
        ...(clientId ? [{ OR: [{ clientId }, { clientId: null, campaign: { clientId } }] }] : []),
      ],
    },
    include,
    orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
  });
  const cards = rows.map(toCard);
  const filtered = filterDecisionRows(cards, { clientId, dates, status, now: end });
  const visible = presentDecisions(filtered, {
    seesCost: access.seesCost,
    hasLeadValue: (settings?.leadValueCents ?? 0) > 0,
  });
  const chosen = clients.find((client) => client.id === clientId);
  return {
    days,
    status,
    clientId,
    clientName: chosen?.name || "All clients",
    hasLeadValue: (settings?.leadValueCents ?? 0) > 0,
    seesCost: access.seesCost,
    canAct: canApproveMarketing(access),
    groups: groupDecisions(visible),
  };
}

export async function loadDecisionDetail(id: string, access: MarketingAccess) {
  const row = await prisma.recommendation.findFirst({
    where: { id, workspaceId: WORKSPACE_ID, archivedAt: null },
    include: {
      ...include,
      audits: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } },
    },
  });
  if (!row) return null;
  const settings = await prisma.clientSettings.findUnique({ where: { workspaceId: WORKSPACE_ID }, select: { leadValueCents: true } });
  const hasLeadValue = (settings?.leadValueCents ?? 0) > 0;
  const [shown] = presentDecisions([toCard(row)], { seesCost: access.seesCost, hasLeadValue });
  if (!shown) return { hidden: true as const };
  return {
    hidden: false as const,
    card: shown,
    canAct: canApproveMarketing(access) && (row.status === "draft" || row.status === "verified"),
    audits: row.audits.map((audit) => ({
      id: audit.id,
      action: audit.action,
      reason: audit.reason,
      note: audit.note,
      snoozeUntil: iso(audit.snoozeUntil),
      who: audit.user.name,
      at: audit.createdAt.toISOString(),
    })),
  };
}

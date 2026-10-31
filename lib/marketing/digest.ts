import type { ScopeAssignment } from "./access";
import { digestDeliveryEnabled, digestEnabled, digestSendEnabled, type Env } from "./config";
import { WORKSPACE_ID } from "./types";

export type DigestItem = {
  id: string;
  title: string;
  summary: string;
  accountId: string;
  campaignId?: string;
  workspaceId?: string;
  workspace?: boolean;
};

export type DigestDecision = DigestItem & {
  prompt: "pause" | "rotate";
  reason: string;
  assigneeId?: string;
};

export type DigestPayload = {
  alerts: DigestItem[];
  recommendations: DigestItem[];
  notes?: string[];
  decisions?: DigestDecision[];
};

export type DigestDraft = {
  userId: string;
  periodStart: Date;
  periodEnd: Date;
  payload: DigestPayload;
  delivery: "not_sent" | "queued";
};

/** Stored in the app. Email goes out only when MARKETING_DIGEST_SEND is on. */
export function digestDeliveryPlan(env: Env = process.env) {
  if (!digestEnabled(env)) return { send: false as const, reason: "digests are turned off" };
  if (digestSendEnabled(env)) return { send: true as const, reason: "hourly summary is saved and emailed" };
  if (!digestDeliveryEnabled(env)) return { send: false as const, reason: "delivery is turned off" };
  return { send: false as const, reason: "delivery is not built in this version" };
}

export function fatigueChoice(input: { reasons?: string[]; severity?: string; metric?: string }): { prompt: "pause" | "rotate"; reason: string } {
  const reasons = input.reasons ?? [];
  const severeFrequency = input.severity === "critical" && (reasons.includes("frequency") || input.metric === "frequency");
  if (severeFrequency) {
    return {
      prompt: "pause",
      reason: "People are seeing this ad too often, and clicks are falling. Pause it until a new version is ready.",
    };
  }
  const bits: string[] = [];
  if (reasons.includes("frequency")) bits.push("people are seeing it too often");
  if (reasons.includes("ctr_decay")) bits.push("clicks are falling");
  if (reasons.includes("cpa_rise")) bits.push("each result is getting harder to get");
  const why = bits.length ? bits.join(", and ") : "results are slipping";
  return {
    prompt: "rotate",
    reason: `This ad looks tired because ${why}. Rotate in a new version.`,
  };
}

function itemWorkspace(item: DigestItem) {
  return item.workspaceId || (item.workspace ? WORKSPACE_ID : "");
}

/** An account manager only sees campaigns and clients on their assignments. */
export function digestItemAllowed(assignments: ScopeAssignment[], item: DigestItem) {
  if (!assignments.length) return false;
  const workspaceId = itemWorkspace(item);
  if (item.workspace) return assignments.some((row) => row.workspaceId === (workspaceId || WORKSPACE_ID));
  return assignments.some((row) => {
    const itemWorkspaceId = workspaceId || WORKSPACE_ID;
    if (row.workspaceId !== itemWorkspaceId) return false;
    if (row.scopeKind === "client") return true;
    if (row.scopeKind === "ad_account") return Boolean(row.adAccountId) && row.adAccountId === item.accountId;
    if (row.scopeKind === "campaign") {
      if (item.campaignId) return row.campaignId === item.campaignId;
      return Boolean(row.adAccountId) && row.adAccountId === item.accountId;
    }
    return false;
  });
}

function allowedByAccount(item: DigestItem, accountIds: "all" | string[]) {
  return item.workspace === true || accountIds === "all" || accountIds.includes(item.accountId);
}

function decisionVisible(
  input: { userId: string; assignments?: ScopeAssignment[]; accountIds: "all" | string[]; seesAllDecisions?: boolean },
  item: DigestDecision,
) {
  if (item.assigneeId && !input.seesAllDecisions && item.assigneeId !== input.userId) return false;
  if (input.seesAllDecisions) return true;
  if (item.assigneeId && !item.workspaceId && !item.campaignId) return true;
  if (input.assignments) return digestItemAllowed(input.assignments, item);
  return allowedByAccount(item, input.accountIds);
}

export function buildManagerDigest(input: {
  userId: string;
  accountIds: "all" | string[];
  alerts: DigestItem[];
  recommendations: DigestItem[];
  decisions?: DigestDecision[];
  assignments?: ScopeAssignment[];
  periodStart: Date;
  periodEnd: Date;
  notes?: string[];
  seesAllDecisions?: boolean;
  env?: Env;
}): DigestDraft | null {
  const env = input.env ?? process.env;
  if (!digestEnabled(env)) return null;
  const allowed = (item: DigestItem) =>
    input.assignments ? digestItemAllowed(input.assignments, item) : allowedByAccount(item, input.accountIds);
  const alerts = input.alerts.filter(allowed);
  const recommendations = input.recommendations.filter(allowed);
  const decisions = (input.decisions ?? []).filter((item) => decisionVisible(input, item));
  const notes = (input.notes ?? []).map((note) => note.trim()).filter(Boolean);
  if (!alerts.length && !recommendations.length && !notes.length && !decisions.length) return null;
  const plan = digestDeliveryPlan(env);
  const payload: DigestPayload = { alerts, recommendations };
  if (notes.length) payload.notes = notes;
  if (decisions.length) payload.decisions = decisions;
  return {
    userId: input.userId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    payload,
    delivery: plan.send ? "queued" : "not_sent",
  };
}

import { creditWindowLabel, type CreditWindow } from "./dedupe";

export const CREATIVE_APPROVALS_DEFAULT = false;

export type FatigueKind = "fatigue_pause" | "fatigue_rotation";
export type ServeAction = "serve" | "pause" | "rotate";

export type DecisionKind =
  | "budget_recommendation"
  | "pacing_recommendation"
  | FatigueKind
  | "creative_approval"
  | "lead_check"
  | "page_alert"
  | "negative_keyword"
  | "holdout"
  | "learning";

export type InboxCard = {
  id: string;
  kind: DecisionKind;
  status: "waiting" | "accepted" | "declined" | "later" | "done";
  tier: "staff" | "client" | "low";
  title: string;
  reasoning: string;
  clientName: string;
  assigneeId: string | null;
  campaignId: string | null;
  adAccountId: string | null;
  confidence: number;
  serve: ServeAction | null;
  creditWindowLabel: string;
  automatic: false;
  steps: string[];
};

export type RouteAssignment = {
  userId: string;
  role: string;
  scopeKind: "client" | "ad_account" | "campaign";
  campaignId: string | null;
  adAccountId: string | null;
};

export type RoutedFatigue = {
  kind: FatigueKind;
  assigneeId: string | null;
  reasoning: string;
  campaignId: string;
  adAccountId: string;
  confidence: number;
  serve: ServeAction;
  creditWindowLabel: string;
  automatic: false;
  executes: false;
  audience: "account_manager";
  superAdminsSeeAll: true;
};

export type DecisionViewer = {
  userId: string;
  kind: "super_admin" | "account_manager" | "all_clients_viewer" | "staff" | "client_owner" | "client_viewer" | "none";
  seesCost: boolean;
  creativeApprovalsEnabled: boolean;
};

/** Pauses and rotations are recommendations. Nothing here changes an ad. */
export function routeFatigueDecision(input: {
  kind: FatigueKind;
  campaignId: string;
  adAccountId: string;
  reasoning: string;
  assignments: RouteAssignment[];
  confidence: number;
  serve: ServeAction;
  credit?: CreditWindow & { learnedClickDays?: number | null; learnedViewDays?: number | null };
}): RoutedFatigue {
  const reasoning = input.reasoning.trim();
  if (!reasoning) throw new Error("Plain-language reasoning is required.");
  const managers = input.assignments.filter((row) => row.role === "account_manager");
  const assignee =
    managers.find((row) => row.scopeKind === "campaign" && row.campaignId === input.campaignId) ??
    managers.find((row) => row.scopeKind === "ad_account" && row.adAccountId === input.adAccountId) ??
    managers.find((row) => row.scopeKind === "client") ??
    null;
  const credit = input.credit ?? { clickDays: 7, viewDays: 1 };
  return {
    kind: input.kind,
    assigneeId: assignee?.userId ?? null,
    reasoning,
    campaignId: input.campaignId,
    adAccountId: input.adAccountId,
    confidence: input.confidence,
    serve: input.serve,
    creditWindowLabel: creditWindowLabel(credit),
    automatic: false,
    executes: false,
    audience: "account_manager",
    superAdminsSeeAll: true,
  };
}

export function clientSeesCreativeApprovals(enabled: boolean | null | undefined) {
  return enabled === true;
}

function seesFatigueOrBudget(card: InboxCard, viewer: DecisionViewer) {
  if (card.kind === "fatigue_pause" || card.kind === "fatigue_rotation") {
    if (viewer.kind === "all_clients_viewer") return false;
    if (viewer.kind === "super_admin") return true;
    if (viewer.kind === "account_manager") return card.assigneeId === viewer.userId;
    return false;
  }
  if (card.kind === "budget_recommendation" || card.kind === "pacing_recommendation") {
    if (viewer.kind === "all_clients_viewer") return false;
    return viewer.seesCost && (viewer.kind === "super_admin" || viewer.kind === "account_manager" || viewer.kind === "staff");
  }
  return null;
}

export function seesInboxCard(card: InboxCard, viewer: DecisionViewer) {
  if (viewer.kind === "none") return false;
  const restricted = seesFatigueOrBudget(card, viewer);
  if (restricted !== null) return restricted;
  if (card.kind === "creative_approval") {
    if (viewer.kind === "client_owner" || viewer.kind === "client_viewer") return clientSeesCreativeApprovals(viewer.creativeApprovalsEnabled);
    return viewer.kind === "super_admin" || viewer.kind === "account_manager";
  }
  if (card.kind === "lead_check") return viewer.kind === "client_owner" || viewer.kind === "client_viewer" || viewer.kind === "super_admin" || viewer.kind === "account_manager";
  if (viewer.kind === "client_owner" || viewer.kind === "client_viewer") {
    return card.tier === "client";
  }
  if (viewer.kind === "account_manager") return card.assigneeId == null || card.assigneeId === viewer.userId;
  return viewer.kind === "super_admin" || viewer.kind === "staff";
}

export type DecisionAnswer = "yes" | "no" | "later" | "made_change";

/** Records the tap. It does not pause, rotate, or write a budget. */
export function answerDecision(card: InboxCard, answer: DecisionAnswer): { status: InboxCard["status"]; executes: false; writePath: null; note: string } {
  if (card.automatic) throw new Error("Fatigue decisions are never automatic.");
  const note =
    answer === "made_change"
      ? "You make the change. The budget was not edited here."
      : answer === "yes"
        ? "Yes. Nothing runs on its own."
        : answer === "no"
          ? "No. The ad stays as it is."
          : "Later.";
  const status = answer === "no" ? "declined" : answer === "later" ? "later" : answer === "made_change" ? "done" : "accepted";
  return { status, executes: false, writePath: null, note };
}

export function budgetWritePath(): null {
  return null;
}

export function autoPauseState() {
  return { state: "pending_approval" as const, copy: "Auto-pause pending approval. Pause by hand for now." };
}

export type ServeChip = {
  action: ServeAction;
  reason: string;
  confidence: number;
  confidenceLabel: string;
  creditWindowLabel: string;
  decisionId: string;
  executes: false;
  routesTo: "account_manager";
};

export function serveChip(input: { action: ServeAction; reason: string; confidence: number; creditWindowLabel: string; decisionId: string }): ServeChip {
  const band = input.confidence >= 80 ? "High" : input.confidence >= 60 ? "Medium" : "Low";
  return {
    action: input.action,
    reason: input.reason.trim(),
    confidence: input.confidence,
    confidenceLabel: `${band} confidence ${input.confidence}%`,
    creditWindowLabel: input.creditWindowLabel,
    decisionId: input.decisionId,
    executes: false,
    routesTo: "account_manager",
  };
}

export type DigestDecision = {
  id: string;
  title: string;
  reasoning: string;
  kind: FatigueKind;
  assigneeId: string;
  accountId: string;
};

/** Hourly summary lines for the assigned account manager. Super admins pass seesAll. */
export function fatigueDigestItems(cards: DigestDecision[], viewer: { userId: string; seesAll: boolean }) {
  return cards
    .filter((card) => viewer.seesAll || card.assigneeId === viewer.userId)
    .map((card) => ({
      id: card.id,
      title: card.title,
      reasoning: card.reasoning,
      kind: card.kind,
      summary: card.reasoning,
    }));
}

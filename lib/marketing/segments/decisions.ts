import type { MarketingAccess } from "../access";
import type { BudgetStore } from "../budget";
import { decideRecommendation, type RecommendationDecision } from "../recommendations";

export const SEGMENT_UNDO_MS = 30_000;

export type SegmentDecisionType = "segment_scale" | "segment_test" | "segment_cut";

export function segmentManualSteps(type: SegmentDecisionType, list: { vendor: string; listId: string }) {
  if (type === "segment_scale") {
    return [
      `In the ad account, point the audience at ${list.vendor} list ${list.listId}.`,
      "Leave the campaign amount where a person set it.",
      "Come back and mark that you did this by hand.",
    ];
  }
  if (type === "segment_cut") {
    return [
      `In the ad account, pause ${list.vendor} list ${list.listId}.`,
      "Do not move money between campaigns.",
      "Come back and mark that you did this by hand.",
    ];
  }
  return [
    `Keep comparing ${list.vendor} list ${list.listId} with the current best list.`,
    "Nothing runs until a person sets it up by hand.",
  ];
}

/**
 * Yes logs the decision and returns the manual steps.
 * The ad account is not written. The budget store is not written.
 */
export async function applySegmentAnswer(input: {
  actor: { kind: string; access?: MarketingAccess };
  card: { id: string; type: SegmentDecisionType; status: string; vendor: string; listId: string };
  decision: RecommendationDecision;
  budgetStore: BudgetStore;
  now?: number;
}) {
  const result = await decideRecommendation({
    actor: input.actor,
    recommendation: {
      id: input.card.id,
      type: input.card.type,
      status: input.card.status,
      campaignId: null,
      adAccountId: null,
      proposedBudgetAmount: null,
      proposedBudgetPeriod: null,
      proposedCurrency: null,
    },
    decision: input.decision,
    budgetStore: input.budgetStore,
  });
  if (result.budgetWrite !== "none") throw new Error("Segment decisions never write a budget.");
  return {
    status: result.status,
    budgetWrite: "none" as const,
    adAccountWrite: false as const,
    executes: false as const,
    writesBudget: false as const,
    decidedAt: input.now ?? Date.now(),
    manualSteps: input.decision === "accept" ? segmentManualSteps(input.card.type, input.card) : [],
  };
}

/** A budget follow-up only records that a person already made the change. */
export function logBudgetFollowUp(budgetStore: BudgetStore) {
  void budgetStore;
  return {
    status: "logged" as const,
    budgetWrite: "none" as const,
    adAccountWrite: false as const,
    executes: false as const,
    writesBudget: false as const,
    note: "Logged that a person made the change. No campaign amount was written.",
  };
}

export function canUndoDecision(decidedAt: number, now: number) {
  return now >= decidedAt && now - decidedAt <= SEGMENT_UNDO_MS;
}

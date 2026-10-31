import { crossClientLearningAllowed } from "../provenance";
import type { SegmentSettings } from "./settings";
import { judgeArms, requiredConversions, type JudgedArm, type Judgment } from "./stats";

export type SegmentAction = "scale" | "test" | "cut" | "still_learning";

export type ListCandidate = JudgedArm & {
  vendor: string;
  listId: string;
  subSegmentKey: string;
  people: number;
};

export type ListRecommendation = {
  key: string;
  action: SegmentAction;
  chip: "SCALE" | "TEST MORE" | "CUT" | "STILL LEARNING" | "NO CLEAR WINNER";
  reason: string;
  clientReason: string;
  probability: number;
  winner: boolean;
};

/**
 * Scale only a winner whose quality is at least the baseline.
 * Cut when the chance of being best is under 0.05, or quality is 20% below baseline, after the minimum sample.
 * Everything else stays a test. New sub-segments start as test. Nothing writes a budget.
 */
export function recommendLists(lists: ListCandidate[], settings: SegmentSettings, baselineRate: number | null) {
  const required = requiredConversions(baselineRate, settings);
  const ready = lists.filter((list) => list.successes >= required && list.days >= settings.minDays);
  const judgment: Judgment = ready.length >= 2
    ? judgeArms(ready, settings, baselineRate)
    : { status: "still_learning", winnerKey: null, probabilities: {}, pValue: null, requiredConversions: required, label: "still learning" };
  const baselineQuality = ready.length ? ready.reduce((sum, list) => sum + list.quality, 0) / ready.length : 0;
  const rows = lists.map((list) => recommendOne(list, judgment, baselineQuality, settings));
  return { judgment, baselineQuality, rows, writesBudget: false as const, adAccountWrite: false as const };
}

function recommendOne(list: ListCandidate, judgment: Judgment, baselineQuality: number, settings: SegmentSettings): ListRecommendation {
  const probability = judgment.probabilities[list.key] ?? 0;
  if (list.successes < judgment.requiredConversions || list.days < settings.minDays) {
    return {
      key: list.key,
      action: "test",
      chip: "STILL LEARNING",
      reason: `Still learning. ${list.successes} of ${judgment.requiredConversions} verified conversions and ${list.days} of ${settings.minDays} days. No winner yet.`,
      clientReason: `Still learning. ${list.successes} of ${judgment.requiredConversions} verified conversions so far. No winner yet.`,
      probability,
      winner: false,
    };
  }
  if (judgment.status === "no_clear_winner") {
    return {
      key: list.key,
      action: "test",
      chip: "NO CLEAR WINNER",
      reason: "The test ran its full window without a winner. Keep the current best list or stop the test.",
      clientReason: "This comparison never pulled ahead. Your account manager may keep the current best list.",
      probability,
      winner: false,
    };
  }
  const winner = judgment.status === "winner" && judgment.winnerKey === list.key;
  const compared = Object.prototype.hasOwnProperty.call(judgment.probabilities, list.key);
  const qualityCut = list.quality <= baselineQuality * (1 - settings.qualityDrop);
  if (winner && list.quality >= baselineQuality) {
    return {
      key: list.key,
      action: "scale",
      chip: "SCALE",
      reason: `This MAID list from ${list.vendor} (${list.listId}) beat the other lists and its lead quality is at least the baseline. Shift audience toward it by hand.`,
      clientReason: "This group is ahead of your other lists, and lead quality is at least as good as usual. Your account manager may focus more people here.",
      probability,
      winner: true,
    };
  }
  if (qualityCut || (compared && probability < settings.cutProbability)) {
    return {
      key: list.key,
      action: "cut",
      chip: "CUT",
      reason: qualityCut
        ? "Lead quality is at least 20% below the baseline after the minimum sample. Pause this list by hand."
        : "The chance this list is the best is under 5% after the minimum sample. Pause it by hand.",
      clientReason: "This group is behind your other lists, or lead quality is well below usual. Your account manager may stop it.",
      probability,
      winner: false,
    };
  }
  if (judgment.status === "still_learning") {
    return {
      key: list.key,
      action: "test",
      chip: "STILL LEARNING",
      reason: "Still learning. The confidence bar is not met, so this is not a winner.",
      clientReason: "Still learning. There is not a winner yet.",
      probability,
      winner: false,
    };
  }
  return {
    key: list.key,
    action: "test",
    chip: "TEST MORE",
    reason: "This list is still in the comparison. Keep the test running. A new sub-segment starts as a test.",
    clientReason: "Your account manager may keep testing this group.",
    probability,
    winner: false,
  };
}

export function newSubSegmentAction(): SegmentAction {
  return "test";
}

export function crossClientNote(consent: boolean, contributors: number) {
  if (crossClientLearningAllowed(consent, contributors)) {
    return { allowed: true as const, note: `Pattern uses ${contributors} consenting clients.` };
  }
  return { allowed: false as const, note: "Cross-client patterns are off." };
}

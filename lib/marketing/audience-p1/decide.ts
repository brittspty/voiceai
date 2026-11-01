import type { P1LogStore } from "../p1-log-store";
import { evaluateFixture, fixtureById, presentTests } from "./head-to-head";

export type AudienceAction = "scale" | "cut";

export type DecisionLogEntry = {
  at: string;
  who: string;
  testId: string;
  action: AudienceAction;
  campaignWrite: false;
  adAccountWrite: false;
  manualSteps: string[];
  message: "logged only";
};

let decisionLog: DecisionLogEntry[] = [];

export function resetAudienceDecisions() {
  decisionLog = [];
}

export function listAudienceDecisions() {
  return decisionLog.map((row) => ({ ...row, manualSteps: [...row.manualSteps] }));
}

function refuse(error: string, status: 400 | 404) {
  return { ok: false as const, status, error, campaignWrite: false as const, adAccountWrite: false as const, manualSteps: [] as string[] };
}

function manualStepsFor(action: AudienceAction, label: string) {
  return action === "scale"
    ? [
        `In the ad account, point the audience at ${label}.`,
        "Leave the campaign amount where a person set it.",
        "Come back and mark that you did this by hand.",
      ]
    : [
        `In the ad account, pause ${label}.`,
        "Do not move money between campaigns.",
        "Come back and mark that you did this by hand.",
      ];
}

/**
 * Logs the choice and returns the steps a person does by hand.
 * No campaign amount is written. No write access is approved.
 */
function planAudienceDecision(input: { testId: string; action: AudienceAction; who: string; at: string }) {
  const fixture = fixtureById(input.testId);
  if (!fixture) return refuse("That test is not in the example.", 404);
  const view = presentTests("staff").tests.find((test) => test.id === input.testId);
  const evaluated = evaluateFixture(fixture);
  if (!view) return refuse("That test is not in the example.", 404);
  if (evaluated.status === "stopped" || fixture.stopped) return refuse("This test is stopped.", 400);
  if (input.action === "scale") {
    if (evaluated.onHold) return refuse("On hold: low match rate", 400);
    if (evaluated.status !== "winner") return refuse("Scale waits for a winner.", 400);
  }
  const arm = input.action === "cut" ? view.arms.find((item) => item.canCut && !item.winner) ?? view.arms.find((item) => item.canCut) : view.arms.find((item) => item.winner);
  if (input.action === "cut" && !arm?.canCut) return refuse("Cut only after the minimum sample.", 400);
  if (!arm) return refuse("That arm is not ready.", 400);
  const entry: DecisionLogEntry = {
    at: input.at,
    who: input.who,
    testId: input.testId,
    action: input.action,
    campaignWrite: false,
    adAccountWrite: false,
    manualSteps: manualStepsFor(input.action, arm.label),
    message: "logged only",
  };
  return { ok: true as const, status: 200 as const, ...entry };
}

export function decideExample(input: { testId: string; action: AudienceAction; who: string; at: string }) {
  const result = planAudienceDecision(input);
  if (result.ok) {
    decisionLog = [{
      at: result.at,
      who: result.who,
      testId: result.testId,
      action: result.action,
      campaignWrite: false,
      adAccountWrite: false,
      manualSteps: [...result.manualSteps],
      message: "logged only",
    }, ...decisionLog];
  }
  return result;
}

/** Writes a successful scale or cut choice. Refusals are not stored. */
export async function saveAudienceDecision(store: P1LogStore, workspaceId: string, input: { testId: string; action: AudienceAction; who: string; at: string }) {
  const result = planAudienceDecision(input);
  if (result.ok) {
    await store.insertDecision(workspaceId, {
      at: result.at,
      who: result.who,
      testId: result.testId,
      action: result.action,
      campaignWrite: false,
      adAccountWrite: false,
      manualSteps: result.manualSteps,
      message: "logged only",
    });
  }
  return result;
}

export async function loadAudienceDecisions(store: P1LogStore, workspaceId: string) {
  return store.listDecisions(workspaceId);
}

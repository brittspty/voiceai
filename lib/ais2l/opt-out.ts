import { evaluateGates, type GateInput } from "../gates";
import { matchPhrase } from "./text";

/** Phrases that mean the person wants no more calls. Matching is exact or fuzzy. */
export const OPT_OUT_PHRASES = [
  "stop calling",
  "stop calling me",
  "stop the calls",
  "quit calling",
  "cease calling",
  "don't call",
  "dont call",
  "do not call",
  "don't call me",
  "do not call me",
  "don't ever call",
  "never call",
  "never call me",
  "no more calls",
  "take me off",
  "take me off your list",
  "take me off the list",
  "take me off your calling list",
  "remove me",
  "remove me from your list",
  "remove me from the list",
  "remove my number",
  "put me on the do not call list",
  "do-not-call",
  "do not call list",
  "unsubscribe",
  "stop contacting me",
  "leave me alone",
  "don't contact me",
  "do not contact me",
] as const;

export type OptOutHit = { matched: true; phrase: string; similarity: number } | { matched: false };

export function detectOptOut(text: string): OptOutHit {
  const hit = matchPhrase(text, OPT_OUT_PHRASES);
  if (!hit) return { matched: false };
  return { matched: true, phrase: hit.phrase, similarity: hit.similarity };
}

export function contactUtterances(lines: { speaker?: string; text: string }[]) {
  const spoken = lines.filter((line) => line.speaker === "contact").map((line) => line.text);
  return (spoken.length ? spoken : lines.map((line) => line.text)).join("\n");
}

export type OptOutPlan = {
  doNotCall: true;
  suppressFutureDials: true;
  phone: string;
  reason: string;
  source: "ais2l";
};

export function planOptOut(input: { phone: string; phrase: string }): OptOutPlan {
  return {
    doNotCall: true,
    suppressFutureDials: true,
    phone: input.phone,
    reason: `Said "${input.phrase}"`,
    source: "ais2l",
  };
}

/** A planned opt-out is on the do-not-call list, so the dial gate blocks the next call. */
export function optOutBlocksNextDial(gate: Omit<GateInput, "onDoNotCall">, plan: OptOutPlan) {
  return evaluateGates({ ...gate, onDoNotCall: plan.suppressFutureDials });
}

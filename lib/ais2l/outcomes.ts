import type { CallOutcomeName } from "../types";

const OUTCOME_SLUGS: Record<CallOutcomeName, string> = {
  callback_requested: "callback-requested",
  booked: "booked",
  not_interested: "not-interested",
  no_answer: "no-answer",
  voicemail: "voicemail",
  failed: "failed",
  wrong_number: "wrong-number",
};

export function outcomeTag(outcome: CallOutcomeName) {
  return `voiceops-${OUTCOME_SLUGS[outcome]}`;
}

export function isVoiceopsOutcomeTag(tag: string) {
  return (Object.values(OUTCOME_SLUGS) as string[]).some((slug) => tag === `voiceops-${slug}`);
}

export type OutcomeTagPlan = { remove: string[]; add: string[] };

/** Drop earlier voiceops outcome tags, then set the new one. Other tags stay. */
export function planOutcomeTags(existing: string[], outcome: CallOutcomeName, alsoAdd: string[] = []): OutcomeTagPlan {
  const next = outcomeTag(outcome);
  const remove = existing.filter((tag) => isVoiceopsOutcomeTag(tag) && tag !== next);
  const add: string[] = [];
  if (!existing.includes(next)) add.push(next);
  for (const tag of alsoAdd) {
    if (!tag || existing.includes(tag) || add.includes(tag) || remove.includes(tag)) continue;
    add.push(tag);
  }
  return { remove, add };
}

export function outcomeNote(input: {
  agentName: string;
  outcome: CallOutcomeName;
  durationSec: number;
  dialedAt?: Date | string | null;
  startedAt?: Date | string | null;
  endedAt?: Date | string | null;
  doNotCall?: boolean;
}) {
  const label = input.outcome.replaceAll("_", " ");
  const when = (value: Date | string | null | undefined) => {
    if (!value) return "unknown";
    return value instanceof Date ? value.toISOString() : value;
  };
  const dnc = input.doNotCall ? " Marked do-not-call." : "";
  return `${input.agentName} called. Outcome: ${label}. Dialed ${when(input.dialedAt)}. Started ${when(input.startedAt)}. Ended ${when(input.endedAt)}. Duration ${input.durationSec}s.${dnc}`;
}

export type TagClient = {
  listTags(contactId: string): Promise<string[]>;
  removeTags(contactId: string, tags: string[]): Promise<void>;
  addTags(contactId: string, tags: string[]): Promise<void>;
};

/** Remove the previous voiceops outcome tags, then set the new one. */
export async function replaceVoiceopsOutcomeTags(
  client: TagClient,
  contactId: string,
  outcome: CallOutcomeName,
  alsoAdd: string[] = [],
) {
  const existing = await client.listTags(contactId);
  const plan = planOutcomeTags(existing, outcome, alsoAdd);
  if (plan.remove.length) await client.removeTags(contactId, plan.remove);
  if (plan.add.length) await client.addTags(contactId, plan.add);
  return plan;
}

/** Choice stored from the pop-up. Reject is a refusal, not the contact's older none/low/medium/high column. */
export const CHOICE_LEVELS = ["reject", "low", "medium", "high"] as const;
export type ChoiceLevel = (typeof CHOICE_LEVELS)[number];

export const CHOICE_ACTIONS = ["grant", "change", "withdraw"] as const;
export type ChoiceAction = (typeof CHOICE_ACTIONS)[number];

/** Voice may require one of these. The global default is high. */
export const VOICE_LEVELS = ["low", "medium", "high"] as const;
export type VoiceLevel = (typeof VOICE_LEVELS)[number];

const RANK: Record<ChoiceLevel, number> = { reject: 0, low: 1, medium: 2, high: 3 };

export function choiceRank(level: ChoiceLevel) {
  return RANK[level];
}

export function isChoiceLevel(value: string): value is ChoiceLevel {
  return (CHOICE_LEVELS as readonly string[]).includes(value);
}

export function isChoiceAction(value: string): value is ChoiceAction {
  return (CHOICE_ACTIONS as readonly string[]).includes(value);
}

export function isVoiceLevel(value: string | null | undefined): value is VoiceLevel {
  return value === "low" || value === "medium" || value === "high";
}

/** A higher level includes the purposes under it, the way Concord stacks necessary, then functional, analytics, and advertising. */
export function levelMeets(choice: ChoiceLevel | null, minimum: VoiceLevel) {
  if (!choice || choice === "reject") return false;
  return RANK[choice] >= RANK[minimum];
}

import { matchPhrase } from "./text";

const AI_OBJECTION_PHRASES = [
  "are you a robot",
  "are you ai",
  "are you a bot",
  "you are a robot",
  "you're a robot",
  "do not want a robot",
  "do not want to talk to a robot",
  "do not want to talk to ai",
  "stop the ai",
  "no robots",
  "talking to a computer",
  "this is a machine",
  "not a real person",
  "i want a person not a robot",
];

const ADVISOR_PHRASES = [
  "my advisor",
  "talk to my advisor",
  "speak to my advisor",
  "speak with my advisor",
  "ask for my advisor",
  "my account manager",
];

const HUMAN_PHRASES = [
  "real person",
  "real human",
  "live person",
  "live agent",
  "actual person",
  "talk to a human",
  "speak to a human",
  "want a human",
  "get me a human",
  "talk to a person",
  "speak to a person",
  "talk to someone",
  "speak to someone",
  "human takeover",
];

export type HandoffReason = "ai_objection" | "advisor" | "human";

export type HandoffHit = { matched: true; reason: HandoffReason; phrase: string } | { matched: false };

export function detectHumanHandoff(text: string): HandoffHit {
  const advisor = matchPhrase(text, ADVISOR_PHRASES);
  if (advisor) return { matched: true, reason: "advisor", phrase: advisor.phrase };
  const objection = matchPhrase(text, AI_OBJECTION_PHRASES);
  if (objection) return { matched: true, reason: "ai_objection", phrase: objection.phrase };
  const human = matchPhrase(text, HUMAN_PHRASES);
  if (human) return { matched: true, reason: "human", phrase: human.phrase };
  return { matched: false };
}

export type Manager = { id: string; name: string; email: string };

export function accountManagersToNotify(input: { managers: Manager[]; assignedManagerId?: string | null }) {
  if (input.assignedManagerId) {
    const assigned = input.managers.filter((manager) => manager.id === input.assignedManagerId);
    if (assigned.length) return assigned;
  }
  return input.managers;
}

export type HandoffNotice = {
  stopAi: true;
  flag: "human_takeover";
  toRole: "account_manager";
  toName: string;
  toEmail: string | null;
  subject: string;
  body: string;
  agentLine: string;
};

export function buildHandoffNotice(input: {
  contactName: string;
  phone: string;
  reason: HandoffReason;
  phrase: string;
  managerName: string;
  managerEmail: string | null;
}): HandoffNotice {
  const why =
    input.reason === "advisor"
      ? "asked for their advisor"
      : input.reason === "ai_objection"
        ? "objected to the AI"
        : "asked for a human";
  return {
    stopAi: true,
    flag: "human_takeover",
    toRole: "account_manager",
    toName: input.managerName,
    toEmail: input.managerEmail,
    subject: `Human takeover: ${input.contactName}`,
    body: `${input.contactName} (${input.phone}) ${why} ("${input.phrase}"). The AI stopped. This call is flagged for a human takeover.`,
    agentLine: "I'll stop here and have a person follow up.",
  };
}

export function planHumanHandoff(input: {
  contactName: string;
  phone: string;
  hit: Extract<HandoffHit, { matched: true }>;
  managers: Manager[];
  assignedManagerId?: string | null;
}) {
  const targets = accountManagersToNotify({ managers: input.managers, assignedManagerId: input.assignedManagerId });
  const notices = (targets.length ? targets : [{ id: "", name: "Account manager", email: "" }]).map((manager) =>
    buildHandoffNotice({
      contactName: input.contactName,
      phone: input.phone,
      reason: input.hit.reason,
      phrase: input.hit.phrase,
      managerName: manager.name,
      managerEmail: manager.email || null,
    }),
  );
  return { stopAi: true as const, flag: "human_takeover" as const, notices };
}

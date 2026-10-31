import { matchPhrase } from "./text";

export type CallerIdentity = {
  agentName: string;
  companyName: string;
  reason: string;
};

function who(identity: CallerIdentity) {
  const name = identity.agentName.trim() || "the assistant";
  const company = identity.companyName.trim();
  return company ? `${name} with ${company}` : name;
}

function reasonFor(identity: CallerIdentity) {
  return identity.reason.trim().replace(/\.$/, "") || "you asked for a short introduction";
}

/** Name and reason come first. This is a statement, not a question. */
export function buildOpener(identity: CallerIdentity) {
  return `Hi, this is ${who(identity)}. I'm calling because ${reasonFor(identity)}.`;
}

export function identityStatement(identity: CallerIdentity) {
  return `This is ${who(identity)}. I'm calling because ${reasonFor(identity)}.`;
}

const SCREENING_PHRASES = [
  "who is calling",
  "who's calling",
  "who is this",
  "who's this",
  "who am i speaking with",
  "who am i talking to",
  "may i ask who",
  "who may i say is calling",
  "who may i say",
  "what is this regarding",
  "what's this regarding",
  "what is this about",
  "what's this about",
  "purpose of your call",
  "reason for your call",
  "reason for calling",
  "who should i say is calling",
  "who should i say",
];

const TRANSFER_PHRASES = [
  "transfer you",
  "transferring you",
  "let me transfer",
  "i will transfer",
  "i'll transfer",
  "connecting you",
  "connect you to",
  "put you through",
];

const HOLD_PHRASES = [
  "please hold",
  "hold on",
  "hold please",
  "one moment",
  "can you hold",
  "could you hold",
  "put you on hold",
  "bear with me",
  "give me a moment",
  "just a moment",
];

export type CallControl =
  | { kind: "screening"; say: string; hangup: false }
  | { kind: "transfer"; say: string; hangup: false }
  | { kind: "hold"; say: string; hangup: false }
  | { kind: "none" };

export function respondToCallControl(text: string, identity: CallerIdentity): CallControl {
  if (matchPhrase(text, SCREENING_PHRASES)) {
    return { kind: "screening", say: identityStatement(identity), hangup: false };
  }
  if (matchPhrase(text, TRANSFER_PHRASES)) {
    return { kind: "transfer", say: `Please go ahead and transfer. ${identityStatement(identity)}`, hangup: false };
  }
  if (matchPhrase(text, HOLD_PHRASES)) {
    return { kind: "hold", say: "I'll hold.", hangup: false };
  }
  return { kind: "none" };
}

export function firstCallControl(lines: string[], identity: CallerIdentity): CallControl {
  for (const line of lines) {
    const control = respondToCallControl(line, identity);
    if (control.kind !== "none") return control;
  }
  return { kind: "none" };
}

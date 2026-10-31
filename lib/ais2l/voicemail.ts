import type { CallOutcomeName } from "../types";
import type { Env } from "./flag";

export const VOICEMAIL_MAX_SECONDS = 20;
export const SILENCE_HANGUP_MIN_SEC = 10;
export const SILENCE_HANGUP_MAX_SEC = 15;
export const DEFAULT_SILENCE_HANGUP_SEC = 12;
const WORDS_PER_SECOND = 2.5;

/** Configurable, and always kept inside 10 to 15 seconds. */
export function silenceHangupSeconds(env: Env = process.env) {
  const raw = (env.AIS2L_SILENCE_HANGUP_SEC || "").trim();
  if (!raw) return DEFAULT_SILENCE_HANGUP_SEC;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_SILENCE_HANGUP_SEC;
  return Math.min(SILENCE_HANGUP_MAX_SEC, Math.max(SILENCE_HANGUP_MIN_SEC, parsed));
}

export function estimateSpeechSeconds(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (!words) return 0;
  return words / WORDS_PER_SECOND;
}

export function capVoicemailScript(text: string, maxSeconds = VOICEMAIL_MAX_SECONDS) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const maxWords = Math.max(0, Math.floor(maxSeconds * WORDS_PER_SECOND));
  const kept = words.slice(0, maxWords);
  return {
    text: kept.join(" "),
    seconds: kept.length / WORDS_PER_SECOND,
    capped: words.length > kept.length,
  };
}

export function voicemailScript(input: { agentName: string; companyName: string; reason: string }) {
  const company = input.companyName.trim();
  const who = company ? `${input.agentName} with ${company}` : input.agentName;
  const reason = input.reason.trim().replace(/\.$/, "");
  return capVoicemailScript(`Hi, this is ${who}. I'm calling because ${reason}. Please call us back.`);
}

const IVR_PATTERNS = [
  /\bpress\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|zero|pound|star)\b/i,
  /\bdial\s+(?:extension|by name)\b/i,
  /\bmain menu\b/i,
  /\bfor english press\b/i,
  /\bif you know your party/i,
];

const MENU_PATTERNS = [
  /\bpress pound\b/i,
  /\bpress star\b/i,
  /\bto (?:replay|delete|save|listen) (?:this |your )?message\b/i,
  /\bvoicemail menu\b/i,
];

const GREETING_PATTERNS = [
  /\bleave (?:a |your )?message\b/i,
  /\bafter the (?:tone|beep)\b/i,
  /\bmailbox\b/i,
  /\bvoicemail\b/i,
  /\bnot available\b/i,
];

export type MachineKind = "ivr" | "voicemail_menu" | "voicemail_greeting" | "human";

export function classifyMachine(text: string): MachineKind {
  if (IVR_PATTERNS.some((pattern) => pattern.test(text)) || MENU_PATTERNS.some((pattern) => pattern.test(text))) {
    return MENU_PATTERNS.some((pattern) => pattern.test(text)) && !IVR_PATTERNS.some((pattern) => pattern.test(text))
      ? "voicemail_menu"
      : "ivr";
  }
  if (GREETING_PATTERNS.some((pattern) => pattern.test(text))) return "voicemail_greeting";
  return "human";
}

export function classifyMachineLines(lines: string[]): MachineKind {
  let greeting = false;
  for (const line of lines) {
    const kind = classifyMachine(line);
    if (kind === "ivr" || kind === "voicemail_menu") return kind;
    if (kind === "voicemail_greeting") greeting = true;
  }
  return greeting ? "voicemail_greeting" : "human";
}

/** IVR and voicemail menus are never navigated. No digits are sent. */
export function ivrResponse() {
  return { action: "hangup" as const, navigate: false as const, dtmf: null };
}

export type VoicemailPolicyResult = {
  outcome: CallOutcomeName;
  durationSec: number;
  action: "leave" | "hangup" | "unchanged";
  reason?: "already_left" | "silence" | "ivr" | "menu";
  navigate: false;
  dtmf: null;
};

export function notedSilenceSeconds(lines: { text: string }[]) {
  let found: number | null = null;
  for (const line of lines) {
    const match = line.text.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds)\s+of\s+silence/i);
    if (match) found = Number(match[1]);
  }
  return found;
}

export function applyVoicemailPolicy(input: {
  outcome: CallOutcomeName;
  durationSec: number;
  priorVoicemails: number;
  silenceSec?: number | null;
  silenceLimitSec: number;
  contactLines?: string[];
}): VoicemailPolicyResult {
  const machine = classifyMachineLines(input.contactLines ?? []);
  const base = { navigate: false as const, dtmf: null };
  if (machine === "ivr" || machine === "voicemail_menu") {
    const outcome = input.outcome === "voicemail" || input.outcome === "no_answer" ? "no_answer" : input.outcome;
    return {
      ...base,
      outcome,
      durationSec: Math.min(input.durationSec, input.silenceLimitSec),
      action: "hangup",
      reason: machine === "voicemail_menu" ? "menu" : "ivr",
    };
  }
  if (input.silenceSec != null && input.silenceSec >= input.silenceLimitSec) {
    return { ...base, outcome: "no_answer", durationSec: Math.min(input.durationSec, input.silenceLimitSec), action: "hangup", reason: "silence" };
  }
  if (input.outcome === "voicemail" || machine === "voicemail_greeting") {
    if (input.priorVoicemails >= 1) {
      return { ...base, outcome: "no_answer", durationSec: 0, action: "hangup", reason: "already_left" };
    }
    return {
      ...base,
      outcome: "voicemail",
      durationSec: Math.min(Math.max(0, input.durationSec), VOICEMAIL_MAX_SECONDS),
      action: "leave",
    };
  }
  return { ...base, outcome: input.outcome, durationSec: input.durationSec, action: "unchanged" };
}

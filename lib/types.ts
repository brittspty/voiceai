export const CONSENT_LEVELS = ["none", "low", "medium", "high"] as const;
export type ConsentLevel = (typeof CONSENT_LEVELS)[number];

export const CALL_OUTCOMES = [
  "callback_requested",
  "booked",
  "not_interested",
  "no_answer",
  "voicemail",
  "failed",
  "wrong_number",
] as const;
export type CallOutcomeName = (typeof CALL_OUTCOMES)[number];

export const CALL_STATUSES = ["queued", "dialing", "in_progress", "wrap_up", "completed", "failed"] as const;
export type CallStatusName = (typeof CALL_STATUSES)[number];

export type TranscriptLine = {
  speaker: "agent" | "contact";
  text: string;
  atSec: number;
};

export type TimelineEvent = {
  at: string;
  label: string;
  detail?: string;
};

export type GateCheckView = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type CallingPolicy = {
  windowStart: string;
  windowEnd: string;
  days: number[];
  dailyCap: number;
  maxAttempts: number;
  retryBackoffMinutes: number;
  requireConsent: boolean;
  enforceDnc: boolean;
  enforceCallingHours: boolean;
  minConsent: ConsentLevel;
};

export const DEFAULT_POLICY: CallingPolicy = {
  windowStart: "09:00",
  windowEnd: "20:00",
  days: [1, 2, 3, 4, 5, 6],
  dailyCap: 50,
  maxAttempts: 3,
  retryBackoffMinutes: 120,
  requireConsent: true,
  enforceDnc: true,
  enforceCallingHours: true,
  minConsent: "low",
};

export const VOICE_CATALOG = [
  { id: "rachel", name: "Rachel", description: "Warm, clear American" },
  { id: "bella", name: "Bella", description: "Friendly and bright" },
  { id: "adam", name: "Adam", description: "Steady and calm" },
  { id: "antoni", name: "Antoni", description: "Low and measured" },
] as const;

export type Actor = { id: string | null; name: string };

export const SYSTEM_ACTOR: Actor = { id: null, name: "Voice Operations" };

export const LEAD_LABELS = ["qualified", "unqualified", "spam"] as const;
export type LeadLabel = (typeof LEAD_LABELS)[number];

export type LeadInput = {
  kind: "form" | "call";
  name: string;
  phone: string;
  email: string | null;
  message: string;
  transcript: string;
  durationSec: number | null;
  outcome: string | null;
  onDoNotCall: boolean;
};

export type LeadClassification = {
  label: LeadLabel;
  score: number;
  reason: string;
  model: string;
};

export type LeadMarkName = LeadLabel | "clear";

export type ScoredSubject = {
  label: LeadLabel;
  score: number;
  reason: string;
  model: string;
  overrideLabel: LeadLabel | null;
  overrideReason: string;
  overriddenByName: string;
  overriddenAt: string | null;
};

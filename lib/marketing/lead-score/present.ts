import { effectiveLabel, manualMarkText } from "./summary";
import type { LeadLabel } from "./types";

export type LeadRowView = {
  id: string;
  kind: "form" | "call";
  name: string;
  phone: string;
  email: string;
  source: string;
  detail: string;
  transcript: string;
  automaticLabel: LeadLabel;
  automaticScore: number;
  automaticReason: string;
  model: string;
  manualLabel: LeadLabel | null;
  manualReason: string;
  manualBy: string;
  manualAt: string | null;
  effectiveLabel: LeadLabel;
};

const COST_KEY = /cost|spend|cpql|cpa|roas|budget/i;

export function transcriptText(value: unknown) {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .map((line) => {
      if (!line || typeof line !== "object" || !("text" in line)) return "";
      return String(line.text || "");
    })
    .filter(Boolean)
    .join(" ");
}

export function markAuditAction(name: string, label: LeadLabel | null) {
  if (!label) return `Cleared the quality mark on ${name}`;
  const word = label === "qualified" ? "qualified" : label === "spam" ? "spam" : "not qualified";
  return `Marked ${name} ${word}`;
}

export function toLeadView(input: {
  id: string;
  label: LeadLabel;
  score: number;
  reason: string;
  model: string;
  overrideLabel: LeadLabel | null;
  overrideReason: string;
  overriddenAt: Date | null;
  overriddenByName: string;
  contact: { name: string; phone: string; email: string | null; source: string } | null;
  call: { durationSec: number; outcome: string | null; transcript: unknown; contact: { name: string; phone: string; email: string | null; source: string } | null } | null;
}): LeadRowView {
  const person = input.contact ?? input.call?.contact ?? null;
  const transcript = transcriptText(input.call?.transcript);
  const outcome = input.call?.outcome ? input.call.outcome.replaceAll("_", " ") : "";
  const detail = input.call
    ? [outcome, input.call.durationSec ? `${input.call.durationSec}s` : ""].filter(Boolean).join(" · ")
    : person?.source || "Form";
  return {
    id: input.id,
    kind: input.call ? "call" : "form",
    name: person?.name || "Lead",
    phone: person?.phone || "",
    email: person?.email || "",
    source: person?.source || "",
    detail: detail || (input.call ? "Call" : "Form"),
    transcript,
    automaticLabel: input.label,
    automaticScore: input.score,
    automaticReason: input.reason,
    model: input.model,
    manualLabel: input.overrideLabel,
    manualReason: input.overrideReason,
    manualBy: input.overriddenByName,
    manualAt: input.overriddenAt ? input.overriddenAt.toISOString() : null,
    effectiveLabel: effectiveLabel({ label: input.label, overrideLabel: input.overrideLabel }),
  };
}

export function markPayload(row: LeadRowView) {
  return {
    id: row.id,
    manualLabel: row.manualLabel,
    manualReason: row.manualReason,
    manualBy: row.manualBy,
    manualAt: row.manualAt,
    effectiveLabel: row.effectiveLabel,
    automaticLabel: row.automaticLabel,
    automaticScore: row.automaticScore,
    automaticReason: row.automaticReason,
    model: row.model,
    text: row.manualLabel && row.manualAt ? manualMarkText(row.manualLabel, row.manualBy || "Staff", row.manualAt) : "",
  };
}

export function payloadHasCost(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => payloadHasCost(item));
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => COST_KEY.test(key) || payloadHasCost(child));
}

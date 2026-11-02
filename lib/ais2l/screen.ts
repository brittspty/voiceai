import { portsAreMocked, type Env } from "../env";
import { digitsOnly, normalizePhone } from "../phone";
import type { TranscriptLine } from "../types";

export type TestPill = {
  show: boolean;
  enforced: true;
  label: "TEST";
  text: string;
};

export type GhlSyncStatus = "synced" | "pending" | "failed" | "not_sent";

export type GhlSync = {
  status: GhlSyncStatus;
  label: string;
};

export type Ais2lCallView = {
  id: string;
  title: string;
  summary: string;
  transcript: string;
  ghl: GhlSync;
  example: boolean;
};

const TEST_PILL_TEXT = "TEST MODE · only test numbers are called";

/** Voice is in test mode while the workspace switch is on or integrations are not live. */
export function voiceTestActive(orgTestMode: boolean, env: Env = process.env) {
  return portsAreMocked(orgTestMode, env);
}

/**
 * NANP fiction numbers: area code 555, or exchange 555.
 * The server uses this. Hiding the pill does not allow another number.
 */
export function isTestNumber(phone: string) {
  const digits = digitsOnly(normalizePhone(phone));
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return false;
  return national.slice(0, 3) === "555" || national.slice(3, 6) === "555";
}

export function testPill(orgTestMode: boolean, env: Env = process.env): TestPill {
  return {
    show: voiceTestActive(orgTestMode, env),
    enforced: true,
    label: "TEST",
    text: TEST_PILL_TEXT,
  };
}

export function testDialDecision(input: { orgTestMode: boolean; phone: string; env?: Env }) {
  if (!voiceTestActive(input.orgTestMode, input.env)) return { allowed: true as const, reason: "" };
  if (isTestNumber(input.phone)) return { allowed: true as const, reason: "" };
  return {
    allowed: false as const,
    reason: "Voice is in test mode. Only test numbers are called.",
  };
}

export function callSummaryText(input: { contactName: string; outcome: string | null; durationSec: number }) {
  const who = input.contactName.trim() || "Caller";
  const outcome = (input.outcome || "still in progress").replaceAll("_", " ");
  if (input.durationSec > 0) return `${who} — ${outcome}. Lasted ${input.durationSec} seconds.`;
  return `${who} — ${outcome}.`;
}

export function ghlSyncLabel(status: string | null | undefined): GhlSync {
  if (status === "succeeded") return { status: "synced", label: "Synced to GoHighLevel" };
  if (status === "failed") return { status: "failed", label: "GoHighLevel sync failed" };
  if (status === "pending") return { status: "pending", label: "Waiting to sync to GoHighLevel" };
  return { status: "not_sent", label: "Not synced to GoHighLevel" };
}

export function presentCallDetail<T extends { transcript: TranscriptLine[] }>(row: T, options: { includeTranscript: boolean }) {
  return {
    ...row,
    summaryFirst: true as const,
    transcriptAvailable: row.transcript.length > 0,
    transcript: options.includeTranscript ? row.transcript : [],
  };
}

export function transcriptParagraph(lines: TranscriptLine[]) {
  return lines.map((line) => `${line.speaker === "agent" ? "Agent" : "Caller"}: ${line.text}`).join(" ");
}

export function ais2lCallFromRow(input: {
  id: string;
  contactName: string;
  office: string | null;
  outcome: string | null;
  durationSec: number;
  transcript: TranscriptLine[];
  crmStatus: string | null;
}): Ais2lCallView {
  const where = [input.contactName, input.office].filter(Boolean).join(" · ");
  const outcome = input.outcome ? input.outcome.replaceAll("_", " ") : "In progress";
  return {
    id: input.id,
    title: `${where} · ${outcome}`,
    summary: callSummaryText(input),
    transcript: transcriptParagraph(input.transcript),
    ghl: ghlSyncLabel(input.crmStatus),
    example: false,
  };
}

/** Labeled sample used only when this workspace has no calls yet. */
export function exampleAis2lCalls(): Ais2lCallView[] {
  return [
    {
      id: "example-ray",
      title: "Ray S. · Coastal Roofing · Booked",
      summary: "Asked for a roof inspection after the storm ad. Booked Thursday at 10.",
      transcript: "Caller: The leak is over the kitchen. Agent: I can hold Thursday at 10.",
      ghl: ghlSyncLabel("succeeded"),
      example: true,
    },
  ];
}

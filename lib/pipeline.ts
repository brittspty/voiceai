import { evaluateGates, type GateInput } from "./gates";
import type { CallOutcomeName, TranscriptLine } from "./types";

export type VoicePlaceInput = {
  to: string;
  contactName: string;
  agentName: string;
  openingLine: string;
  simulatedOutcome?: CallOutcomeName;
};

export type VoicePlaceResult = {
  conversationId: string;
  callSid: string;
  outcome: CallOutcomeName;
  durationSec: number;
  costCents: number;
  transcript: TranscriptLine[];
};

export type CrmWriteInput = {
  contactName: string;
  phone: string;
  ghlContactId?: string | null;
  outcome: CallOutcomeName;
  durationSec: number;
  agentName: string;
  summary: string;
  forceFail?: boolean;
};

export type CrmWriteResult = { externalId: string };

export interface VoicePort {
  placeCall(input: VoicePlaceInput): Promise<VoicePlaceResult>;
}

export interface CrmPort {
  writeOutcome(input: CrmWriteInput): Promise<CrmWriteResult>;
}

export type DialContext = {
  gate: GateInput;
  voiceInput: VoicePlaceInput;
  crmInput: Omit<CrmWriteInput, "outcome" | "durationSec" | "summary">;
  voice: VoicePort;
  crm: CrmPort;
};

export type DialResult =
  | { kind: "blocked"; checks: ReturnType<typeof evaluateGates>["checks"]; vendorCalled: false }
  | {
      kind: "completed";
      checks: ReturnType<typeof evaluateGates>["checks"];
      vendorCalled: true;
      voice: VoicePlaceResult;
      crmId: string | null;
      crmError: string | null;
      createAppointment: boolean;
    };

export function crmSummary(agentName: string, outcome: CallOutcomeName, durationSec: number) {
  const label = outcome.replaceAll("_", " ");
  return `${agentName} called. Outcome: ${label}. Duration ${durationSec}s.`;
}

export async function placeIfAllowed(
  ctx: Pick<DialContext, "gate" | "voice" | "voiceInput">,
  hooks?: { onStatus?: (status: "dialing" | "in_progress" | "wrap_up") => Promise<void> },
) {
  const gate = evaluateGates(ctx.gate);
  if (!gate.passed) {
    return { kind: "blocked" as const, checks: gate.checks, vendorCalled: false as const };
  }
  await hooks?.onStatus?.("dialing");
  const voice = await ctx.voice.placeCall(ctx.voiceInput);
  await hooks?.onStatus?.("in_progress");
  await hooks?.onStatus?.("wrap_up");
  return {
    kind: "completed" as const,
    checks: gate.checks,
    vendorCalled: true as const,
    voice,
    createAppointment: voice.outcome === "booked",
  };
}

export async function runDialAttempt(ctx: DialContext, hooks?: { onStatus?: (status: "dialing" | "in_progress" | "wrap_up") => Promise<void> }): Promise<DialResult> {
  const placed = await placeIfAllowed(ctx, hooks);
  if (placed.kind === "blocked") {
    return { kind: "blocked", checks: placed.checks, vendorCalled: false };
  }
  let crmId: string | null = null;
  let crmError: string | null = null;
  try {
    const written = await ctx.crm.writeOutcome({
      ...ctx.crmInput,
      outcome: placed.voice.outcome,
      durationSec: placed.voice.durationSec,
      summary: crmSummary(ctx.voiceInput.agentName, placed.voice.outcome, placed.voice.durationSec),
    });
    crmId = written.externalId;
  } catch (error) {
    crmError = error instanceof Error ? error.message : "CRM write failed";
  }
  return {
    kind: "completed",
    checks: placed.checks,
    vendorCalled: true,
    voice: placed.voice,
    crmId,
    crmError,
    createAppointment: placed.createAppointment,
  };
}

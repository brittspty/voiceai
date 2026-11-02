import { WORKSPACE_ID } from "../marketing/types";
import { voiceConsentGateEnabled, type Env } from "./flags";
import { matchKeysFromContact, type ContactMatchInput } from "./record";
import { latestConsentForKeys, readVoiceConsentMinimum } from "./store";
import { voiceConsentDecision } from "./voice-gate";

export type VoiceDialDecision = { enabled: boolean; allow: boolean; reason: string };

/**
 * Loads the latest append-only record that shares any match key with this contact.
 * Jason chose medium on Nov 2, 2026. See voice-gate.ts.
 * When the switch is on and the read fails, the contact is not called.
 */
export async function voiceDecisionForContact(
  contact: ContactMatchInput,
  env: Env = process.env,
  workspaceId = WORKSPACE_ID,
): Promise<VoiceDialDecision> {
  if (!voiceConsentGateEnabled(env)) {
    const decision = voiceConsentDecision({ enabled: false, required: "medium", latest: null });
    return { enabled: false, allow: decision.allow, reason: decision.reason };
  }
  try {
    const required = await readVoiceConsentMinimum(workspaceId);
    const latest = await latestConsentForKeys(workspaceId, matchKeysFromContact(contact));
    const decision = voiceConsentDecision({ enabled: true, required, latest });
    return { enabled: true, allow: decision.allow, reason: decision.reason };
  } catch {
    return {
      enabled: true,
      allow: false,
      reason: "Skipped voice. Consent could not be read, so the call was not placed.",
    };
  }
}

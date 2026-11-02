import type { VoiceLevel } from "./levels";
import { isVoiceLevel, levelMeets } from "./levels";
import { effectiveLevel, latestMatchingConsent, type StoredChoice } from "./record";

/**
 * Jason chose medium on Nov 2, 2026. Medium or high unlocks voice.
 * The global default is medium. A per-client setting may still name low, medium, or high.
 * Null, none, or any other value stays on that medium default.
 * When VOICE_CONSENT_GATE is on, this fails closed: no matching record, a withdrawal,
 * a rejection, or a lower level is skipped and never called.
 */
export const VOICE_CONSENT_DEFAULT_LEVEL: VoiceLevel = "medium";

export function requiredVoiceLevel(setting: string | null | undefined): VoiceLevel {
  return isVoiceLevel(setting) ? setting : VOICE_CONSENT_DEFAULT_LEVEL;
}

export type VoiceConsentInput = {
  enabled: boolean;
  required?: string | null;
  latest: Pick<StoredChoice, "level" | "action"> | null;
};

export function voiceConsentDecision(input: VoiceConsentInput): { allow: boolean; reason: string } {
  if (!input.enabled) return { allow: true, reason: "Voice consent gate is off." };
  const required = requiredVoiceLevel(input.required);
  const level = effectiveLevel(input.latest ? { ...input.latest, createdAt: "" } : null);
  if (!input.latest || !level || level === "reject") {
    const withdrawn = input.latest && (input.latest.action === "withdraw" || level === "reject");
    return {
      allow: false,
      reason: withdrawn
        ? "Skipped voice. Consent was withdrawn or rejected."
        : "Skipped voice. No recorded consent for this contact.",
    };
  }
  if (!levelMeets(level, required)) {
    return {
      allow: false,
      reason: `Skipped voice. Recorded consent is ${level}, below the ${required} minimum.`,
    };
  }
  return { allow: true, reason: `Recorded consent is ${level}, which meets the ${required} minimum.` };
}

/** Uses the latest record that shares any form, hash, click, or CRM key with the contact. */
export function voiceConsentForContactKeys(input: {
  enabled: boolean;
  required?: string | null;
  contactKeys: readonly string[];
  records: readonly (StoredChoice & { matchKeys: readonly string[] })[];
}) {
  return voiceConsentDecision({
    enabled: input.enabled,
    required: input.required,
    latest: latestMatchingConsent(input.contactKeys, input.records),
  });
}

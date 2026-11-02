import { flagOn, type Env } from "../demo/flags";

export type { Env };

/** Off unless CONSENT_POPUP is explicitly on. The public widget and its endpoint stay dark. */
export function consentPopupEnabled(env: Env = process.env) {
  return flagOn(env, "CONSENT_POPUP");
}

/**
 * Off unless VOICE_CONSENT_GATE is explicitly on.
 * When on, voice fails closed: a resolved contact is never called without a matching record at or above the setting.
 */
export function voiceConsentGateEnabled(env: Env = process.env) {
  return flagOn(env, "VOICE_CONSENT_GATE");
}

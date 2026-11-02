export type VerifiedHumanInput = {
  passesDedupe: boolean;
  leadInvolved: boolean;
  contactValid: boolean | null;
  crmOrPixelEngaged: boolean;
  probabilisticOnly: boolean;
};

export type IsVerifiedHuman = (input: VerifiedHumanInput) => boolean;

/**
 * TODO(jason): confirm the source of verified-human.
 * No third-party vendor. Unflagged conversions stay out of the counts.
 * A probabilistic link alone never counts as verified, even if this hook returns true.
 */
export const defaultIsVerifiedHuman: IsVerifiedHuman = (input) => {
  if (input.probabilisticOnly) return false;
  if (!input.passesDedupe) return false;
  if (input.leadInvolved && input.contactValid !== true) return false;
  if (!input.crmOrPixelEngaged) return false;
  return true;
};

export const VERIFIED_HUMAN_LABEL = "pending Jason confirmation";

export function verificationStatus(input: VerifiedHumanInput, hook: IsVerifiedHuman = defaultIsVerifiedHuman) {
  if (input.probabilisticOnly) return "excluded" as const;
  if (hook(input)) return "verified_human" as const;
  return "unflagged" as const;
}

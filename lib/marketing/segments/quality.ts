import type { QualityWeights } from "./settings";

export type LeadQualityInput = {
  /** CRM closed or qualified outcome, 0–100. Null when the CRM has not marked the lead. */
  crmOutcome: number | null;
  /** Platform-reported outcome. Ignored when a CRM outcome exists. */
  platformOutcome?: number | null;
  verifiedEmail: boolean;
  verifiedPhone: boolean;
  duplicate: boolean;
  icpFit: number;
  /** Engagement in the first 7 days, 0–100. */
  engagement7d: number;
};

export type LeadQuality = {
  score: number;
  provisional: boolean;
  usedCrm: boolean;
};

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * 40% CRM outcome, 25% contact validity, 20% ICP fit, 15% first-7-day engagement.
 * CRM outranks a platform report. The score is provisional when there is no CRM outcome.
 */
export function leadQualityScore(input: LeadQualityInput, weights: QualityWeights): LeadQuality {
  const contact = input.duplicate ? 0 : (input.verifiedEmail ? 50 : 0) + (input.verifiedPhone ? 50 : 0);
  const fit = clampScore(input.icpFit);
  const engagement = clampScore(input.engagement7d);
  const crm = input.crmOutcome == null ? null : clampScore(input.crmOutcome);
  const provisional = crm == null;
  const outcome = crm == null ? clampScore(input.platformOutcome ?? 0) : crm;
  const outcomeWeight = provisional ? 0 : weights.crmOutcome;
  const usable = outcomeWeight + weights.contactValidity + weights.icpFit + weights.engagement;
  const raw = outcome * outcomeWeight + contact * weights.contactValidity + fit * weights.icpFit + engagement * weights.engagement;
  const score = usable > 0 ? Math.round(raw / usable) : 0;
  return { score, provisional, usedCrm: crm != null };
}

/** Stable identity for one open recommendation: type, client, campaign or ad, and rule. */
export function recommendationDedupeKey(input: {
  type: string;
  clientId: string;
  campaignId: string;
  adId: string;
  rule: string;
}) {
  return [input.type, input.clientId, input.campaignId, input.adId, input.rule].join("|");
}

/** One open alert per ad and code. */
export function alertDedupeKey(adId: string, code: string) {
  return `${adId}|${code}`;
}

export function ruleFromEvidence(evidence: unknown, fallback: string) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return fallback;
  const row = evidence as { rule?: unknown; code?: unknown };
  if (typeof row.rule === "string" && row.rule.trim()) return row.rule.trim();
  if (typeof row.code === "string" && row.code.trim()) return row.code.trim();
  return fallback;
}

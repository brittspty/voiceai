export type DerivedMetrics = {
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  cpa: number | null;
  roas: number | null;
  frequency: number | null;
  cpl: number | null;
  cpql: number | null;
  qualRate: number | null;
  convRate: number | null;
};

export function ratio(numerator: number | null | undefined, denominator: number | null | undefined) {
  if (numerator == null || denominator == null || !Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

/** CTR, CPC, CPM, CPA, ROAS, and frequency are derived. Missing spend or a zero divisor stays null. */
export function deriveMetrics(input: {
  impressions?: number | null;
  clicks?: number | null;
  reach?: number | null;
  spend?: number | null;
  leads?: number | null;
  qualifiedLeads?: number | null;
  conversions?: number | null;
  conversionValue?: number | null;
}): DerivedMetrics {
  const impressions = input.impressions ?? null;
  const clicks = input.clicks ?? null;
  const reach = input.reach ?? null;
  const spend = input.spend ?? null;
  const leads = input.leads ?? null;
  const qualified = input.qualifiedLeads ?? null;
  const conversions = input.conversions ?? null;
  const revenue = input.conversionValue ?? null;
  return {
    ctr: ratio(clicks, impressions),
    cpc: ratio(spend, clicks),
    cpm: impressions ? (spend == null ? null : (spend / impressions) * 1000) : null,
    cpa: ratio(spend, conversions),
    roas: ratio(revenue, spend),
    frequency: ratio(impressions, reach),
    cpl: ratio(spend, leads),
    cpql: ratio(spend, qualified),
    qualRate: ratio(qualified, leads),
    convRate: ratio(leads, clicks),
  };
}

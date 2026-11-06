export type AnalyticsCampaignRef = {
  id: string;
  name: string;
  externalId: string;
  clientId: string | null;
};

const UNNAMED = new Set(["", "(not set)", "(none)", "(direct)", "(organic)", "(referral)", "(cross-network)", "(data not available)"]);

function compact(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Match a GA4 session campaign to one JAI campaign for this client.
 * An external id wins. Otherwise one case-insensitive name, or one unique contains match.
 * Several matches stay unmatched.
 */
export function matchAnalyticsCampaign(
  campaigns: readonly AnalyticsCampaignRef[],
  clientId: string,
  input: { name?: string; externalId?: string },
) {
  const mine = campaigns.filter((row) => row.clientId === clientId);
  const externalId = (input.externalId || "").trim();
  if (externalId && !UNNAMED.has(externalId.toLowerCase())) {
    const byId = mine.filter((row) => row.externalId.trim() === externalId);
    if (byId.length === 1) return byId[0].id;
  }
  const name = compact(input.name || "");
  if (!name || UNNAMED.has(name)) return null;
  const exact = mine.filter((row) => compact(row.name) === name);
  if (exact.length === 1) return exact[0].id;
  if (exact.length > 1) return null;
  if (name.length < 4) return null;
  const contains = mine.filter((row) => {
    const campaign = compact(row.name);
    if (campaign.length < 4) return false;
    return campaign.includes(name) || name.includes(campaign);
  });
  return contains.length === 1 ? contains[0].id : null;
}

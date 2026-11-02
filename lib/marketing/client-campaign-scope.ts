/**
 * Per-client campaign scoping inside a shared Meta ad account.
 * A client owns a campaign when its id is in metaCampaignIds. The name rule is used only when the id list is empty.
 * Clients with metaLiveRead off own nothing. A campaign never matches two clients: ambiguous matches stay unassigned.
 */
export type ClientCampaignRule = {
  id: string;
  metaCampaignIds: string[];
  metaCampaignNameContains: string;
  metaLiveRead: boolean;
};

export type ScopedCampaign = { externalId: string; name: string };

export function clientMatches(rule: ClientCampaignRule, campaign: ScopedCampaign) {
  if (!rule.metaLiveRead) return false;
  const ids = rule.metaCampaignIds.map((id) => id.trim()).filter(Boolean);
  if (ids.length) return ids.includes(campaign.externalId.trim());
  const needle = rule.metaCampaignNameContains.trim().toLowerCase();
  if (needle.length < 3) return false;
  return campaign.name.toLowerCase().includes(needle);
}

/** Returns the one client that owns the campaign, or null when none or more than one match. */
export function clientForCampaign(rules: ClientCampaignRule[], campaign: ScopedCampaign) {
  const hits = rules.filter((rule) => clientMatches(rule, campaign));
  return hits.length === 1 ? hits[0].id : null;
}

/** Plans the clientId each campaign should carry. Campaigns already linked to a scoped client are cleared when they no longer match. */
export function planCampaignClients(
  rules: ClientCampaignRule[],
  campaigns: (ScopedCampaign & { id: string; clientId: string | null })[],
) {
  const scoped = new Set(rules.map((rule) => rule.id));
  const changes: { id: string; clientId: string | null }[] = [];
  for (const campaign of campaigns) {
    const next = clientForCampaign(rules, campaign);
    if (next === campaign.clientId) continue;
    if (next === null && campaign.clientId && !scoped.has(campaign.clientId)) continue;
    changes.push({ id: campaign.id, clientId: next });
  }
  return changes;
}

type ScopeDb = {
  marketingClient: { findMany(args: unknown): Promise<ClientCampaignRule[]> };
  campaign: {
    findMany(args: unknown): Promise<(ScopedCampaign & { id: string; clientId: string | null })[]>;
    update(args: { where: { id: string }; data: { clientId: string | null } }): Promise<unknown>;
  };
};

/** Database write is local only (Campaign.clientId). Nothing is sent to Meta. */
export async function applyClientCampaignScopes(db: ScopeDb, workspaceId: string) {
  const rules = await db.marketingClient.findMany({
    where: { workspaceId },
    select: { id: true, metaCampaignIds: true, metaCampaignNameContains: true, metaLiveRead: true },
  });
  const campaigns = await db.campaign.findMany({
    where: { workspaceId, platform: "meta" },
    select: { id: true, externalId: true, name: true, clientId: true },
  });
  const changes = planCampaignClients(rules, campaigns);
  for (const change of changes) await db.campaign.update({ where: { id: change.id }, data: { clientId: change.clientId } });
  return { linked: changes.filter((change) => change.clientId).length, cleared: changes.filter((change) => !change.clientId).length };
}

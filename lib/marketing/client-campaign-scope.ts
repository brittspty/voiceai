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

export type StackAdaptClientRule = {
  id: string;
  stackadaptAdvertiserIds: string[];
  stackadaptLiveRead: boolean;
};

/** Advertiser ids the live sync may request. Live read must be on. Ids are numeric and unique. */
export function liveStackAdaptAdvertiserIds(rules: StackAdaptClientRule[]) {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const rule of rules) {
    if (!rule.stackadaptLiveRead) continue;
    for (const raw of rule.stackadaptAdvertiserIds) {
      const id = raw.trim();
      if (!/^\d+$/.test(id) || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

export function stackAdaptAdvertiserIdFromCampaign(campaign: { namingParsed: unknown }) {
  const parsed = campaign.namingParsed;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "";
  const id = (parsed as { stackadaptAdvertiserId?: unknown }).stackadaptAdvertiserId;
  return typeof id === "string" ? id.trim() : "";
}

/** The one client that owns this advertiser, or null when none or more than one match. Live read off owns nothing. */
export function clientForStackAdaptCampaign(rules: StackAdaptClientRule[], campaign: { namingParsed: unknown }) {
  const advertiserId = stackAdaptAdvertiserIdFromCampaign(campaign);
  if (!/^\d+$/.test(advertiserId)) return null;
  const hits = rules.filter((rule) => rule.stackadaptLiveRead && rule.stackadaptAdvertiserIds.some((id) => id.trim() === advertiserId));
  return hits.length === 1 ? hits[0].id : null;
}

/** Plans Campaign.clientId for StackAdapt rows. A campaign linked to a scoped client is cleared when it no longer matches. */
export function planStackAdaptClients(
  rules: StackAdaptClientRule[],
  campaigns: { id: string; clientId: string | null; namingParsed: unknown }[],
) {
  const scoped = new Set(rules.map((rule) => rule.id));
  const changes: { id: string; clientId: string | null }[] = [];
  for (const campaign of campaigns) {
    const next = clientForStackAdaptCampaign(rules, campaign);
    if (next === campaign.clientId) continue;
    if (next === null && campaign.clientId && !scoped.has(campaign.clientId)) continue;
    changes.push({ id: campaign.id, clientId: next });
  }
  return changes;
}

type StackAdaptScopeDb = {
  marketingClient: { findMany(args: unknown): Promise<StackAdaptClientRule[]> };
  campaign: {
    findMany(args: unknown): Promise<{ id: string; clientId: string | null; namingParsed: unknown }[]>;
    update(args: { where: { id: string }; data: { clientId: string | null } }): Promise<unknown>;
  };
};

/** Database write is local only (Campaign.clientId). Nothing is sent to StackAdapt. */
export async function applyStackAdaptClientScopes(db: StackAdaptScopeDb, workspaceId: string) {
  const rules = await db.marketingClient.findMany({
    where: { workspaceId },
    select: { id: true, stackadaptAdvertiserIds: true, stackadaptLiveRead: true },
  });
  const campaigns = await db.campaign.findMany({
    where: { workspaceId, platform: "stackadapt" },
    select: { id: true, clientId: true, namingParsed: true },
  });
  const changes = planStackAdaptClients(rules, campaigns);
  for (const change of changes) await db.campaign.update({ where: { id: change.id }, data: { clientId: change.clientId } });
  return { linked: changes.filter((change) => change.clientId).length, cleared: changes.filter((change) => !change.clientId).length };
}

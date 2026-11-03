/**
 * Per-client campaign linking for Meta, StackAdapt, and Google Ads.
 * Meta: a campaign id list wins over the name rule. An optional ad-account list links every campaign on those accounts, including ones created later.
 * The shared account act_532471207924121 is never linked as a whole. Campaign ids and the name rule still apply there.
 * StackAdapt: an optional campaign-name substring is checked before the plain advertiser match.
 * Clients with live read off own nothing. A campaign never matches two clients: ambiguous matches stay unassigned.
 * Empty metaAdAccountIds and stackadaptCampaignNameContains change nothing.
 */
export const SHARED_META_AD_ACCOUNT_ID = "act_532471207924121";

export type ClientCampaignRule = {
  id: string;
  metaCampaignIds: string[];
  metaCampaignNameContains: string;
  metaLiveRead: boolean;
  /** act_... ids. Empty or omitted links nothing extra. The shared account is ignored. */
  metaAdAccountIds?: string[];
};

export type ScopedCampaign = { externalId: string; name: string; accountExternalId?: string };

/** Canonical act_ form, or "" when the value is not a numeric Meta ad account id. */
export function normalizeMetaAdAccountId(raw: string) {
  const numeric = raw.trim().replace(/^act_/i, "");
  if (!/^\d+$/.test(numeric)) return "";
  return `act_${numeric}`;
}

/** Ids safe to store for whole-account linking. The shared account is refused. */
export function linkableMetaAdAccountIds(rawIds: string[]) {
  const ids: string[] = [];
  for (const raw of rawIds) {
    const id = normalizeMetaAdAccountId(raw);
    if (!id) throw new Error(`Meta ad account ids must look like act_123: ${raw}`);
    if (id === SHARED_META_AD_ACCOUNT_ID) {
      throw new Error(`${SHARED_META_AD_ACCOUNT_ID} is the shared account and cannot be linked as a whole`);
    }
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Case-insensitive substring, same 3-character floor as the Meta name rule. */
function nameContains(needleRaw: string | undefined, name: string) {
  const needle = (needleRaw || "").trim().toLowerCase();
  if (needle.length < 3) return false;
  return name.toLowerCase().includes(needle);
}

export function clientMatches(rule: ClientCampaignRule, campaign: ScopedCampaign) {
  if (!rule.metaLiveRead) return false;
  const ids = rule.metaCampaignIds.map((id) => id.trim()).filter(Boolean);
  if (ids.length) {
    if (ids.includes(campaign.externalId.trim())) return true;
  } else if (nameContains(rule.metaCampaignNameContains, campaign.name)) {
    return true;
  }
  return metaAdAccountMatches(rule, campaign);
}

function metaAdAccountMatches(rule: ClientCampaignRule, campaign: ScopedCampaign) {
  const account = normalizeMetaAdAccountId(campaign.accountExternalId || "");
  if (!account || account === SHARED_META_AD_ACCOUNT_ID) return false;
  return (rule.metaAdAccountIds || []).some((id) => normalizeMetaAdAccountId(id) === account);
}

/** Returns the one client that owns the campaign, or null when none or more than one match. */
export function clientForCampaign(rules: ClientCampaignRule[], campaign: ScopedCampaign) {
  const hits = rules.filter((rule) => clientMatches(rule, campaign));
  if (hits.length > 1) {
    console.warn(
      `Meta campaign ${campaign.externalId} (${campaign.name}) matches clients ${hits.map((hit) => hit.id).join(", ")}; leaving it unassigned.`,
    );
  }
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

type MetaScopeCampaign = ScopedCampaign & {
  id: string;
  clientId: string | null;
  adAccount?: { externalId: string } | null;
};

type ScopeDb = {
  marketingClient: { findMany(args: unknown): Promise<ClientCampaignRule[]> };
  campaign: {
    findMany(args: unknown): Promise<MetaScopeCampaign[]>;
    update(args: { where: { id: string }; data: { clientId: string | null } }): Promise<unknown>;
  };
};

/** Database write is local only (Campaign.clientId). Nothing is sent to Meta. */
export async function applyClientCampaignScopes(db: ScopeDb, workspaceId: string) {
  const rules = await db.marketingClient.findMany({
    where: { workspaceId },
    select: { id: true, metaCampaignIds: true, metaCampaignNameContains: true, metaLiveRead: true, metaAdAccountIds: true },
  });
  const rows = await db.campaign.findMany({
    where: { workspaceId, platform: "meta" },
    select: { id: true, externalId: true, name: true, clientId: true, adAccount: { select: { externalId: true } } },
  });
  const campaigns = rows.map((row) => ({
    id: row.id,
    externalId: row.externalId,
    name: row.name,
    clientId: row.clientId,
    accountExternalId: row.adAccount?.externalId || row.accountExternalId || "",
  }));
  const changes = planCampaignClients(rules, campaigns);
  for (const change of changes) await db.campaign.update({ where: { id: change.id }, data: { clientId: change.clientId } });
  return { linked: changes.filter((change) => change.clientId).length, cleared: changes.filter((change) => !change.clientId).length };
}

export type StackAdaptClientRule = {
  id: string;
  stackadaptAdvertiserIds: string[];
  stackadaptLiveRead: boolean;
  /** Case-insensitive substring. Empty, omitted, or shorter than 3 characters keeps advertiser-only linking. */
  stackadaptCampaignNameContains?: string;
};

export type StackAdaptScopedCampaign = { namingParsed: unknown; name?: string };

function stackAdaptNameFilter(rule: StackAdaptClientRule) {
  const needle = (rule.stackadaptCampaignNameContains || "").trim().toLowerCase();
  return needle.length >= 3 ? needle : "";
}

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

/**
 * The one client that owns this campaign, or null when none or more than one match.
 * A name filter is checked before the plain advertiser match. Live read off owns nothing.
 */
export function clientForStackAdaptCampaign(rules: StackAdaptClientRule[], campaign: StackAdaptScopedCampaign) {
  const advertiserId = stackAdaptAdvertiserIdFromCampaign(campaign);
  if (!/^\d+$/.test(advertiserId)) return null;
  const owners = rules.filter(
    (rule) => rule.stackadaptLiveRead && rule.stackadaptAdvertiserIds.some((id) => id.trim() === advertiserId),
  );
  const name = campaign.name || "";
  const named = owners.filter((rule) => {
    const needle = stackAdaptNameFilter(rule);
    return Boolean(needle) && name.toLowerCase().includes(needle);
  });
  if (named.length === 1) return named[0].id;
  if (named.length > 1) return null;
  const plain = owners.filter((rule) => !stackAdaptNameFilter(rule));
  return plain.length === 1 ? plain[0].id : null;
}

/** Plans Campaign.clientId for StackAdapt rows. A campaign linked to a scoped client is cleared when it no longer matches. */
export function planStackAdaptClients(
  rules: StackAdaptClientRule[],
  campaigns: (StackAdaptScopedCampaign & { id: string; clientId: string | null })[],
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
    findMany(args: unknown): Promise<(StackAdaptScopedCampaign & { id: string; clientId: string | null })[]>;
    update(args: { where: { id: string }; data: { clientId: string | null } }): Promise<unknown>;
  };
};

/** Database write is local only (Campaign.clientId). Nothing is sent to StackAdapt. */
export async function applyStackAdaptClientScopes(db: StackAdaptScopeDb, workspaceId: string) {
  const rules = await db.marketingClient.findMany({
    where: { workspaceId },
    select: { id: true, stackadaptAdvertiserIds: true, stackadaptLiveRead: true, stackadaptCampaignNameContains: true },
  });
  const campaigns = await db.campaign.findMany({
    where: { workspaceId, platform: "stackadapt" },
    select: { id: true, clientId: true, name: true, namingParsed: true },
  });
  const changes = planStackAdaptClients(rules, campaigns);
  for (const change of changes) await db.campaign.update({ where: { id: change.id }, data: { clientId: change.clientId } });
  return { linked: changes.filter((change) => change.clientId).length, cleared: changes.filter((change) => !change.clientId).length };
}

export type GoogleAdsClientRule = {
  id: string;
  googleAdsCustomerIds: string[];
  googleAdsLiveRead: boolean;
};

function googleCustomerId(raw: string) {
  const id = raw.trim().replace(/-/g, "");
  return /^\d{10}$/.test(id) ? id : "";
}

/** Customer ids the live sync may request. Live read must be on. Ids are 10 digits and unique. */
export function liveGoogleAdsCustomerIds(rules: GoogleAdsClientRule[]) {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const rule of rules) {
    if (!rule.googleAdsLiveRead) continue;
    for (const raw of rule.googleAdsCustomerIds) {
      const id = googleCustomerId(raw);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/**
 * Mapped live-read customers.
 * A non-empty allow-list (GOOGLE_ADS_CUSTOMER_IDS) keeps only the overlap.
 * An empty allow-list does not discover other accounts.
 */
export function googleAdsCustomersToRead(rules: GoogleAdsClientRule[], allowList: string[]) {
  const mapped = liveGoogleAdsCustomerIds(rules);
  const allowed = allowList.map(googleCustomerId).filter(Boolean);
  if (!allowed.length) return mapped;
  const set = new Set(allowed);
  return mapped.filter((id) => set.has(id));
}

export function googleAdsCustomerIdFromCampaign(campaign: { namingParsed: unknown; accountExternalId?: string }) {
  const parsed = campaign.namingParsed;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const id = (parsed as { googleAdsCustomerId?: unknown }).googleAdsCustomerId;
    if (typeof id === "string") {
      const normalized = googleCustomerId(id);
      if (normalized) return normalized;
    }
  }
  return googleCustomerId(campaign.accountExternalId || "");
}

/** The one client that owns this customer, or null when none or more than one match. Live read off owns nothing. */
export function clientForGoogleAdsCustomer(rules: GoogleAdsClientRule[], customerId: string) {
  const id = googleCustomerId(customerId);
  if (!id) return null;
  const hits = rules.filter((rule) => rule.googleAdsLiveRead && rule.googleAdsCustomerIds.some((raw) => googleCustomerId(raw) === id));
  return hits.length === 1 ? hits[0].id : null;
}

export function clientForGoogleAdsCampaign(
  rules: GoogleAdsClientRule[],
  campaign: { namingParsed: unknown; accountExternalId?: string },
) {
  return clientForGoogleAdsCustomer(rules, googleAdsCustomerIdFromCampaign(campaign));
}

/** Plans Campaign.clientId for Google Ads rows. A campaign linked to a scoped client is cleared when it no longer matches. */
export function planGoogleAdsClients(
  rules: GoogleAdsClientRule[],
  campaigns: { id: string; clientId: string | null; namingParsed: unknown; accountExternalId?: string }[],
) {
  const scoped = new Set(rules.map((rule) => rule.id));
  const changes: { id: string; clientId: string | null }[] = [];
  for (const campaign of campaigns) {
    const next = clientForGoogleAdsCampaign(rules, campaign);
    if (next === campaign.clientId) continue;
    if (next === null && campaign.clientId && !scoped.has(campaign.clientId)) continue;
    changes.push({ id: campaign.id, clientId: next });
  }
  return changes;
}

/** Plans AdAccount.clientId from the account's 10-digit external id. */
export function planGoogleAdsAccounts(
  rules: GoogleAdsClientRule[],
  accounts: { id: string; clientId: string | null; externalId: string }[],
) {
  const scoped = new Set(rules.map((rule) => rule.id));
  const changes: { id: string; clientId: string | null }[] = [];
  for (const account of accounts) {
    const next = clientForGoogleAdsCustomer(rules, account.externalId);
    if (next === account.clientId) continue;
    if (next === null && account.clientId && !scoped.has(account.clientId)) continue;
    changes.push({ id: account.id, clientId: next });
  }
  return changes;
}

type GoogleAdsScopeDb = {
  marketingClient: { findMany(args: unknown): Promise<GoogleAdsClientRule[]> };
  campaign: {
    findMany(args: unknown): Promise<{
      id: string;
      clientId: string | null;
      namingParsed: unknown;
      adAccount?: { externalId: string } | null;
    }[]>;
    update(args: { where: { id: string }; data: { clientId: string | null } }): Promise<unknown>;
  };
  adAccount: {
    findMany(args: unknown): Promise<{ id: string; clientId: string | null; externalId: string }[]>;
    update(args: { where: { id: string }; data: { clientId: string | null } }): Promise<unknown>;
  };
};

/** Database writes are local only (Campaign.clientId and AdAccount.clientId). Nothing is sent to Google. */
export async function applyGoogleAdsClientScopes(db: GoogleAdsScopeDb, workspaceId: string) {
  const rules = await db.marketingClient.findMany({
    where: { workspaceId },
    select: { id: true, googleAdsCustomerIds: true, googleAdsLiveRead: true },
  });
  const campaignRows = await db.campaign.findMany({
    where: { workspaceId, platform: "google_ads" },
    select: { id: true, clientId: true, namingParsed: true, adAccount: { select: { externalId: true } } },
  });
  const campaignChanges = planGoogleAdsClients(
    rules,
    campaignRows.map((row) => ({
      id: row.id,
      clientId: row.clientId,
      namingParsed: row.namingParsed,
      accountExternalId: row.adAccount?.externalId || "",
    })),
  );
  for (const change of campaignChanges) await db.campaign.update({ where: { id: change.id }, data: { clientId: change.clientId } });
  const accounts = await db.adAccount.findMany({
    where: { workspaceId, platform: "google_ads" },
    select: { id: true, clientId: true, externalId: true },
  });
  const accountChanges = planGoogleAdsAccounts(rules, accounts);
  for (const change of accountChanges) await db.adAccount.update({ where: { id: change.id }, data: { clientId: change.clientId } });
  return {
    linked: campaignChanges.filter((change) => change.clientId).length,
    cleared: campaignChanges.filter((change) => !change.clientId).length,
    accountsLinked: accountChanges.filter((change) => change.clientId).length,
    accountsCleared: accountChanges.filter((change) => !change.clientId).length,
  };
}

/** One database per client. This matches Org.id and is not an access-control key. */
export const WORKSPACE_ID = "org";

export const AD_PLATFORMS = ["meta", "google_ads", "tiktok", "linkedin"] as const;
export type AdPlatform = (typeof AD_PLATFORMS)[number];

export type EntityStatus = "active" | "paused" | "archived" | "deleted" | "unknown";
export type CampaignObjective = "leads" | "traffic" | "conversions" | "awareness" | "calls" | "other";
export type BudgetType = "daily" | "lifetime" | "none";
export type CreativeFormat = "image" | "video" | "carousel" | "text" | "lead_form" | "unknown";
export type AudienceType =
  | "custom_list"
  | "lookalike"
  | "interest"
  | "keyword"
  | "retargeting"
  | "broad"
  | "verified_human"
  | "unknown";
export type SegmentKind = "targeting" | "breakdown";
export type AudienceLinkRole = "include" | "exclude";
export type SyncKind = "full" | "structure" | "insights";
export type SyncStatus = "running" | "succeeded" | "failed" | "skipped";
export type StoredSyncMode = "mock" | "live";
export type AuthType = "oauth" | "system_user" | "private_token" | "internal";
export type ConnectionStatus = "connected" | "expired" | "error" | "disconnected" | "unconfigured";

export type PlatformCreativeRef = { platform: AdPlatform; externalId: string };

export type NormalizedAccount = {
  platform: AdPlatform;
  externalId: string;
  name: string;
  currency: string;
  timezone: string;
  status: EntityStatus;
  syncEnabled: boolean;
};

export type NormalizedCampaign = {
  platform: AdPlatform;
  accountExternalId: string;
  externalId: string;
  name: string;
  objective: CampaignObjective;
  objectiveRaw: string;
  status: EntityStatus;
  statusRaw: string;
  budgetType: BudgetType;
  budgetAmount: string | null;
  startDate: string | null;
  endDate: string | null;
  namingParsed: Record<string, string>;
  /** True when this row was invented because the edge did not load. Do not overwrite a stored row. */
  placeholder?: boolean;
};

export type NormalizedAdGroup = {
  platform: AdPlatform;
  campaignExternalId: string;
  externalId: string;
  name: string;
  status: EntityStatus;
  statusRaw: string;
  optimizationGoal: string;
  bidStrategy: string;
  /** True when this row was invented because the edge did not load. Do not overwrite a stored row. */
  placeholder?: boolean;
  /** True when the payload included targeting, so include/exclude links may be replaced. */
  audiencesLoaded?: boolean;
};

export type NormalizedCreative = {
  conceptKey: string;
  name: string;
  conceptTag: string;
  format: CreativeFormat;
  angle: string;
  offer: string;
  hook: string;
  fingerprint: string;
  headline: string;
  body: string;
  description: string;
  cta: string;
  mediaRef: string;
  landingUrl: string;
  platformCreativeIds: PlatformCreativeRef[];
};

export type NormalizedAd = {
  platform: AdPlatform;
  adGroupExternalId: string;
  externalId: string;
  name: string;
  status: EntityStatus;
  statusRaw: string;
  fingerprint: string;
  destinationUrl: string;
  urlTags: string;
  /** True when this row was invented because the edge did not load. Do not overwrite a stored row. */
  placeholder?: boolean;
};

export type NormalizedAudience = {
  platform: AdPlatform;
  accountExternalId: string;
  externalId: string;
  name: string;
  type: AudienceType;
  sourceDescription: string;
  sizeEstimate: number | null;
};

export type NormalizedAdGroupAudience = {
  platform: AdPlatform;
  adGroupExternalId: string;
  audienceExternalId: string;
  role: AudienceLinkRole;
};

export type NormalizedSegment = {
  segmentKey: string;
  kind: SegmentKind;
  label: string;
};

export type NormalizedMetric = {
  platform: AdPlatform;
  date: string;
  adExternalId: string;
  campaignExternalId: string;
  adGroupExternalId: string;
  fingerprint: string;
  segmentKey: string;
  segmentKind: SegmentKind;
  attributionWindow: string;
  currency: string;
  spend: string;
  impressions: string;
  clicks: string;
  linkClicks: string;
  reach: string;
  platformLeads: string;
  platformConversions: string;
  conversionValue: string;
  videoViews3s: string | null;
  thruplays: string | null;
};

export type NormalizedRaw = {
  platform: AdPlatform;
  objectType: string;
  externalId: string;
  payload: unknown;
};

export type NormalizedSnapshot = {
  accounts: NormalizedAccount[];
  campaigns: NormalizedCampaign[];
  adGroups: NormalizedAdGroup[];
  ads: NormalizedAd[];
  creatives: NormalizedCreative[];
  audiences: NormalizedAudience[];
  adGroupAudiences: NormalizedAdGroupAudience[];
  segments: NormalizedSegment[];
  metrics: NormalizedMetric[];
  raw: NormalizedRaw[];
  warnings: string[];
};

export function emptySnapshot(): NormalizedSnapshot {
  return {
    accounts: [],
    campaigns: [],
    adGroups: [],
    ads: [],
    creatives: [],
    audiences: [],
    adGroupAudiences: [],
    segments: [],
    metrics: [],
    raw: [],
    warnings: [],
  };
}

export const ALL_SEGMENT: NormalizedSegment = {
  segmentKey: "all",
  kind: "breakdown",
  label: "All",
};

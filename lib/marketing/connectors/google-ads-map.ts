import { conceptKey, creativeFingerprint } from "../creative";
import { decimalString, intString, microsToMajor } from "../money";
import {
  ALL_SEGMENT,
  emptySnapshot,
  type CampaignObjective,
  type CreativeFormat,
  type EntityStatus,
  type NormalizedSnapshot,
} from "../types";

export type GoogleAdsBundle = {
  customer: unknown;
  campaigns: unknown[];
  adGroups: unknown[];
  ads: unknown[];
  metrics: unknown[];
  searchTerms: unknown[];
  warnings?: string[];
};

export const GOOGLE_ADS_ATTRIBUTION = "google_ads";
const TERM_MAX = 500;

const CHANNELS: Record<string, CampaignObjective> = {
  SEARCH: "leads",
  PERFORMANCE_MAX: "conversions",
  DISPLAY: "awareness",
  VIDEO: "awareness",
  SHOPPING: "conversions",
  DEMAND_GEN: "traffic",
  LOCAL: "calls",
  SMART: "calls",
};

export function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

export function str(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "bigint") return value.toString();
  return "";
}

export function mapGoogleStatus(raw: string): EntityStatus {
  const key = raw.trim().toUpperCase();
  if (key === "ENABLED") return "active";
  if (key === "PAUSED" || key === "SUSPENDED") return "paused";
  if (key === "REMOVED" || key === "CANCELED" || key === "CLOSED") return "deleted";
  return "unknown";
}

export function mapGoogleObjective(channel: string): CampaignObjective {
  return CHANNELS[channel.trim().toUpperCase()] ?? "other";
}

export function mapGoogleBudget(row: Record<string, unknown>) {
  const budget = asRecord(row.campaignBudget);
  const period = str(budget.period).toUpperCase();
  const daily = str(budget.amountMicros);
  if (daily && Number(daily) > 0 && (period === "DAILY" || period === "")) {
    return { budgetType: "daily" as const, budgetAmount: microsToMajor(daily) };
  }
  const total = str(budget.totalAmountMicros);
  if (total && Number(total) > 0) return { budgetType: "lifetime" as const, budgetAmount: microsToMajor(total) };
  return { budgetType: "none" as const, budgetAmount: null };
}

function customerRecord(value: unknown) {
  const root = asRecord(value);
  const nested = asRecord(root.customer);
  return str(nested.id) ? nested : root;
}

function googleDate(value: unknown) {
  const raw = str(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  if (raw >= "2037-12-30") return null;
  return `${raw}T00:00:00.000Z`;
}

function texts(value: unknown) {
  if (!Array.isArray(value)) return [];
  const rows: string[] = [];
  for (const item of value) {
    const text = str(asRecord(item).text);
    if (text) rows.push(text);
  }
  return rows;
}

function mapFormat(adType: string): CreativeFormat {
  const key = adType.toUpperCase();
  if (key.includes("VIDEO")) return "video";
  if (key.includes("IMAGE") || key.includes("DISPLAY")) return "image";
  if (key.includes("TEXT") || key.includes("SEARCH") || key.includes("RESPONSIVE")) return "text";
  return "unknown";
}

function clipTerm(value: string) {
  return value.length > TERM_MAX ? value.slice(0, TERM_MAX) : value;
}

function ensureCampaign(
  snapshot: NormalizedSnapshot,
  platform: "google_ads",
  accountId: string,
  externalId: string,
) {
  if (!externalId || snapshot.campaigns.some((row) => row.externalId === externalId)) return;
  snapshot.campaigns.push({
    platform,
    accountExternalId: accountId,
    externalId,
    name: externalId,
    objective: "other",
    objectiveRaw: "",
    status: "unknown",
    statusRaw: "",
    budgetType: "none",
    budgetAmount: null,
    startDate: null,
    endDate: null,
    namingParsed: {},
    placeholder: true,
  });
}

function ensureAdGroup(snapshot: NormalizedSnapshot, platform: "google_ads", campaignExternalId: string, externalId: string) {
  if (!externalId || snapshot.adGroups.some((row) => row.externalId === externalId)) return;
  if (!snapshot.campaigns.some((row) => row.externalId === campaignExternalId)) return;
  snapshot.adGroups.push({
    platform,
    campaignExternalId,
    externalId,
    name: externalId,
    status: "unknown",
    statusRaw: "",
    optimizationGoal: "",
    bidStrategy: "",
    placeholder: true,
    audiencesLoaded: false,
  });
}

function ensureAd(snapshot: NormalizedSnapshot, platform: "google_ads", adGroupExternalId: string, externalId: string) {
  if (!externalId || snapshot.ads.some((row) => row.externalId === externalId)) return;
  if (!snapshot.adGroups.some((row) => row.externalId === adGroupExternalId)) return;
  const fingerprint = creativeFingerprint({
    headline: externalId,
    body: "",
    description: "",
    cta: "",
    mediaRef: `ad:${externalId}`,
    landingUrl: "",
  });
  snapshot.creatives.push({
    conceptKey: conceptKey(externalId, "", fingerprint),
    name: externalId,
    conceptTag: "",
    format: "unknown",
    angle: "",
    offer: "",
    hook: "",
    fingerprint,
    headline: "",
    body: "",
    description: "",
    cta: "",
    mediaRef: `ad:${externalId}`,
    landingUrl: "",
    platformCreativeIds: [{ platform, externalId }],
  });
  snapshot.ads.push({
    platform,
    adGroupExternalId,
    externalId,
    name: externalId,
    status: "unknown",
    statusRaw: "",
    fingerprint,
    destinationUrl: "",
    urlTags: "",
    placeholder: true,
  });
}

export function normalizeGoogleAdsBundle(bundle: GoogleAdsBundle): NormalizedSnapshot {
  const platform = "google_ads" as const;
  const snapshot = emptySnapshot();
  snapshot.warnings.push(...(bundle.warnings ?? []));
  snapshot.segments.push(ALL_SEGMENT);

  const customer = customerRecord(bundle.customer);
  const accountId = str(customer.id);
  if (!/^\d{10}$/.test(accountId)) {
    snapshot.warnings.push("Google Ads customer payload had no 10-digit id");
    return snapshot;
  }
  const currency = (str(customer.currencyCode) || "USD").toUpperCase().slice(0, 3);
  const timezone = str(customer.timeZone) || "UTC";
  snapshot.accounts.push({
    platform,
    externalId: accountId,
    name: str(customer.descriptiveName) || accountId,
    currency,
    timezone,
    status: mapGoogleStatus(str(customer.status)),
    syncEnabled: true,
  });
  snapshot.raw.push({ platform, objectType: "ad_account", externalId: accountId, payload: bundle.customer });

  for (const item of bundle.campaigns) {
    const record = asRecord(item);
    const campaign = asRecord(record.campaign);
    const externalId = str(campaign.id);
    if (!externalId || snapshot.campaigns.some((row) => row.externalId === externalId)) continue;
    const statusRaw = str(campaign.status);
    const objectiveRaw = str(campaign.advertisingChannelType);
    const budget = mapGoogleBudget(record);
    snapshot.campaigns.push({
      platform,
      accountExternalId: accountId,
      externalId,
      name: str(campaign.name) || externalId,
      objective: mapGoogleObjective(objectiveRaw),
      objectiveRaw,
      status: mapGoogleStatus(statusRaw),
      statusRaw,
      budgetType: budget.budgetType,
      budgetAmount: budget.budgetAmount,
      startDate: googleDate(campaign.startDate),
      endDate: googleDate(campaign.endDate),
      namingParsed: {},
    });
    snapshot.raw.push({ platform, objectType: "campaign", externalId, payload: item });
  }

  for (const item of bundle.adGroups) {
    const record = asRecord(item);
    const adGroup = asRecord(record.adGroup);
    const campaign = asRecord(record.campaign);
    const externalId = str(adGroup.id);
    const campaignExternalId = str(campaign.id);
    if (!externalId || snapshot.adGroups.some((row) => row.externalId === externalId)) continue;
    if (!snapshot.campaigns.some((row) => row.externalId === campaignExternalId)) {
      snapshot.warnings.push(`Ad group ${externalId} references unknown campaign ${campaignExternalId || "(missing)"}`);
      continue;
    }
    const statusRaw = str(adGroup.status);
    snapshot.adGroups.push({
      platform,
      campaignExternalId,
      externalId,
      name: str(adGroup.name) || externalId,
      status: mapGoogleStatus(statusRaw),
      statusRaw,
      optimizationGoal: str(adGroup.type),
      bidStrategy: str(campaign.biddingStrategyType),
      audiencesLoaded: false,
    });
    snapshot.raw.push({ platform, objectType: "ad_group", externalId, payload: item });
  }

  for (const item of bundle.ads) {
    const record = asRecord(item);
    const adGroupAd = asRecord(record.adGroupAd);
    const ad = asRecord(adGroupAd.ad);
    const adGroupExternalId = str(asRecord(record.adGroup).id);
    const externalId = str(ad.id);
    if (!externalId || snapshot.ads.some((row) => row.externalId === externalId)) continue;
    if (!snapshot.adGroups.some((row) => row.externalId === adGroupExternalId)) {
      snapshot.warnings.push(`Ad ${externalId} references unknown ad group ${adGroupExternalId || "(missing)"}`);
      continue;
    }
    const rsa = asRecord(ad.responsiveSearchAd);
    const headlines = texts(rsa.headlines);
    const descriptions = texts(rsa.descriptions);
    const urls = Array.isArray(ad.finalUrls) ? ad.finalUrls.map((url) => str(url)).filter(Boolean) : [];
    const headline = headlines[0] || "";
    const body = descriptions[0] || "";
    const description = descriptions.slice(1).join(" ") || headlines.slice(1).join(" · ");
    const landingUrl = urls[0] || "";
    const mediaRef = str(ad.type) || `ad:${externalId}`;
    const blank = !headline && !body && !description && !landingUrl;
    const fingerprint = creativeFingerprint({
      headline,
      body,
      description,
      cta: "",
      mediaRef: blank ? `ad:${externalId}` : mediaRef,
      landingUrl,
    });
    const name = str(ad.name) || headline || externalId;
    if (!snapshot.creatives.some((row) => row.fingerprint === fingerprint)) {
      snapshot.creatives.push({
        conceptKey: conceptKey(name, blank ? "" : mediaRef, fingerprint),
        name,
        conceptTag: "",
        format: mapFormat(str(ad.type)),
        angle: "",
        offer: "",
        hook: "",
        fingerprint,
        headline,
        body,
        description,
        cta: "",
        mediaRef: blank ? `ad:${externalId}` : mediaRef,
        landingUrl,
        platformCreativeIds: [{ platform, externalId }],
      });
    }
    const statusRaw = str(adGroupAd.status);
    snapshot.ads.push({
      platform,
      adGroupExternalId,
      externalId,
      name,
      status: mapGoogleStatus(statusRaw),
      statusRaw,
      fingerprint,
      destinationUrl: landingUrl,
      urlTags: "",
    });
    snapshot.raw.push({ platform, objectType: "ad", externalId, payload: item });
  }

  const metricKeys = new Set<string>();
  for (const item of bundle.metrics) {
    const record = asRecord(item);
    const adExternalId = str(asRecord(asRecord(record.adGroupAd).ad).id);
    const campaignExternalId = str(asRecord(record.campaign).id);
    const adGroupExternalId = str(asRecord(record.adGroup).id);
    const date = str(asRecord(record.segments).date).slice(0, 10);
    if (!adExternalId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    ensureCampaign(snapshot, platform, accountId, campaignExternalId);
    ensureAdGroup(snapshot, platform, campaignExternalId, adGroupExternalId);
    ensureAd(snapshot, platform, adGroupExternalId, adExternalId);
    if (!snapshot.ads.some((row) => row.externalId === adExternalId)) {
      snapshot.warnings.push(`Insight for unknown ad ${adExternalId} on ${date} was skipped`);
      continue;
    }
    const key = `${date}|${adExternalId}|${GOOGLE_ADS_ATTRIBUTION}`;
    if (metricKeys.has(key)) continue;
    metricKeys.add(key);
    const metrics = asRecord(record.metrics);
    const conversions = decimalString(str(metrics.conversions) || "0");
    snapshot.metrics.push({
      platform,
      date,
      adExternalId,
      campaignExternalId,
      adGroupExternalId,
      fingerprint: snapshot.ads.find((ad) => ad.externalId === adExternalId)?.fingerprint ?? "",
      segmentKey: ALL_SEGMENT.segmentKey,
      segmentKind: ALL_SEGMENT.kind,
      attributionWindow: GOOGLE_ADS_ATTRIBUTION,
      currency,
      spend: microsToMajor(str(metrics.costMicros) || "0") || "0.0000",
      impressions: intString(metrics.impressions),
      clicks: intString(metrics.clicks),
      linkClicks: intString(metrics.clicks),
      reach: "0",
      platformLeads: conversions,
      platformConversions: "0.0000",
      conversionValue: decimalString(str(metrics.conversionsValue) || "0"),
      videoViews3s: null,
      thruplays: null,
    });
    snapshot.raw.push({
      platform,
      objectType: "insight",
      externalId: `${adExternalId}|${date}|${GOOGLE_ADS_ATTRIBUTION}`,
      payload: item,
    });
  }

  const termKeys = new Set<string>();
  for (const item of bundle.searchTerms) {
    const record = asRecord(item);
    const view = asRecord(record.searchTermView);
    const term = clipTerm(str(view.searchTerm));
    const campaignExternalId = str(asRecord(record.campaign).id);
    const adGroupExternalId = str(asRecord(record.adGroup).id);
    const date = str(asRecord(record.segments).date).slice(0, 10);
    const matchType = str(asRecord(record.segments).searchTermMatchType).slice(0, 64);
    if (!term || !campaignExternalId || !adGroupExternalId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const key = `${date}|${campaignExternalId}|${adGroupExternalId}|${term}|${matchType}`;
    if (termKeys.has(key)) continue;
    termKeys.add(key);
    const metrics = asRecord(record.metrics);
    snapshot.searchTerms.push({
      platform,
      date,
      campaignExternalId,
      adGroupExternalId,
      term,
      matchType,
      status: str(view.status).slice(0, 64),
      currency,
      spend: microsToMajor(str(metrics.costMicros) || "0") || "0.0000",
      impressions: intString(metrics.impressions),
      clicks: intString(metrics.clicks),
      conversions: decimalString(str(metrics.conversions) || "0"),
    });
    snapshot.raw.push({
      platform,
      objectType: "search_term",
      externalId: `${adGroupExternalId}|${date}|${matchType}|${term}`,
      payload: item,
    });
  }

  return snapshot;
}

import { planAdFatigue, type AdFatigueAd, type AdFatigueRecommendationDraft } from "../ad-fatigue";
import { conceptKey, creativeFingerprint } from "../creative";
import { decimalString, intString } from "../money";
import { ALL_SEGMENT, emptySnapshot, type EntityStatus, type NormalizedSnapshot } from "../types";
import type { StackAdaptBundle, StackAdaptCampaign, StackAdaptLineItem } from "./stackadapt-client";

export const STACKADAPT_ACCOUNT_ID = "stackadapt";
const PLATFORM = "stackadapt" as const;

function mapStatus(raw: string): EntityStatus {
  const key = raw.trim().toUpperCase();
  if (key === "ACTIVE" || key === "ENABLED" || key === "LIVE" || key === "RUNNING") return "active";
  if (key === "PAUSED" || key === "PAUSED_CAMPAIGN") return "paused";
  if (key === "ARCHIVED") return "archived";
  if (key === "DELETED" || key === "REMOVED") return "deleted";
  return "unknown";
}

function creativeFor(line: StackAdaptLineItem, creative: { id: string; name: string }) {
  const headline = creative.name || line.name || "StackAdapt creative";
  const fingerprint = creativeFingerprint({
    headline,
    body: "",
    description: "",
    cta: "",
    mediaRef: creative.id,
    landingUrl: "",
  });
  return {
    fingerprint,
    creative: {
      conceptKey: conceptKey(headline, creative.id, fingerprint),
      name: headline,
      conceptTag: "",
      format: "unknown" as const,
      angle: "",
      offer: "",
      hook: "",
      fingerprint,
      headline,
      body: "",
      description: "",
      cta: "",
      mediaRef: creative.id,
      landingUrl: "",
      platformCreativeIds: [{ platform: PLATFORM, externalId: creative.id }],
    },
  };
}

/**
 * Maps a StackAdapt read into the shared snapshot.
 * Spend is a delivery metric. Campaign budget fields stay empty, so this path cannot set a budget.
 * Line-item stats are attached once, to one ad, so creatives are not double counted.
 */
export function stackAdaptToSnapshot(bundle: StackAdaptBundle): NormalizedSnapshot {
  const snapshot = emptySnapshot();
  snapshot.warnings.push(...bundle.warnings);
  snapshot.accounts.push({
    platform: PLATFORM,
    externalId: STACKADAPT_ACCOUNT_ID,
    name: "StackAdapt",
    currency: "USD",
    timezone: "America/New_York",
    status: "active",
    syncEnabled: true,
  });
  snapshot.segments.push(ALL_SEGMENT);

  for (const campaign of bundle.campaigns) {
    snapshot.campaigns.push({
      platform: PLATFORM,
      accountExternalId: STACKADAPT_ACCOUNT_ID,
      externalId: campaign.id,
      name: campaign.name || campaign.id,
      objective: "other",
      objectiveRaw: "",
      status: mapStatus(campaign.status),
      statusRaw: campaign.status,
      budgetType: "none",
      budgetAmount: null,
      startDate: null,
      endDate: null,
      namingParsed: {},
    });
    for (const line of campaign.lineItems) addLineItem(snapshot, campaign, line);
  }
  snapshot.raw.push({ platform: PLATFORM, objectType: "bundle", externalId: STACKADAPT_ACCOUNT_ID, payload: { campaigns: bundle.campaigns.length } });
  return snapshot;
}

function addLineItem(snapshot: NormalizedSnapshot, campaign: StackAdaptCampaign, line: StackAdaptLineItem) {
  snapshot.adGroups.push({
    platform: PLATFORM,
    campaignExternalId: campaign.id,
    externalId: line.id,
    name: line.name || line.id,
    status: mapStatus(line.status),
    statusRaw: line.status,
    optimizationGoal: "",
    bidStrategy: "",
  });
  const creatives = line.creatives.length ? line.creatives : [{ id: line.id, name: line.name || line.id, status: line.status }];
  const primary = creativeFor(line, creatives[0]);
  for (const creative of creatives) {
    const mapped = creativeFor(line, creative);
    if (!snapshot.creatives.some((row) => row.fingerprint === mapped.fingerprint)) snapshot.creatives.push(mapped.creative);
  }
  const adExternalId = `line:${line.id}`;
  snapshot.ads.push({
    platform: PLATFORM,
    adGroupExternalId: line.id,
    externalId: adExternalId,
    name: line.name || line.id,
    status: mapStatus(line.status),
    statusRaw: line.status,
    fingerprint: primary.fingerprint,
    destinationUrl: "",
    urlTags: "",
  });
  for (const stat of line.dailyStats) {
    snapshot.metrics.push({
      platform: PLATFORM,
      date: stat.date,
      adExternalId,
      campaignExternalId: campaign.id,
      adGroupExternalId: line.id,
      fingerprint: primary.fingerprint,
      segmentKey: ALL_SEGMENT.segmentKey,
      segmentKind: ALL_SEGMENT.kind,
      attributionWindow: "stackadapt",
      currency: "USD",
      spend: decimalString(stat.spend),
      impressions: intString(stat.impressions),
      clicks: intString(stat.clicks),
      linkClicks: intString(stat.clicks),
      reach: "0",
      platformLeads: "0.0000",
      platformConversions: decimalString(stat.conversions),
      conversionValue: "0.0000",
      videoViews3s: null,
      thruplays: null,
    });
  }
}

export type StackAdaptRecommendation = Omit<AdFatigueRecommendationDraft, "type"> & { type: "stackadapt" };

/** Same fatigue scorer as Meta. Recommendations only. No ad write and no budget amount. */
export function recommendStackAdapt(snapshot: NormalizedSnapshot, today: string, threshold = 0.8): StackAdaptRecommendation[] {
  const ads = fatigueAds(snapshot);
  const plan = planAdFatigue({ ads, today, defaultThreshold: threshold });
  return plan.recommendations.map((recommendation) => ({ ...recommendation, type: "stackadapt" as const }));
}

function fatigueAds(snapshot: NormalizedSnapshot): AdFatigueAd[] {
  const names = new Map(snapshot.ads.map((ad) => [ad.externalId, ad]));
  const campaigns = new Map(snapshot.campaigns.map((campaign) => [campaign.externalId, campaign.name]));
  const byAd = new Map<string, AdFatigueAd>();
  for (const metric of snapshot.metrics) {
    if (metric.platform !== PLATFORM) continue;
    const ad = names.get(metric.adExternalId);
    let series = byAd.get(metric.adExternalId);
    if (!series) {
      series = {
        adId: metric.adExternalId,
        adName: ad?.name || metric.adExternalId,
        platform: PLATFORM,
        campaignId: metric.campaignExternalId,
        campaignName: campaigns.get(metric.campaignExternalId) || metric.campaignExternalId,
        adAccountId: STACKADAPT_ACCOUNT_ID,
        clientKey: `stackadapt:${STACKADAPT_ACCOUNT_ID}`,
        assigneeUserId: null,
        rows: [],
      };
      byAd.set(metric.adExternalId, series);
    }
    series.rows.push({
      id: `${metric.adExternalId}:${metric.date}`,
      date: metric.date,
      impressions: Number(metric.impressions) || 0,
      clicks: Number(metric.clicks) || 0,
      reach: Number(metric.reach) || 0,
      spend: Number(metric.spend) || 0,
      conversions: Number(metric.platformConversions) || 0,
      conversionValue: Number(metric.conversionValue) || 0,
      creativeKey: metric.fingerprint || metric.adExternalId,
      attributionWindow: metric.attributionWindow,
    });
  }
  return [...byAd.values()];
}

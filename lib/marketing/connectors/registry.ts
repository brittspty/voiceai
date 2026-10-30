import type { AdPlatform, NormalizedSnapshot } from "../types";
import { pullGoogleAdsSnapshot, type GoogleAdsPullInput } from "./google-ads";
import { pullMetaSnapshot, type MetaPullInput } from "./meta";

/**
 * One connector per source. The canonical tables do not change when a source is added.
 * Implement `pull`, return a NormalizedSnapshot, and register it here.
 * Google Ads is read-only: its client allows GoogleAdsService search and searchStream only.
 */
export interface AdPlatformConnector<TInput> {
  platform: AdPlatform;
  label: string;
  pull(input: TInput): Promise<{ snapshot: NormalizedSnapshot; failures: string[] }>;
}

export const connectors = {
  meta: {
    platform: "meta" as const,
    label: "Meta Ads",
    pull: pullMetaSnapshot,
  },
  google_ads: {
    platform: "google_ads" as const,
    label: "Google Ads",
    pull: pullGoogleAdsSnapshot,
  },
};

export function getConnector(platform: "meta"): AdPlatformConnector<MetaPullInput>;
export function getConnector(platform: "google_ads"): AdPlatformConnector<GoogleAdsPullInput>;
export function getConnector(platform: AdPlatform): AdPlatformConnector<MetaPullInput> | AdPlatformConnector<GoogleAdsPullInput> {
  if (platform === "meta") return connectors.meta;
  if (platform === "google_ads") return connectors.google_ads;
  throw new Error(`No marketing connector for ${platform}. Register one in lib/marketing/connectors/registry.ts.`);
}

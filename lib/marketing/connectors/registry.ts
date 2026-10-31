import type { AdPlatform, NormalizedSnapshot } from "../types";
import { pullGoogleAdsSnapshot, type GoogleAdsPullInput } from "./google-ads";
import { pullMetaSnapshot, type MetaPullInput } from "./meta";
import { pullStackAdaptSnapshot, type StackAdaptPullInput } from "./stackadapt";

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
  stackadapt: {
    platform: "stackadapt" as const,
    label: "StackAdapt",
    pull: pullStackAdaptSnapshot,
  },
};

export function getConnector(platform: "meta"): AdPlatformConnector<MetaPullInput>;
export function getConnector(platform: "google_ads"): AdPlatformConnector<GoogleAdsPullInput>;
export function getConnector(platform: "stackadapt"): AdPlatformConnector<StackAdaptPullInput>;
export function getConnector(
  platform: AdPlatform,
): AdPlatformConnector<MetaPullInput> | AdPlatformConnector<GoogleAdsPullInput> | AdPlatformConnector<StackAdaptPullInput> {
  if (platform === "meta") return connectors.meta;
  if (platform === "google_ads") return connectors.google_ads;
  if (platform === "stackadapt") return connectors.stackadapt;
  throw new Error(`No marketing connector for ${platform}. Register one in lib/marketing/connectors/registry.ts.`);
}

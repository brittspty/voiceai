import type { AdPlatform } from "../types";
import type { NormalizedSnapshot } from "../types";
import { pullMetaSnapshot, type MetaPullInput } from "./meta";

/**
 * One connector per source. The canonical tables do not change when a source is added.
 * Implement `pull`, return a NormalizedSnapshot, and register it here.
 */
export interface AdPlatformConnector {
  platform: AdPlatform;
  label: string;
  pull(input: MetaPullInput): Promise<{ snapshot: NormalizedSnapshot; failures: string[] }>;
}

export const connectors: Partial<Record<AdPlatform, AdPlatformConnector>> = {
  meta: {
    platform: "meta",
    label: "Meta Ads",
    pull: pullMetaSnapshot,
  },
};

export function getConnector(platform: AdPlatform): AdPlatformConnector {
  const connector = connectors[platform];
  if (!connector) {
    throw new Error(`No marketing connector for ${platform}. Register one in lib/marketing/connectors/registry.ts.`);
  }
  return connector;
}

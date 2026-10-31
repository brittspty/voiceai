import { createHash } from "node:crypto";

/**
 * Local list checks only. No third-party vendor and no outbound lookup.
 * TODO(jason): replace these starter lists with the lists you want kept in-repo.
 */

export const LOCAL_INVALID_BUNDLES = ["invalid.bundle", "com.example.invalid"] as const;
export const LOCAL_FAILED_ADS_TXT = ["failed.ads.txt.bundle"] as const;

export function hashIp(raw: string) {
  const value = raw.trim().toLowerCase();
  if (!value) return "";
  return createHash("sha256").update(value).digest("hex");
}

/** Example datacenter hash for the local list. The raw address is not stored. */
export const LOCAL_DATACENTER_IP_HASHES = [hashIp("203.0.113.66")] as const;

export type QualityLists = {
  invalidBundles: readonly string[];
  failedAdsTxt: readonly string[];
  datacenterIpHashes: readonly string[];
};

export const DEFAULT_QUALITY_LISTS: QualityLists = {
  invalidBundles: LOCAL_INVALID_BUNDLES,
  failedAdsTxt: LOCAL_FAILED_ADS_TXT,
  datacenterIpHashes: LOCAL_DATACENTER_IP_HASHES,
};

export function exposureExclusion(input: { appBundle?: string; publisher?: string; ipHash?: string }, lists: QualityLists = DEFAULT_QUALITY_LISTS) {
  const bundle = (input.appBundle || input.publisher || "").trim().toLowerCase();
  if (bundle && lists.invalidBundles.some((row) => row.toLowerCase() === bundle)) return "invalid_app_bundle";
  if (bundle && lists.failedAdsTxt.some((row) => row.toLowerCase() === bundle)) return "failed_ads_txt";
  const hash = (input.ipHash || "").trim().toLowerCase();
  if (hash && lists.datacenterIpHashes.some((row) => row.toLowerCase() === hash)) return "datacenter_ip";
  return "";
}

/** Accept a hash, or hash a raw IP and drop the raw value. */
export function acceptIp(raw: string | undefined, alreadyHash: string | undefined) {
  const hash = (alreadyHash || "").trim().toLowerCase();
  if (/^[a-f0-9]{64}$/.test(hash)) return hash;
  if (!raw) return "";
  return hashIp(raw);
}

import { createHash } from "node:crypto";
import { listValidationConfig, listValidationGateEnabled, type Env, type ListValidationConfig } from "../config";
import { isBrokeredAudienceSource } from "./google-policy";

export type ListFlag = {
  code: "seed" | "seed_unreliable" | "holdout" | "google_match" | "consent" | "google_policy";
  message: string;
};

export type ConsentOrigin = "first_party" | "upstream_supplier" | "";

export function parseConsentOrigin(raw: string): ConsentOrigin {
  const value = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (value === "first_party" || value === "firstparty") return "first_party";
  if (value === "upstream_supplier" || value === "upstream" || value === "upstream_only" || value === "supplier") return "upstream_supplier";
  return "";
}

export function garbledSeed(listId: string, index: number) {
  const hash = createHash("sha256").update(`seed:${listId}:${index}`, "utf8").digest("hex");
  return { hash, kind: "garbled" as const };
}

/** Recommend-only. These IDs are known fakes. They are not sent anywhere by this check. */
export function planSeedCheck(listSize: number, listId: string, config: ListValidationConfig = listValidationConfig()) {
  const count = Math.max(0, Math.round(listSize * config.seedRate));
  const seeds = Array.from({ length: count }, (_, index) => garbledSeed(listId, index));
  return {
    listSize,
    seedCount: count,
    seedPercent: listSize > 0 ? count / listSize : 0,
    seeds,
  };
}

export function seedMatchFlag(seeds: number, seedsMatched: number, config: ListValidationConfig = listValidationConfig()) {
  if (seeds <= 0) return { rate: null as number | null, unreliable: false };
  const rate = seedsMatched / seeds;
  return { rate, unreliable: rate > config.seedMatchMaxPercent };
}

export function holdoutArm(id: string, salt: string, holdoutPercent: number) {
  const share = parseInt(createHash("sha256").update(`${salt}:${id}`, "utf8").digest("hex").slice(0, 8), 16) / 0xffffffff;
  return share < holdoutPercent ? "holdout" as const : "exposed" as const;
}

export function assignHoldout<T extends { id: string }>(rows: T[], salt: string, config: ListValidationConfig = listValidationConfig()) {
  const holdout = rows.filter((row) => holdoutArm(row.id, salt, config.holdoutPercent) === "holdout");
  const exposed = rows.filter((row) => holdoutArm(row.id, salt, config.holdoutPercent) === "exposed");
  return { holdout, exposed, holdoutPercent: config.holdoutPercent };
}

export function incrementalLift(input: { exposedConversions: number; exposedSize: number; holdoutConversions: number; holdoutSize: number }) {
  const exposedRate = input.exposedSize > 0 ? input.exposedConversions / input.exposedSize : null;
  const holdoutRate = input.holdoutSize > 0 ? input.holdoutConversions / input.holdoutSize : null;
  if (exposedRate === null || holdoutRate === null || holdoutRate === 0) {
    return { lift: null as number | null, message: "Holdout results are not in yet. The holdout saw no ads." };
  }
  const lift = (exposedRate - holdoutRate) / holdoutRate;
  const percent = `${(lift * 100).toFixed(1)}%`;
  return { lift, message: `Incremental lift is ${percent} against the holdout that saw no ads.` };
}

export function googleMatchSanity(matchRate: number | null, config: ListValidationConfig = listValidationConfig()) {
  if (matchRate === null) return { flagged: false, message: null as string | null };
  if (matchRate < config.googleMatchMin || matchRate > config.googleMatchMax) {
    return {
      flagged: true,
      message: `Google match rate ${(matchRate * 100).toFixed(1)}% is outside ${(config.googleMatchMin * 100).toFixed(0)}–${(config.googleMatchMax * 100).toFixed(0)}%.`,
    };
  }
  return { flagged: false, message: null };
}

export const GOOGLE_POLICY_WARNING = "Brokered or third-party MAID lists are a Google Customer Match policy risk.";

export type ValidationAudience = {
  id: string;
  listId: string;
  source: string;
  vendor: string;
  size: number;
  consentOrigin: ConsentOrigin | string;
  seedMatched?: number | null;
  platforms: { platform: string; uploaded: number; matched: number }[];
  exposedConversions?: number | null;
  exposedSize?: number | null;
  holdoutConversions?: number | null;
  holdoutSize?: number | null;
};

/** Recommend-only flags. No budget change and no outbound call. */
export function listValidationFlags(row: ValidationAudience, env: Env = process.env): ListFlag[] {
  if (!listValidationGateEnabled(env)) return [];
  const config = listValidationConfig(env);
  const flags: ListFlag[] = [];
  const seeds = planSeedCheck(row.size, row.listId, config);
  const seedRate = seeds.listSize > 0 ? seeds.seedPercent : 0;
  const seedResult = seedMatchFlag(seeds.seedCount, row.seedMatched ?? 0, config);
  if (row.seedMatched != null && seedResult.unreliable) {
    flags.push({
      code: "seed_unreliable",
      message: `Seed check: ${row.vendor} is unreliable. It matched ${((seedResult.rate || 0) * 100).toFixed(1)}% of the known fake IDs.`,
    });
  } else {
    flags.push({
      code: "seed",
      message: `Seed check: insert ${seeds.seedCount} known fake IDs (${(seedRate * 100).toFixed(1)}% of ${row.size}). A vendor that matches more than ${(config.seedMatchMaxPercent * 100).toFixed(0)}% of them is unreliable. Nothing is sent.`,
    });
  }
  const holdoutCount = Math.max(0, Math.round(row.size * config.holdoutPercent));
  const lift = incrementalLift({
    exposedConversions: row.exposedConversions ?? 0,
    exposedSize: row.exposedSize ?? 0,
    holdoutConversions: row.holdoutConversions ?? 0,
    holdoutSize: row.holdoutSize ?? 0,
  });
  flags.push({
    code: "holdout",
    message: row.holdoutSize
      ? `Holdout: ${holdoutCount} of ${row.size} (${(config.holdoutPercent * 100).toFixed(0)}%) see no ads. ${lift.message}`
      : `Holdout: ${holdoutCount} of ${row.size} (${(config.holdoutPercent * 100).toFixed(0)}%) see no ads. Incremental lift is reported against that group.`,
  });
  for (const platform of row.platforms) {
    if (platform.platform !== "google_customer_match" || platform.uploaded <= 0) continue;
    const sanity = googleMatchSanity(platform.matched / platform.uploaded, config);
    if (sanity.flagged && sanity.message) flags.push({ code: "google_match", message: sanity.message });
  }
  if (parseConsentOrigin(row.consentOrigin) === "upstream_supplier") {
    flags.push({
      code: "consent",
      message: `Upstream-only consent for ${row.vendor} list ${row.listId} is flagged for compliance review.`,
    });
  }
  if (isBrokeredAudienceSource(row.source)) {
    flags.push({ code: "google_policy", message: GOOGLE_POLICY_WARNING });
  }
  return flags;
}

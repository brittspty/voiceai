/**
 * Shared audience taxonomy.
 * The audience library imports this module. Do not redefine these values elsewhere.
 * platform_native is a reported source, not a targetable audience and not a test arm.
 * Verified conversions do not consult the parked traffic-quality work.
 */

export const AUDIENCE_SOURCES = ["maid_market", "pixel_pool", "crm_first_party", "platform_native"] as const;
export type AudienceSource = (typeof AUDIENCE_SOURCES)[number];

/** A conversion source that is not an audience-library list. */
export const VERIFIED_HUMAN_SOURCE = "verified_human_source" as const;
export type VerifiedHumanSource = typeof VERIFIED_HUMAN_SOURCE;
export type ConversionOrigin = AudienceSource | VerifiedHumanSource;

export const DRILL_LEVELS = ["audience_source", "intent", "geo", "demographics", "behavior"] as const;
export type DrillLevel = (typeof DRILL_LEVELS)[number];

/** One attribute family per drill level. audience_source is the top level. */
export const DRILL_ATTRIBUTES: Record<DrillLevel, readonly string[]> = {
  audience_source: AUDIENCE_SOURCES,
  intent: ["in_market", "recency"],
  geo: ["state", "dma", "zip"],
  demographics: ["age_band", "income", "homeowner"],
  behavior: ["site_engagement", "email_engagement"],
};

export const AUDIENCE_SOURCE_LABELS: Record<AudienceSource, string> = {
  maid_market: "MAID list",
  pixel_pool: "Pixel pool",
  crm_first_party: "CRM first party",
  platform_native: "Platform reported",
};

export function isAudienceSource(value: string): value is AudienceSource {
  return (AUDIENCE_SOURCES as readonly string[]).includes(value);
}

/** platform_native cannot be targeted and cannot be a test arm. */
export function isTargetableAudienceSource(source: AudienceSource) {
  return source !== "platform_native";
}

export type MaidListRef = { vendor: string; listId: string };

export function maidListComplete(ref: { vendor?: string | null; listId?: string | null }) {
  return Boolean(ref.vendor?.trim() && ref.listId?.trim());
}

export type MaidArm = {
  key: string;
  audienceSource: "maid_market";
  vendor: string;
  listId: string;
  subSegmentKey: string;
  role: "treatment" | "control";
};

export type ControlKind = "current_best" | "chosen_baseline";

/**
 * Head-to-head tests compare MAID lists, vendors, and sub-segments.
 * The control is the current best list, or a list someone chose as the baseline.
 */
export function maidTestArms(input: {
  treatment: MaidListRef & { subSegmentKey?: string };
  control: MaidListRef & { subSegmentKey?: string; kind: ControlKind };
}): { kind: ControlKind; arms: [MaidArm, MaidArm] } {
  if (!maidListComplete(input.treatment) || !maidListComplete(input.control)) {
    throw new Error("A MAID test needs a vendor and a list id on every arm.");
  }
  const treatmentSub = input.treatment.subSegmentKey?.trim() || "";
  const controlSub = input.control.subSegmentKey?.trim() || "";
  const sameList = input.treatment.vendor.trim() === input.control.vendor.trim() && input.treatment.listId.trim() === input.control.listId.trim();
  if (sameList && treatmentSub === controlSub) {
    throw new Error("Head-to-head arms must differ by list, vendor, or sub-segment.");
  }
  return {
    kind: input.control.kind,
    arms: [
      {
        key: "treatment",
        audienceSource: "maid_market",
        vendor: input.treatment.vendor.trim(),
        listId: input.treatment.listId.trim(),
        subSegmentKey: treatmentSub,
        role: "treatment",
      },
      {
        key: "control",
        audienceSource: "maid_market",
        vendor: input.control.vendor.trim(),
        listId: input.control.listId.trim(),
        subSegmentKey: controlSub,
        role: "control",
      },
    ],
  };
}

export function assertMaidTestArm(source: string) {
  if (source !== "maid_market") {
    throw new Error("Head-to-head tests compare MAID lists. This source is not a test arm.");
  }
}

export type RankedList = {
  audienceSource: AudienceSource;
  listId: string;
  vendor: string;
  conversionRate: number;
  quality: number;
};

/** Control is a chosen baseline list, otherwise the current best MAID list. */
export function chooseControlList(lists: RankedList[], chosen?: MaidListRef | null): (MaidListRef & { kind: ControlKind }) | null {
  const maid = lists.filter((list) => list.audienceSource === "maid_market" && maidListComplete(list));
  if (chosen?.listId && chosen.vendor) {
    const match = maid.find((list) => list.listId === chosen.listId.trim() && list.vendor === chosen.vendor.trim());
    if (!match) return null;
    return { kind: "chosen_baseline", listId: match.listId, vendor: match.vendor };
  }
  const best = [...maid].sort((a, b) => b.conversionRate - a.conversionRate || b.quality - a.quality)[0];
  if (!best) return null;
  return { kind: "current_best", listId: best.listId, vendor: best.vendor };
}

export type ConversionCheck = {
  audienceSource: ConversionOrigin;
  duplicate: boolean;
  contactValid: boolean;
};

/**
 * A conversion is verified when it comes from a verified human source or a MAID audience
 * and it passes dedupe and contact checks. No other source qualifies.
 */
export function isVerifiedConversion(input: ConversionCheck) {
  const sourceOk = input.audienceSource === VERIFIED_HUMAN_SOURCE || input.audienceSource === "maid_market";
  return sourceOk && input.duplicate === false && input.contactValid === true;
}

export type LineageFields = {
  audienceSource: AudienceSource;
  vendor: string;
  listId: string;
  intent: string;
  geo: string;
  demographics: string;
  behavior: string;
  segmentKey: string;
  subSegmentKey: string;
  audienceKey: string;
  duplicate: boolean;
  contactValid: boolean;
};

/** Lineage always carries list id and vendor. MAID rows must have both filled in. */
export function buildLineage(input: LineageFields) {
  if (!isAudienceSource(input.audienceSource)) throw new Error("Unknown audience source.");
  const vendor = input.vendor.trim();
  const listId = input.listId.trim();
  if (input.audienceSource === "maid_market" && !maidListComplete({ vendor, listId })) {
    throw new Error("MAID lineage needs a vendor and a list id.");
  }
  return {
    audienceSource: input.audienceSource,
    vendor,
    listId,
    intent: input.intent.trim(),
    geo: input.geo.trim(),
    demographics: input.demographics.trim(),
    behavior: input.behavior.trim(),
    segmentKey: input.segmentKey.trim(),
    subSegmentKey: input.subSegmentKey.trim(),
    audienceKey: input.audienceKey.trim(),
    duplicate: input.duplicate,
    contactValid: input.contactValid,
    verified: isVerifiedConversion({
      audienceSource: input.audienceSource,
      duplicate: input.duplicate,
      contactValid: input.contactValid,
    }),
  };
}

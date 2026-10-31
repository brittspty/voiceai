import { hashEmailIdentifier, hashMaid, hashPhoneIdentifier, normalizeMaid } from "./maid";
import { isMaidComparisonSource, type AudienceSource } from "../segment-taxonomy";

export type PixelEvent = {
  audienceId: string;
  visitorId: string;
  eventName: string;
  occurredAt: string;
};

export type ConversionDraft = {
  audienceId: string;
  source: AudienceSource;
  visitorId: string;
  externalId: string;
  kind: "lead" | "sale";
  qualified: boolean;
  maid?: string;
  idType?: "idfa" | "gaid";
  email?: string;
  phone?: string;
  emailSha256?: string;
  phoneSha256?: string;
};

export type AttributedConversion = {
  audienceId: string;
  dedupeKey: string;
  contactHash: string;
  status: "verified" | "unverified";
  reason: string;
  kind: "lead" | "sale";
  qualified: boolean;
};

export function audienceQuery(audienceId: string, listId: string) {
  const params = new URLSearchParams({
    aud: audienceId,
    utm_source: "maid",
    utm_medium: "audience",
    utm_campaign: listId,
    utm_content: audienceId,
  });
  return params.toString();
}

export function audienceIdFromSearch(search: string) {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const aud = params.get("aud")?.trim() || "";
  if (aud) return aud;
  const content = params.get("utm_content")?.trim() || "";
  return content || null;
}

export function retargetingPool(events: PixelEvent[], audienceId: string) {
  const visitors = new Set<string>();
  for (const event of events) {
    if (event.audienceId !== audienceId) continue;
    const visitor = event.visitorId.trim();
    if (visitor) visitors.add(visitor);
  }
  return [...visitors].sort();
}

function contactHash(draft: ConversionDraft) {
  if (draft.maid && (draft.idType === "idfa" || draft.idType === "gaid")) {
    const normalized = normalizeMaid(draft.maid, draft.idType);
    if (normalized) return hashMaid(normalized);
  }
  const email = hashEmailIdentifier(draft.emailSha256 || draft.email || "");
  if (email) return email;
  const phone = hashPhoneIdentifier(draft.phoneSha256 || draft.phone || "");
  if (phone) return phone;
  return "";
}

/**
 * A MAID-campaign conversion is verified human after it passes a contact check
 * and is not a duplicate. Platform-native and other sources stay unverified.
 */
export function attributeConversion(draft: ConversionDraft, seen: Set<string>): AttributedConversion {
  const contact = contactHash(draft);
  const external = draft.externalId.trim();
  const dedupeKey = `${draft.audienceId}:${external || draft.visitorId.trim()}:${contact}`;
  if (!isMaidComparisonSource(draft.source)) {
    return {
      audienceId: draft.audienceId,
      dedupeKey,
      contactHash: contact,
      status: "unverified",
      reason: "Only a data-market MAID campaign conversion counts as verified human.",
      kind: draft.kind,
      qualified: false,
    };
  }
  if (!contact) {
    return {
      audienceId: draft.audienceId,
      dedupeKey,
      contactHash: "",
      status: "unverified",
      reason: "Contact check failed.",
      kind: draft.kind,
      qualified: false,
    };
  }
  if (seen.has(dedupeKey)) {
    return {
      audienceId: draft.audienceId,
      dedupeKey,
      contactHash: contact,
      status: "unverified",
      reason: "Duplicate conversion.",
      kind: draft.kind,
      qualified: false,
    };
  }
  seen.add(dedupeKey);
  return {
    audienceId: draft.audienceId,
    dedupeKey,
    contactHash: contact,
    status: "verified",
    reason: "Deduped MAID conversion with a contact check.",
    kind: draft.kind,
    qualified: draft.qualified,
  };
}

export function attributeConversions(drafts: ConversionDraft[]) {
  const seen = new Set<string>();
  return drafts.map((draft) => attributeConversion(draft, seen));
}

export function countVerified(rows: AttributedConversion[]) {
  return rows.filter((row) => row.status === "verified").length;
}

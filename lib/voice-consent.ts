import type { ConsentLevel } from "./types";

export const AVERY_DIAL_TAG = "avery_dial_ok";
/** Avery's outbound voice calls need at least this tier. A stricter published minimum still wins. */
export const VOICE_CONSENT_FLOOR: ConsentLevel = "medium";

export type ConsentScope = "scheduling only" | "product/service conversation";

export type GhlConsent = {
  tier: ConsentLevel | null;
  /** Null when the payload did not include consent_revoked. */
  revoked: boolean | null;
  tags: string[];
  tagsProvided: boolean;
  averyDialOk: boolean;
  scope: ConsentScope | null;
};

const TIERS = new Set<ConsentLevel>(["none", "low", "medium", "high"]);

export function consentScopeFor(tier: ConsentLevel | null, revoked = false): ConsentScope | null {
  if (revoked) return null;
  if (tier === "medium") return "scheduling only";
  if (tier === "high") return "product/service conversation";
  return null;
}

export function hasAveryDialTag(tags: readonly string[]) {
  return tags.some((tag) => tag.trim().toLowerCase() === AVERY_DIAL_TAG);
}

export function readGhlConsent(body: unknown): GhlConsent {
  const fields = new Map<string, string>();
  const tags: string[] = [];
  let tagsProvided = false;
  const root = asRecord(body);
  collect(root, fields, tags, (known) => {
    tagsProvided = tagsProvided || known;
  });
  const contact = asRecord(root.contact);
  if (Object.keys(contact).length) {
    collect(contact, fields, tags, (known) => {
      tagsProvided = tagsProvided || known;
    });
  }
  const tierRaw = fields.get("consent_tier")?.toLowerCase();
  const tier = tierRaw && TIERS.has(tierRaw as ConsentLevel) ? (tierRaw as ConsentLevel) : null;
  const revoked = fields.has("consent_revoked") ? truthy(fields.get("consent_revoked")) : null;
  const uniqueTags = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
  return {
    tier,
    revoked,
    tags: uniqueTags,
    tagsProvided,
    averyDialOk: hasAveryDialTag(uniqueTags),
    scope: consentScopeFor(tier, Boolean(revoked)),
  };
}

function collect(record: Record<string, unknown>, fields: Map<string, string>, tags: string[], onTags: (known: boolean) => void) {
  for (const [key, value] of Object.entries(record)) {
    const norm = normalizeKey(key);
    if (norm === "tags" && Array.isArray(value)) {
      onTags(true);
      for (const tag of value) tags.push(String(tag));
      continue;
    }
    if (norm === "customfields" || norm === "customfield" || norm === "custom_fields") {
      readCustom(value, fields);
      continue;
    }
    if ((norm === "consent_tier" || norm === "consent_revoked") && isScalar(value)) {
      fields.set(norm, String(value).trim());
    }
  }
}

function readCustom(value: unknown, fields: Map<string, string>) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const row = asRecord(item);
      const key = row.key ?? row.fieldKey ?? row.field_key ?? row.name;
      const raw = row.value ?? row.field_value ?? row.fieldValue;
      if (typeof key === "string" && isScalar(raw)) fields.set(normalizeKey(key), String(raw).trim());
    }
    return;
  }
  const record = asRecord(value);
  for (const [key, raw] of Object.entries(record)) {
    if (isScalar(raw)) fields.set(normalizeKey(key), String(raw).trim());
  }
}

function normalizeKey(key: string) {
  return key
    .trim()
    .toLowerCase()
    .replace(/^contact\./, "")
    .replace(/^custom\./, "")
    .replace(/\s+/g, "_");
}

function truthy(value: string | undefined) {
  return ["true", "1", "yes", "y", "revoked"].includes((value || "").trim().toLowerCase());
}

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

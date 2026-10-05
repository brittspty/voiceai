import { consentFieldConfig, type ConsentFieldConfig, type Env } from "./client-config";
import { normalizePhone } from "./phone";
import type { GateCheckView } from "./types";

/** ElevenLabs dynamic variable. Medium sends `scheduling_only`. High sends `full`. */
export const CONSENT_SCOPE_VARIABLE = "consent_scope";

export const CONSENT_SCOPES = ["scheduling_only", "full"] as const;
export type ConsentScope = (typeof CONSENT_SCOPES)[number];

export type ConsentTier = "low" | "medium" | "high";

export type GhlFieldDef = { id: string; fieldKey: string };

export type GhlFetcher = (path: string, init?: RequestInit) => Promise<unknown>;

export type FieldCache = {
  get(locationId: string): Promise<GhlFieldDef[] | null>;
  set(locationId: string, fields: GhlFieldDef[], ttlMs: number): Promise<void>;
};

export type ConsentSnapshot = {
  unreadable: boolean;
  unreadableReason?: string;
  tierRaw: string | null;
  revokedAt: string | null;
  purpose: string | null;
  timestamp: string | null;
  sourceUrl: string | null;
  version: string | null;
  phone: string | null;
  method: string | null;
  ip: string | null;
  userAgent: string | null;
  cookieCategories: string | null;
  tags: string[];
};

export type ConsentDecision = {
  allow: boolean;
  scope: ConsentScope | null;
  tier: ConsentTier;
  reason: string;
  revoked: boolean;
  phoneMismatch: boolean;
  dialOkTag: boolean;
  version: string | null;
  timestamp: string | null;
  purpose: string | null;
  sourceUrl: string | null;
  method: string | null;
  ip: string | null;
  userAgent: string | null;
  cookieCategories: string | null;
  consentPhone: string | null;
};

export type ConsentReviewInput = {
  ghlContactId: string | null;
  phone: string;
  storedConsent: string | null;
  mocked: boolean;
};

const FIELD_NAMES = [
  "tier",
  "revokedAt",
  "purpose",
  "timestamp",
  "sourceUrl",
  "version",
  "phone",
  "method",
  "ip",
  "userAgent",
  "cookieCategories",
] as const;

type FieldName = (typeof FIELD_NAMES)[number];

export function consentSnapshot(partial: Partial<ConsentSnapshot> = {}): ConsentSnapshot {
  return {
    unreadable: false,
    tierRaw: null,
    revokedAt: null,
    purpose: null,
    timestamp: null,
    sourceUrl: null,
    version: null,
    phone: null,
    method: null,
    ip: null,
    userAgent: null,
    cookieCategories: null,
    tags: [],
    ...partial,
  };
}

export function unreadableSnapshot(reason: string): ConsentSnapshot {
  return consentSnapshot({ unreadable: true, unreadableReason: reason, tierRaw: null });
}

/** Test-mode stand-in used only when the contact has no GoHighLevel id and the voice port is mocked. */
export function snapshotFromStoredConsent(consent: string | null): ConsentSnapshot {
  const tierRaw = consent === "low" || consent === "medium" || consent === "high" ? consent : "";
  return consentSnapshot({ tierRaw });
}

export function tierToStoredConsent(tier: ConsentTier): "low" | "medium" | "high" {
  return tier;
}

export function isConsentScope(value: string | null | undefined): value is ConsentScope {
  return value === "scheduling_only" || value === "full";
}

function blankToNull(value: string | null | undefined) {
  const text = (value ?? "").trim();
  return text ? text : null;
}

function clip(value: string, max = 80) {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function stamp(reason: string, version: string | null, timestamp: string | null) {
  return `${reason} Consent version ${version?.trim() || "none"}. Consent timestamp ${timestamp?.trim() || "none"}.`;
}

function tagHit(tags: string[], expected: string) {
  const needle = expected.trim().toLowerCase();
  if (!needle) return false;
  return tags.some((tag) => tag.trim().toLowerCase() === needle);
}

export function decideConsent(
  snapshot: ConsentSnapshot,
  dialPhone: string,
  config: Pick<ConsentFieldConfig, "revokedTag" | "dialOkTag"> = {
    revokedTag: "consent_revoked",
    dialOkTag: "avery_dial_ok",
  },
): ConsentDecision {
  const version = blankToNull(snapshot.version);
  const timestamp = blankToNull(snapshot.timestamp);
  const dialOkTag = tagHit(snapshot.tags, config.dialOkTag);
  const base = {
    version,
    timestamp,
    purpose: blankToNull(snapshot.purpose),
    sourceUrl: blankToNull(snapshot.sourceUrl),
    method: blankToNull(snapshot.method),
    ip: blankToNull(snapshot.ip),
    userAgent: blankToNull(snapshot.userAgent),
    cookieCategories: blankToNull(snapshot.cookieCategories),
    consentPhone: blankToNull(snapshot.phone),
    dialOkTag,
  };

  const finish = (input: {
    allow: boolean;
    scope: ConsentScope | null;
    tier: ConsentTier;
    reason: string;
    revoked: boolean;
    phoneMismatch: boolean;
  }): ConsentDecision => {
    const note = !input.allow && dialOkTag ? ` The ${config.dialOkTag} tag is informational and does not override this decision.` : "";
    return {
      ...base,
      ...input,
      reason: stamp(`${input.reason}${note}`, version, timestamp),
    };
  };

  if (snapshot.unreadable) {
    const why = snapshot.unreadableReason?.trim() || "the contact could not be read";
    return finish({
      allow: false,
      scope: null,
      tier: "low",
      revoked: false,
      phoneMismatch: false,
      reason: `GoHighLevel consent could not be read (${clip(why)}). Treated as Low. Call not placed.`,
    });
  }

  const revokedAt = blankToNull(snapshot.revokedAt);
  const tagRevoked = tagHit(snapshot.tags, config.revokedTag);
  const phoneMismatch = consentPhoneMismatches(snapshot.phone, dialPhone);
  const parsed = parseTier(snapshot.tierRaw);
  const tier: ConsentTier = parsed === "medium" || parsed === "high" ? parsed : "low";

  if (revokedAt) {
    return finish({
      allow: false,
      scope: null,
      tier,
      revoked: true,
      phoneMismatch,
      reason: `Consent was revoked (${clip(revokedAt)}). This number is do-not-call. Call not placed.`,
    });
  }
  if (tagRevoked) {
    return finish({
      allow: false,
      scope: null,
      tier,
      revoked: true,
      phoneMismatch,
      reason: `Contact has the ${config.revokedTag} tag. This number is do-not-call. Call not placed.`,
    });
  }
  if (parsed === "missing") {
    return finish({
      allow: false,
      scope: null,
      tier: "low",
      revoked: false,
      phoneMismatch,
      reason: "Consent tier is missing. Treated as Low. Call not placed.",
    });
  }
  if (parsed === "unknown") {
    return finish({
      allow: false,
      scope: null,
      tier: "low",
      revoked: false,
      phoneMismatch,
      reason: `Consent tier "${clip(snapshot.tierRaw || "")}" is not Low, Medium, or High. Treated as Low. Call not placed.`,
    });
  }
  if (parsed === "low") {
    return finish({
      allow: false,
      scope: null,
      tier: "low",
      revoked: false,
      phoneMismatch,
      reason: "Consent tier is Low (cookie consent only). Call not placed.",
    });
  }
  if (phoneMismatch) {
    return finish({
      allow: false,
      scope: null,
      tier,
      revoked: false,
      phoneMismatch: true,
      reason: "Consent phone does not match the number being dialed. Call not placed.",
    });
  }
  if (parsed === "medium") {
    return finish({
      allow: true,
      scope: "scheduling_only",
      tier: "medium",
      revoked: false,
      phoneMismatch: false,
      reason: "Consent tier is Medium. Voice is allowed for scheduling only: confirm interest and book an appointment. No product or service discussion.",
    });
  }
  return finish({
    allow: true,
    scope: "full",
    tier: "high",
    revoked: false,
    phoneMismatch: false,
    reason: "Consent tier is High. Full conversational AI is allowed: product and service detail, plus scheduling.",
  });
}

function parseTier(raw: string | null): ConsentTier | "missing" | "unknown" {
  if (raw == null) return "missing";
  const text = raw.trim().toLowerCase();
  if (!text) return "missing";
  if (text === "low" || text === "medium" || text === "high") return text;
  return "unknown";
}

export function consentPhoneMismatches(consentPhone: string | null, dialPhone: string) {
  const raw = (consentPhone ?? "").trim();
  if (!raw) return false;
  const consented = normalizePhone(raw);
  const dial = normalizePhone(dialPhone);
  if (!consented || !dial || consented !== dial) return true;
  return false;
}

export function consentAuditAction(decision: ConsentDecision) {
  const version = decision.version?.trim() || "none";
  const timestamp = decision.timestamp?.trim() || "none";
  if (decision.allow) {
    return `Consent check allowed a call (tier ${decision.tier}, scope ${decision.scope}, version ${version}, timestamp ${timestamp})`;
  }
  return `Consent check skipped a call (tier ${decision.tier}, reason ${decision.reason}, version ${version}, timestamp ${timestamp})`;
}

export function consentAuditDetail(decision: ConsentDecision) {
  return {
    tier: decision.tier,
    reason: decision.reason,
    allow: decision.allow,
    scope: decision.scope,
    consentVersion: decision.version,
    consentTimestamp: decision.timestamp,
    consentPurpose: decision.purpose,
    consentSourceUrl: decision.sourceUrl,
    consentMethod: decision.method,
    consentIp: decision.ip,
    consentUserAgent: decision.userAgent,
    cookieConsentCategories: decision.cookieCategories,
    consentPhone: decision.consentPhone,
    revoked: decision.revoked,
    phoneMismatch: decision.phoneMismatch,
    dialOkTag: decision.dialOkTag,
    dynamicVariable: CONSENT_SCOPE_VARIABLE,
  };
}

export function mergeConsentGate(checks: GateCheckView[], decision: ConsentDecision): GateCheckView[] {
  return [
    {
      id: "consent",
      label: "Consent",
      passed: decision.allow && isConsentScope(decision.scope),
      detail: decision.reason,
    },
    ...checks.filter((check) => check.id !== "consent"),
  ];
}

export function queueConsentView(input: {
  mocked: boolean;
  ghlContactId: string | null;
  storedConsent: string | null;
  phone: string;
  consentCheckedAt: Date | null;
  consentHoldReason: string | null;
  consentScope: string | null;
  config?: Pick<ConsentFieldConfig, "revokedTag" | "dialOkTag">;
}): { status: "Eligible" | "Skipped" | "Held"; blocked: boolean; reason: string } {
  if (input.consentCheckedAt) {
    if (input.consentHoldReason) {
      return { status: "Skipped", blocked: true, reason: input.consentHoldReason };
    }
    if (input.consentScope === "scheduling_only") {
      return {
        status: "Eligible",
        blocked: false,
        reason: "GoHighLevel consent is Medium. Scheduling only: confirm interest and book an appointment. No product or service discussion.",
      };
    }
    if (input.consentScope === "full") {
      return {
        status: "Eligible",
        blocked: false,
        reason: "GoHighLevel consent is High. Full conversation and scheduling are allowed.",
      };
    }
    return {
      status: "Skipped",
      blocked: true,
      reason: stamp("GoHighLevel consent scope was missing. Treated as Low. Call not placed.", null, null),
    };
  }
  if (input.mocked && !input.ghlContactId) {
    const decision = decideConsent(snapshotFromStoredConsent(input.storedConsent), input.phone, input.config);
    return {
      status: decision.allow ? "Eligible" : "Skipped",
      blocked: !decision.allow,
      reason: decision.reason,
    };
  }
  return {
    status: "Held",
    blocked: true,
    reason: stamp("GoHighLevel consent has not been read. Treated as Low. Call not placed.", null, null),
  };
}

export function keysMatch(fieldKey: string, configured: string) {
  const left = fieldKey.trim().toLowerCase();
  const right = configured.trim().toLowerCase();
  if (!left || !right) return false;
  if (left === right) return true;
  if (left === `contact.${right}`) return true;
  if (right === `contact.${left}`) return true;
  return false;
}

export function parseCustomFieldDefs(payload: unknown): { ok: true; fields: GhlFieldDef[] } | { ok: false; reason: string } {
  const list = customFieldArray(payload);
  if (!list) return { ok: false, reason: "custom field list was unreadable" };
  const fields: GhlFieldDef[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = stringValue(row.id);
    const fieldKey = stringValue(row.fieldKey) || stringValue(row.field_key) || stringValue(row.key);
    if (id && fieldKey) fields.push({ id, fieldKey });
  }
  return { ok: true, fields };
}

function customFieldArray(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  for (const key of ["customFields", "customField", "fields"]) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  return null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function resolveFieldIds(fields: GhlFieldDef[], config: ConsentFieldConfig): Record<FieldName, string | null> {
  const ids = {} as Record<FieldName, string | null>;
  for (const name of FIELD_NAMES) {
    const key = config[name];
    const match = fields.find((field) => keysMatch(field.fieldKey, key));
    ids[name] = match?.id ?? null;
  }
  return ids;
}

export function createMemoryFieldCache(now = () => Date.now()): FieldCache {
  const store = new Map<string, { expires: number; fields: GhlFieldDef[] }>();
  return {
    async get(locationId) {
      const hit = store.get(locationId);
      if (!hit) return null;
      if (hit.expires <= now()) {
        store.delete(locationId);
        return null;
      }
      return hit.fields;
    },
    async set(locationId, fields, ttlMs) {
      store.set(locationId, { fields, expires: now() + ttlMs });
    },
  };
}

export async function loadConsentSnapshot(input: {
  contactId: string;
  locationId: string;
  config: ConsentFieldConfig;
  fetchImpl: GhlFetcher;
  cache?: FieldCache;
}): Promise<ConsentSnapshot> {
  const cache = input.cache ?? createMemoryFieldCache();
  let fields: GhlFieldDef[];
  try {
    const cached = await cache.get(input.locationId);
    if (cached) {
      fields = cached;
    } else {
      const payload = await input.fetchImpl(`/locations/${encodeURIComponent(input.locationId)}/customFields?model=contact`);
      const parsed = parseCustomFieldDefs(payload);
      if (!parsed.ok) return unreadableSnapshot(`GoHighLevel custom fields: ${parsed.reason}`);
      fields = parsed.fields;
      await cache.set(input.locationId, fields, input.config.cacheTtlMs);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "custom fields request failed";
    return unreadableSnapshot(`GoHighLevel custom fields request failed: ${message}`);
  }

  const ids = resolveFieldIds(fields, input.config);
  if (!ids.tier) {
    return unreadableSnapshot(`custom field ${input.config.tier} was not found on this GoHighLevel location`);
  }
  if (!ids.revokedAt) {
    return unreadableSnapshot(`custom field ${input.config.revokedAt} was not found on this GoHighLevel location`);
  }

  let payload: unknown;
  try {
    payload = await input.fetchImpl(`/contacts/${encodeURIComponent(input.contactId)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "contact request failed";
    return unreadableSnapshot(`GoHighLevel contact request failed: ${message}`);
  }
  return snapshotFromContactPayload(payload, ids);
}

export function snapshotFromContactPayload(payload: unknown, ids: Record<FieldName, string | null>): ConsentSnapshot {
  const contact = unwrapContact(payload);
  if (!contact) return unreadableSnapshot("GoHighLevel contact payload was unreadable");
  if (!("customFields" in contact) && !("customField" in contact)) {
    return unreadableSnapshot("GoHighLevel contact did not include custom fields");
  }
  const values = customFieldValues(contact);
  if (!values) return unreadableSnapshot("GoHighLevel contact custom fields were unreadable");
  return consentSnapshot({
    tierRaw: lookupValue(values, ids.tier),
    revokedAt: lookupValue(values, ids.revokedAt),
    purpose: lookupValue(values, ids.purpose),
    timestamp: lookupValue(values, ids.timestamp),
    sourceUrl: lookupValue(values, ids.sourceUrl),
    version: lookupValue(values, ids.version),
    phone: lookupValue(values, ids.phone),
    method: lookupValue(values, ids.method),
    ip: lookupValue(values, ids.ip),
    userAgent: lookupValue(values, ids.userAgent),
    cookieCategories: lookupValue(values, ids.cookieCategories),
    tags: readTags(contact),
  });
}

function unwrapContact(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  if (obj.contact && typeof obj.contact === "object") return obj.contact as Record<string, unknown>;
  if ("id" in obj || "customFields" in obj || "tags" in obj || "customField" in obj) return obj;
  return null;
}

function customFieldValues(contact: Record<string, unknown>): Map<string, string | null> | null {
  const raw = contact.customFields ?? contact.customField;
  const map = new Map<string, string | null>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const id = stringValue(row.id) || stringValue(row.fieldId) || stringValue(row.customFieldId);
      if (!id) continue;
      const value = row.value ?? row.fieldValue ?? row.field_value;
      map.set(id, customFieldToString(value));
    }
    return map;
  }
  if (raw && typeof raw === "object") {
    for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
      map.set(id, customFieldToString(value));
    }
    return map;
  }
  return null;
}

function customFieldToString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => customFieldToString(item) ?? "")
      .filter(Boolean)
      .join(", ");
  }
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function lookupValue(values: Map<string, string | null>, id: string | null) {
  if (!id) return null;
  if (!values.has(id)) return null;
  return values.get(id) ?? null;
}

function readTags(contact: Record<string, unknown>) {
  const raw = contact.tags;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object" && "name" in item && typeof (item as { name?: unknown }).name === "string") {
        return String((item as { name: string }).name).trim();
      }
      return "";
    })
    .filter(Boolean);
}

function ghlReady(env: Env) {
  return Boolean(env.GHL_API_KEY?.trim() && env.GHL_LOCATION_ID?.trim());
}

export async function reviewContactConsent(
  input: ConsentReviewInput,
  deps: { env?: Env; fetchImpl?: GhlFetcher; cache?: FieldCache } = {},
): Promise<ConsentDecision> {
  const env = deps.env ?? process.env;
  const config = consentFieldConfig(env);
  const tags = { revokedTag: config.revokedTag, dialOkTag: config.dialOkTag };
  if (input.ghlContactId) {
    if (!ghlReady(env)) {
      return decideConsent(unreadableSnapshot("GoHighLevel API key or location id is missing"), input.phone, tags);
    }
    const fetchImpl = deps.fetchImpl ?? (await import("./adapters")).ghlFetch;
    const snapshot = await loadConsentSnapshot({
      contactId: input.ghlContactId,
      locationId: env.GHL_LOCATION_ID?.trim() || "",
      config,
      fetchImpl,
      cache: deps.cache,
    });
    return decideConsent(snapshot, input.phone, tags);
  }
  if (input.mocked) {
    return decideConsent(snapshotFromStoredConsent(input.storedConsent), input.phone, tags);
  }
  return decideConsent(unreadableSnapshot("GoHighLevel contact id is missing"), input.phone, tags);
}

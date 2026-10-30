import { ATTRIBUTION_KEYS, emptyAttribution, type Attribution, type AttributionKey } from "./types";

const KEY_MAP: Record<string, AttributionKey> = {
  fbclid: "fbclid",
  fbc: "fbc",
  fbp: "fbp",
  gclid: "gclid",
  gbraid: "gbraid",
  wbraid: "wbraid",
  utm_source: "utmSource",
  utmsource: "utmSource",
  utm_medium: "utmMedium",
  utmmedium: "utmMedium",
  utm_campaign: "utmCampaign",
  utmcampaign: "utmCampaign",
  utm_term: "utmTerm",
  utmterm: "utmTerm",
  utm_content: "utmContent",
  utmcontent: "utmContent",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function applyPair(target: Attribution, key: string, value: unknown) {
  const mapped = KEY_MAP[key.trim().toLowerCase().replace(/\s+/g, "")];
  if (!mapped) return;
  const text = asText(value);
  if (text && !target[mapped]) target[mapped] = text.slice(0, 500);
}

function absorbUrl(target: Attribution, value: string) {
  if (!/https?:\/\//i.test(value) && !value.includes("?")) return;
  try {
    const url = value.startsWith("http") ? new URL(value) : new URL(`https://placeholder.local/?${value.replace(/^\?/, "")}`);
    for (const [key, item] of url.searchParams.entries()) applyPair(target, key, item);
  } catch {
    return;
  }
}

function walk(target: Attribution, value: unknown, depth: number) {
  if (depth > 6 || value == null) return;
  if (typeof value === "string") {
    absorbUrl(target, value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const row = asRecord(item);
      if (row) {
        const key = asText(row.key || row.fieldKey || row.name || row.id);
        if (key && "value" in row) applyPair(target, key, row.value);
        else if (key && "field_value" in row) applyPair(target, key, row.field_value);
      }
      walk(target, item, depth + 1);
    }
    return;
  }
  const row = asRecord(value);
  if (!row) return;
  for (const [key, child] of Object.entries(row)) {
    applyPair(target, key, child);
    walk(target, child, depth + 1);
  }
}

export function extractAttribution(...sources: unknown[]): Attribution {
  const target = emptyAttribution();
  for (const source of sources) walk(target, source, 0);
  return target;
}

export function mergeAttribution(current: Attribution, next: Attribution): Attribution {
  const merged = { ...current };
  for (const key of ATTRIBUTION_KEYS) {
    if (!merged[key] && next[key]) merged[key] = next[key];
  }
  return merged;
}

/** Meta's click cookie. Built only when the landing page sent fbclid and not fbc. */
export function withFbc(attribution: Attribution, occurredAtMs: number): Attribution {
  if (attribution.fbc || !attribution.fbclid) return attribution;
  const stamp = Number.isFinite(occurredAtMs) ? Math.floor(occurredAtMs) : Date.now();
  return { ...attribution, fbc: `fb.1.${stamp}.${attribution.fbclid}` };
}

export function attributionColumns(attribution: Attribution): Partial<Attribution> {
  const data: Partial<Attribution> = {};
  for (const key of ATTRIBUTION_KEYS) {
    if (attribution[key]) data[key] = attribution[key];
  }
  return data;
}

export type ParsedOpportunity = {
  event: string;
  locationId: string;
  opportunityId: string;
  stageId: string;
  stageName: string;
  valueCents: number | null;
  currency: string;
  occurredAt: string;
  contact: {
    ghlId: string;
    name: string;
    phone: string;
    email: string;
  };
  attribution: Attribution;
};

function moneyToCents(value: unknown) {
  const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 1_000_000) return null;
  return Math.round(numeric * 100);
}

export function isOpportunityBody(body: unknown) {
  const root = asRecord(body);
  if (!root) return false;
  const event = asText(root.type || root.event || root.typeName);
  if (/opportunit/i.test(event)) return true;
  const opportunity = asRecord(root.opportunity) ?? root;
  return Boolean(asText(opportunity.pipelineStageId || opportunity.pipelineStage || opportunity.opportunityStageId));
}

export function parseOpportunity(body: unknown, now = new Date()): ParsedOpportunity | null {
  if (!isOpportunityBody(body)) return null;
  const root = asRecord(body) ?? {};
  const opportunity = asRecord(root.opportunity) ?? root;
  const contact = asRecord(root.contact) ?? asRecord(opportunity.contact) ?? {};
  const opportunityId = asText(opportunity.id || opportunity.opportunityId || root.opportunityId || root.id);
  if (!opportunityId || opportunityId === asText(contact.id)) return null;
  const stage = asRecord(opportunity.pipelineStage) ?? asRecord(opportunity.stage) ?? {};
  const stageId = asText(opportunity.pipelineStageId || opportunity.stageId || stage.id || root.pipelineStageId);
  const stageName = asText(
    opportunity.pipelineStageName || opportunity.stageName || stage.name || opportunity.status || root.pipelineStageName,
  );
  const occurredRaw = asText(opportunity.lastStatusChangeAt || opportunity.updatedAt || opportunity.createdAt || root.dateAdded || root.timestamp);
  const occurredAt = occurredRaw && !Number.isNaN(Date.parse(occurredRaw)) ? new Date(occurredRaw).toISOString() : now.toISOString();
  const first = asText(contact.firstName);
  const last = asText(contact.lastName);
  const name = asText(contact.name || contact.fullName) || [first, last].filter(Boolean).join(" ");
  return {
    event: asText(root.type || root.event || root.typeName) || "opportunity",
    locationId: asText(root.locationId || opportunity.locationId || root.location_id),
    opportunityId,
    stageId,
    stageName,
    valueCents: moneyToCents(opportunity.monetaryValue ?? opportunity.monetary_value ?? opportunity.value ?? root.monetaryValue),
    currency: (asText(opportunity.currency || root.currency) || "USD").toUpperCase().slice(0, 3),
    occurredAt,
    contact: {
      ghlId: asText(contact.id || opportunity.contactId || root.contactId),
      name,
      phone: asText(contact.phone || contact.phoneNumber || root.phone),
      email: asText(contact.email || root.email),
    },
    attribution: withFbc(extractAttribution(root, opportunity, contact), Date.parse(occurredAt)),
  };
}

import type { Env } from "../config";
import { retainRawMaids, audienceMaidKey } from "../config";
import { parseCsv } from "../search-waste";
import { parseConsentOrigin, type ConsentOrigin } from "./list-validation";
import {
  DEFAULT_AUDIENCE_SOURCE,
  isAudienceSource,
  isSegmentDimension,
  type AudienceSource,
  type SegmentDimension,
  type SegmentTag,
} from "../segment-taxonomy";
import {
  dedupeIdentifiers,
  encryptMaid,
  hashEmailIdentifier,
  hashMaid,
  hashPhoneIdentifier,
  isSha256Hex,
  maidKeyBytes,
  normalizeMaid,
  type HashedIdentifier,
  type MaidIdType,
} from "./maid";

export const REFRESH_CADENCES = ["daily", "weekly", "monthly", "quarterly"] as const;
export type RefreshCadence = (typeof REFRESH_CADENCES)[number];

export type MaidLineage = {
  vendor: string;
  listId: string;
  acquisitionDate: string | null;
  cost: string | null;
  currency: string;
  consentBasis: string;
  refreshCadence: RefreshCadence;
};

export type ImportIssue = { row: number; message: string };

export type ConsentProof = {
  dataLabel: string;
  gppString: string;
};

export type MaidImport = {
  name: string;
  source: AudienceSource;
  lineage: MaidLineage;
  consentProof: ConsentProof;
  consentOrigin: ConsentOrigin;
  tags: SegmentTag[];
  identifiers: HashedIdentifier[];
  duplicates: number;
  rejected: ImportIssue[];
  rawStored: boolean;
};

export type ImportOptions = {
  retainRaw: boolean;
  maidKey: string | undefined;
};

type IdentifierDraft = {
  row: number;
  maid?: string;
  idType?: string;
  maidSha256?: string;
  email?: string;
  emailSha256?: string;
  phone?: string;
  phoneSha256?: string;
};

const LIST_ID = /^[A-Za-z0-9._:-]{1,80}$/;

export function importOptionsFromEnv(env: Env = process.env): ImportOptions {
  return { retainRaw: retainRawMaids(env), maidKey: audienceMaidKey(env) || undefined };
}

export function isRefreshCadence(value: string): value is RefreshCadence {
  return (REFRESH_CADENCES as readonly string[]).includes(value);
}

function clean(value: unknown, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function slug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

export function parseCost(raw: string) {
  const trimmed = raw.trim().replace(/[$,]/g, "");
  if (!trimmed) return { cost: null as string | null, issue: null as string | null };
  if (!/^\d+(\.\d{1,4})?$/.test(trimmed)) return { cost: null, issue: "Cost must be a dollar amount." };
  return { cost: Number(trimmed).toFixed(4), issue: null };
}

export function parseAcquisitionDate(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return { date: null as string | null, issue: null as string | null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return { date: null, issue: "Acquisition date must be YYYY-MM-DD." };
  const [year, month, day] = trimmed.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    return { date: null, issue: "Acquisition date is not a real day." };
  }
  return { date: trimmed, issue: null };
}

function tagFrom(dimension: SegmentDimension, label: string, key?: string): SegmentTag | null {
  const cleanLabel = clean(label, 80);
  if (!cleanLabel) return null;
  const cleanKey = slug(key || cleanLabel);
  if (!cleanKey) return null;
  return { dimension, key: cleanKey, label: cleanLabel };
}

function lineageFrom(input: {
  vendor: string;
  listId: string;
  acquisitionDate: string;
  cost: string;
  currency: string;
  consentBasis: string;
  refreshCadence: string;
}): { lineage: MaidLineage | null; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const vendor = clean(input.vendor, 120);
  const listId = clean(input.listId, 80);
  const consentBasis = clean(input.consentBasis, 200);
  if (!vendor) issues.push({ row: 0, message: "Vendor is required." });
  if (!LIST_ID.test(listId)) issues.push({ row: 0, message: "List id is required. Use letters, numbers, and . _ : -." });
  if (!consentBasis) issues.push({ row: 0, message: "Consent basis is required." });
  const cadence = clean(input.refreshCadence, 20).toLowerCase();
  if (!isRefreshCadence(cadence)) issues.push({ row: 0, message: "Refresh cadence must be daily, weekly, monthly, or quarterly." });
  const acquired = parseAcquisitionDate(input.acquisitionDate);
  if (acquired.issue) issues.push({ row: 0, message: acquired.issue });
  const cost = parseCost(input.cost);
  if (cost.issue) issues.push({ row: 0, message: cost.issue });
  const currency = clean(input.currency || "USD", 3).toUpperCase() || "USD";
  if (!/^[A-Z]{3}$/.test(currency)) issues.push({ row: 0, message: "Currency must be a 3-letter code." });
  if (issues.length || !isRefreshCadence(cadence)) return { lineage: null, issues };
  return {
    lineage: {
      vendor,
      listId,
      acquisitionDate: acquired.date,
      cost: cost.cost,
      currency,
      consentBasis,
      refreshCadence: cadence,
    },
    issues,
  };
}

function hashRows(drafts: IdentifierDraft[], options: ImportOptions) {
  const issues: ImportIssue[] = [];
  const hashed: HashedIdentifier[] = [];
  const key = options.retainRaw ? maidKeyBytes(options.maidKey) : null;
  let rawStored = false;
  if (options.retainRaw && !key) {
    issues.push({ row: 0, message: "Raw MAIDs stay off because the encryption key is missing. Hashes are still kept." });
  }
  for (const draft of drafts) {
    const idType = (draft.idType || "").trim().toLowerCase();
    if (draft.maid) {
      if (idType !== "idfa" && idType !== "gaid") {
        issues.push({ row: draft.row, message: "A MAID needs id type idfa or gaid." });
      } else {
        const normalized = normalizeMaid(draft.maid, idType);
        if (!normalized) issues.push({ row: draft.row, message: "MAID is not a valid IDFA or GAID." });
        else {
          hashed.push({
            idType,
            hash: hashMaid(normalized),
            rawEncrypted: key ? encryptMaid(normalized, key) : null,
          });
          if (key) rawStored = true;
        }
      }
    } else if (draft.maidSha256) {
      if (idType !== "idfa" && idType !== "gaid") {
        issues.push({ row: draft.row, message: "A hashed MAID needs id type idfa or gaid." });
      } else if (!isSha256Hex(draft.maidSha256)) {
        issues.push({ row: draft.row, message: "Hashed MAID must be 64 hex characters." });
      } else {
        hashed.push({ idType, hash: draft.maidSha256.trim().toLowerCase(), rawEncrypted: null });
      }
    }
    const email = hashEmailIdentifier(draft.emailSha256 || draft.email || "");
    if ((draft.email || draft.emailSha256) && !email) issues.push({ row: draft.row, message: "Email could not be hashed." });
    if (email) hashed.push({ idType: "email_sha256", hash: email, rawEncrypted: null });
    const phone = hashPhoneIdentifier(draft.phoneSha256 || draft.phone || "");
    if ((draft.phone || draft.phoneSha256) && !phone) issues.push({ row: draft.row, message: "Phone could not be hashed." });
    if (phone) hashed.push({ idType: "phone_sha256", hash: phone, rawEncrypted: null });
    if (!draft.maid && !draft.maidSha256 && !draft.email && !draft.emailSha256 && !draft.phone && !draft.phoneSha256) {
      issues.push({ row: draft.row, message: "Row has no identifier." });
    }
  }
  const deduped = dedupeIdentifiers(hashed);
  return { identifiers: deduped.unique, duplicates: deduped.duplicates, rejected: issues, rawStored };
}

function canonicalSource(value: string) {
  if (value === "maid_market") return DEFAULT_AUDIENCE_SOURCE;
  return value;
}

function finish(input: {
  name: string;
  source: string;
  lineageInput: Parameters<typeof lineageFrom>[0];
  consentProof: ConsentProof;
  consentOrigin: ConsentOrigin;
  tags: SegmentTag[];
  drafts: IdentifierDraft[];
  options: ImportOptions;
}): { ok: true; value: MaidImport } | { ok: false; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const name = clean(input.name, 120);
  if (!name) issues.push({ row: 0, message: "Audience name is required." });
  const source = canonicalSource(input.source ? clean(input.source, 40) : DEFAULT_AUDIENCE_SOURCE);
  if (!isAudienceSource(source)) issues.push({ row: 0, message: "Audience source is not in the taxonomy." });
  const lineage = lineageFrom(input.lineageInput);
  issues.push(...lineage.issues);
  const hashed = hashRows(input.drafts, input.options);
  issues.push(...hashed.rejected);
  if (!hashed.identifiers.length) issues.push({ row: 0, message: "No valid identifiers." });
  if (!lineage.lineage || !name || !isAudienceSource(source) || !hashed.identifiers.length) return { ok: false, issues };
  return {
    ok: true,
    value: {
      name,
      source,
      lineage: lineage.lineage,
      tags: input.tags,
      consentProof: {
        dataLabel: clean(input.consentProof.dataLabel, 200),
        gppString: clean(input.consentProof.gppString, 500),
      },
      consentOrigin: input.consentOrigin,
      identifiers: hashed.identifiers,
      duplicates: hashed.duplicates,
      rejected: hashed.rejected.filter((issue) => issue.row !== 0 || !issue.message.startsWith("No valid")),
      rawStored: hashed.rawStored,
    },
  };
}

function cell(row: string[], index: number | undefined) {
  if (index === undefined) return "";
  return row[index] ?? "";
}

export function importMaidCsv(text: string, meta: {
  name: string;
  vendor: string;
  listId: string;
  consentBasis: string;
  refreshCadence: string;
  acquisitionDate: string;
  cost?: string;
  currency?: string;
  source?: string;
  dataLabel?: string;
  gppString?: string;
  consentOrigin?: string;
  tags?: SegmentTag[];
}, options: ImportOptions) {
  const table = parseCsv(text);
  if (table.length < 2) return { ok: false as const, issues: [{ row: 0, message: "The CSV needs a header and one row." }] };
  const headers = table[0].map((header) => header.trim().toLowerCase().replace(/\s+/g, "_"));
  const index = new Map(headers.map((header, position) => [header, position]));
  const pick = (row: string[], ...names: string[]) => {
    for (const name of names) {
      const value = cell(row, index.get(name)).trim();
      if (value) return value;
    }
    return "";
  };
  const drafts: IdentifierDraft[] = [];
  const tags = [...(meta.tags ?? [])];
  for (let i = 1; i < table.length; i += 1) {
    const row = table[i];
    if (row.every((value) => !value.trim())) continue;
    drafts.push({
      row: i + 1,
      maid: pick(row, "maid", "idfa", "gaid", "device_id"),
      idType: pick(row, "id_type", "type") || (pick(row, "idfa") ? "idfa" : pick(row, "gaid") ? "gaid" : ""),
      maidSha256: pick(row, "maid_sha256", "idfa_sha256", "gaid_sha256"),
      email: pick(row, "email"),
      emailSha256: pick(row, "email_sha256"),
      phone: pick(row, "phone"),
      phoneSha256: pick(row, "phone_sha256"),
    });
    for (const dimension of ["intent", "geo", "demographics", "behavior"] as const) {
      const label = pick(row, dimension, `${dimension}_label`);
      const tag = label && isSegmentDimension(dimension) ? tagFrom(dimension, label, pick(row, `${dimension}_key`)) : null;
      if (tag && !tags.some((item) => item.dimension === tag.dimension && item.key === tag.key)) tags.push(tag);
    }
  }
  return finish({
    name: meta.name,
    source: meta.source || DEFAULT_AUDIENCE_SOURCE,
    lineageInput: {
      vendor: meta.vendor,
      listId: meta.listId,
      acquisitionDate: meta.acquisitionDate,
      cost: meta.cost || "",
      currency: meta.currency || "USD",
      consentBasis: meta.consentBasis,
      refreshCadence: meta.refreshCadence,
    },
    consentProof: {
      dataLabel: meta.dataLabel || pick(table[1] || [], "data_label", "iab_data_label"),
      gppString: meta.gppString || pick(table[1] || [], "gpp", "gpp_string"),
    },
    consentOrigin: parseConsentOrigin(meta.consentOrigin || pick(table[1] || [], "consent_origin", "consent_collected")),
    tags,
    drafts,
    options,
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function importMaidApi(body: unknown, options: ImportOptions) {
  const record = asRecord(body);
  if (!record) return { ok: false as const, issues: [{ row: 0, message: "Import body must be an object." }] };
  const identifiers = Array.isArray(record.identifiers) ? record.identifiers : [];
  const drafts: IdentifierDraft[] = identifiers.map((item, position) => {
    const row = asRecord(item) ?? {};
    return {
      row: position + 1,
      maid: clean(row.maid || row.idfa || row.gaid || row.deviceId, 80),
      idType: clean(row.idType || row.id_type || (row.idfa ? "idfa" : row.gaid ? "gaid" : ""), 20).toLowerCase(),
      maidSha256: clean(row.maidSha256 || row.maid_sha256, 80),
      email: clean(row.email, 200),
      emailSha256: clean(row.emailSha256 || row.email_sha256, 80),
      phone: clean(row.phone, 40),
      phoneSha256: clean(row.phoneSha256 || row.phone_sha256, 80),
    };
  });
  const tags: SegmentTag[] = [];
  const rawTags = Array.isArray(record.tags) ? record.tags : [];
  for (const item of rawTags) {
    const tag = asRecord(item);
    if (!tag) continue;
    const dimension = clean(tag.dimension, 40);
    if (!isSegmentDimension(dimension)) continue;
    const built = tagFrom(dimension, clean(tag.label, 80), clean(tag.key, 40));
    if (built) tags.push(built);
  }
  return finish({
    name: clean(record.name, 120),
    source: clean(record.source, 40) || DEFAULT_AUDIENCE_SOURCE,
    lineageInput: {
      vendor: clean(record.vendor, 120),
      listId: clean(record.listId || record.list_id, 80),
      acquisitionDate: clean(record.acquisitionDate || record.acquisition_date, 20),
      cost: clean(record.cost, 20),
      currency: clean(record.currency, 3) || "USD",
      consentBasis: clean(record.consentBasis || record.consent_basis, 200),
      refreshCadence: clean(record.refreshCadence || record.refresh_cadence, 20),
    },
    consentProof: {
      dataLabel: clean(record.dataLabel || record.data_label || record.iabDataLabel, 200),
      gppString: clean(record.gppString || record.gpp || record.gpp_string, 500),
    },
    consentOrigin: parseConsentOrigin(clean(record.consentOrigin || record.consent_origin, 40)),
    tags,
    drafts,
    options,
  });
}

export function staffCost(seesCost: boolean, cost: string | null) {
  return seesCost ? cost : null;
}

export type { MaidIdType };

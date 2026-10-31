import { collectsCostKeys, stripForAudience } from "../channels/cost-strip";
import { formatMaids } from "./present";
import { CLIENT_SOURCES, EXAMPLE_SOURCES, type PlatformId } from "./example";

export type IdentifierKind = "maid" | "email" | "phone";

export type ResolutionPlatform = {
  id: string;
  label: string;
  /** 0–1. Any platform id is allowed, so the list is not limited to three. */
  rate: number;
};

export const DEFAULT_RESOLUTION_PLATFORMS: ResolutionPlatform[] = [
  { id: "meta", label: "Meta", rate: 0 },
  { id: "google_ads", label: "Google", rate: 0 },
  { id: "stackadapt", label: "StackAdapt", rate: 0 },
];

const IDENTIFIERS: { kind: IdentifierKind; label: string; share: number }[] = [
  { kind: "maid", label: "MAIDs", share: 1 },
  { kind: "email", label: "Emails", share: 0.35 },
  { kind: "phone", label: "Phones", share: 0.12 },
];

const VENDOR_KEY = /vendor|segmentid/i;

export type RawResolution = {
  accountId: string;
  sourceId: string;
  publicId: string;
  vendor: string;
  vendorId: string;
  vendorSegmentIds: string[];
  label: string;
  type: string;
  uploaded: Record<IdentifierKind, number>;
  platforms: { id: string; label: string; matched: number; unmatched: number }[];
  byIdentifier: { kind: IdentifierKind; label: string; uploaded: number; matched: number; unmatched: number }[];
  bySource: { vendor: string; vendorId: string; label: string; uploaded: number; matched: number; unmatched: number }[];
  trend: { label: string; matched: number; unmatched: number }[];
  cpm: number;
  spend: number;
  cpl: number;
  cpa: number;
  roas: number;
};

export type PresentedResolution = {
  id: string;
  label: string;
  type: string;
  example: true;
  uploaded: number;
  uploadedLabel: string;
  parts: { kind: IdentifierKind; label: string; count: number; countLabel: string }[];
  platforms: { id: string; label: string; rateLabel: string; matchedLabel: string; unmatchedLabel: string; matched: number; unmatched: number }[];
  byIdentifier: { label: string; rateLabel: string; uploadedLabel: string; matchedLabel: string; unmatchedLabel: string }[];
  bySource: { label: string; rateLabel: string; matchedLabel: string; unmatchedLabel: string }[];
  trend: { label: string; matched: number; unmatched: number }[];
  vendor?: string;
};

function round(value: number) {
  return Math.max(0, Math.round(value));
}

function rateLabel(matched: number, unmatched: number) {
  const total = matched + unmatched;
  if (!total) return "0%";
  return `${Math.round((matched / total) * 100)}%`;
}

export function buildResolution(input: {
  accountId: string;
  sourceId: string;
  publicId: string;
  vendor: string;
  vendorId: string;
  vendorSegmentIds: string[];
  label: string;
  type: string;
  seed: number;
  platforms: ResolutionPlatform[];
  cpm?: number;
  spend?: number;
  cpl?: number;
  cpa?: number;
  roas?: number;
}): RawResolution {
  const uploaded = {
    maid: round(input.seed),
    email: round(input.seed * 0.35),
    phone: round(input.seed * 0.12),
  };
  const total = uploaded.maid + uploaded.email + uploaded.phone;
  const platforms = input.platforms.map((platform) => {
    const matched = round(total * platform.rate);
    return { id: platform.id, label: platform.label, matched, unmatched: total - matched };
  });
  const mean = input.platforms.length ? input.platforms.reduce((sum, platform) => sum + platform.rate, 0) / input.platforms.length : 0;
  const byIdentifier = IDENTIFIERS.map((row) => {
    const count = uploaded[row.kind];
    const matched = round(count * mean);
    return { kind: row.kind, label: row.label, uploaded: count, matched, unmatched: count - matched };
  });
  const primaryMatched = round(total * mean * 0.72);
  const extraUploaded = round(total * 0.28);
  const extraMatched = round(extraUploaded * mean);
  const bySource = [
    { vendor: input.vendor, vendorId: input.vendorId, label: input.label, uploaded: total - extraUploaded, matched: primaryMatched, unmatched: total - extraUploaded - primaryMatched },
    { vendor: "", vendorId: "", label: "First-party file", uploaded: extraUploaded, matched: extraMatched, unmatched: extraUploaded - extraMatched },
  ];
  const trend = ["Sep 21", "Sep 28", "Oct 5", "Oct 12", "Oct 19", "Oct 26"].map((label, index) => {
    const matched = round(total * mean * (0.55 + index * 0.07));
    return { label, matched, unmatched: Math.max(0, round(total * 0.2) - index * round(total * 0.01)) };
  });
  return {
    accountId: input.accountId,
    sourceId: input.sourceId,
    publicId: input.publicId,
    vendor: input.vendor,
    vendorId: input.vendorId,
    vendorSegmentIds: input.vendorSegmentIds,
    label: input.label,
    type: input.type,
    uploaded,
    platforms,
    byIdentifier,
    bySource,
    trend,
    cpm: input.cpm ?? 3.1,
    spend: input.spend ?? 100,
    cpl: input.cpl ?? 4,
    cpa: input.cpa ?? 12,
    roas: input.roas ?? 1.2,
  };
}

function platformRates(match: { platform: PlatformId; rate: number }[], extra: ResolutionPlatform[] = []): ResolutionPlatform[] {
  const known = new Map(match.map((row) => [row.platform, row.rate]));
  const base = DEFAULT_RESOLUTION_PLATFORMS.map((platform) => ({
    ...platform,
    rate: known.get(platform.id as PlatformId) ?? platform.rate,
  }));
  return [...base, ...extra];
}

function present(raw: RawResolution, reader: "staff" | "client" | "share"): PresentedResolution {
  const uploaded = raw.uploaded.maid + raw.uploaded.email + raw.uploaded.phone;
  const body: PresentedResolution = {
    id: reader === "staff" ? raw.sourceId : raw.publicId,
    label: reader === "staff" ? raw.vendor : raw.label,
    type: raw.type,
    example: true,
    uploaded,
    uploadedLabel: formatMaids(uploaded),
    parts: IDENTIFIERS.map((row) => ({
      kind: row.kind,
      label: row.label,
      count: raw.uploaded[row.kind],
      countLabel: formatMaids(raw.uploaded[row.kind]),
    })),
    platforms: raw.platforms.map((platform) => ({
      id: platform.id,
      label: platform.label,
      rateLabel: rateLabel(platform.matched, platform.unmatched),
      matched: platform.matched,
      unmatched: platform.unmatched,
      matchedLabel: formatMaids(platform.matched),
      unmatchedLabel: formatMaids(platform.unmatched),
    })),
    byIdentifier: raw.byIdentifier.map((row) => ({
      label: row.label,
      rateLabel: rateLabel(row.matched, row.unmatched),
      uploadedLabel: formatMaids(row.uploaded),
      matchedLabel: formatMaids(row.matched),
      unmatchedLabel: formatMaids(row.unmatched),
    })),
    bySource: raw.bySource.map((row) => ({
      label: reader === "staff" && row.vendor ? row.vendor : row.label,
      rateLabel: rateLabel(row.matched, row.unmatched),
      matchedLabel: formatMaids(row.matched),
      unmatchedLabel: formatMaids(row.unmatched),
    })),
    trend: raw.trend.map((row) => ({ label: row.label, matched: row.matched, unmatched: row.unmatched })),
  };
  if (reader === "staff") body.vendor = raw.vendor;
  if (reader === "staff") return body;
  return stripResolution(body);
}

function stripResolution<T>(value: T): T {
  const costless = stripForAudience(value, "client");
  return walk(costless) as T;
}

function walk(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(walk);
  if (!value || typeof value !== "object") return value;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (VENDOR_KEY.test(key)) continue;
    next[key] = walk(child);
  }
  return next;
}

function staffRaw(sourceId: string, extra: ResolutionPlatform[] = []) {
  const source = EXAMPLE_SOURCES.find((row) => row.id === sourceId);
  if (!source) return null;
  return buildResolution({
    accountId: "all",
    sourceId: source.id,
    publicId: source.id,
    vendor: source.vendor,
    vendorId: source.id,
    vendorSegmentIds: source.selections.map((row) => row.id),
    label: source.type,
    type: source.type,
    seed: source.maids,
    platforms: platformRates(source.match, extra),
    cpm: source.dataCostCpm,
    spend: source.spend,
    cpl: source.cpl,
    cpa: source.cpa,
    roas: source.roas,
  });
}

function clientRaw(accountId: string, publicId: string, extra: ResolutionPlatform[] = []) {
  const source = CLIENT_SOURCES.find((row) => row.accountId === accountId && row.publicId === publicId);
  if (!source) return null;
  return buildResolution({
    accountId,
    sourceId: source.id,
    publicId: source.publicId,
    vendor: source.vendor,
    vendorId: source.vendorId,
    vendorSegmentIds: source.vendorSegmentIds,
    label: source.label,
    type: source.type,
    seed: source.maids,
    platforms: platformRates(source.match, extra),
    cpm: source.dataCostCpm,
    spend: source.spend,
    cpl: source.cpl,
    cpa: source.cpa,
    roas: source.roas,
  });
}

export function readResolution(input: {
  reader: "staff" | "client" | "share";
  sourceId: string;
  ownAccountId?: string;
  requestedAccountId?: string | null;
  extraPlatforms?: ResolutionPlatform[];
}) {
  const sourceId = input.sourceId.trim();
  if (input.reader === "staff") {
    const raw = staffRaw(sourceId, input.extraPlatforms);
    if (!raw) return { ok: false as const, status: 404 as const, error: "Not found" as const };
    return { ok: true as const, body: present(raw, "staff") };
  }
  const own = (input.ownAccountId || "").trim();
  const requested = (input.requestedAccountId || own).trim();
  if (!own || requested !== own) return { ok: false as const, status: 403 as const, error: "Not allowed" as const };
  if (/vendor/i.test(sourceId)) return { ok: false as const, status: 404 as const, error: "Not found" as const };
  const raw = clientRaw(own, sourceId, input.extraPlatforms);
  if (!raw) return { ok: false as const, status: 404 as const, error: "Not found" as const };
  const body = present(raw, input.reader);
  if (collectsCostKeys(body).length) return { ok: false as const, status: 500 as const, error: "Not allowed" as const };
  return { ok: true as const, body };
}

export function resolutionSummaries(input: { reader: "staff" | "client" | "share"; accountId?: string }) {
  if (input.reader === "staff") {
    return Object.fromEntries(EXAMPLE_SOURCES.map((source) => {
      const result = readResolution({ reader: "staff", sourceId: source.id });
      const rate = result.ok ? result.body.platforms[0]?.rateLabel || "" : "";
      return [source.id, rate];
    }));
  }
  const accountId = input.accountId || "";
  return Object.fromEntries(CLIENT_SOURCES.filter((source) => source.accountId === accountId).map((source) => {
    const result = readResolution({ reader: input.reader, sourceId: source.publicId, ownAccountId: accountId });
    const rate = result.ok ? result.body.platforms[0]?.rateLabel || "" : "";
    return [source.publicId, rate];
  }));
}

import { stripForAudience, type CostAudience } from "../channels/cost-strip";
import { audienceMoreChannels, type MoreMatch } from "../channels/video-channels";
import { audienceDataStaleMs, jarvisUiV2Enabled, type Env } from "../config";
import {
  AUDIENCE_DATA_NOW,
  CLIENT_SOURCES,
  EXAMPLE_SOURCES,
  LOW_MATCH_RATE,
  type ClientSource,
  type PlatformId,
  type RawSelection,
  type RawSource,
  type SelectionGroupId,
  type SelectionLogic,
} from "./example";

export const GROUP_ORDER: { id: SelectionGroupId; title: string }[] = [
  { id: "intent", title: "Intent" },
  { id: "demographics", title: "Demographics" },
  { id: "geography", title: "Geography" },
  { id: "behavioral", title: "Behavioral / purchase" },
  { id: "device", title: "Device / app" },
  { id: "firmographic", title: "Firmographic" },
];

export const PLATFORM_LABEL: Record<PlatformId, { short: string; full: string }> = {
  meta: { short: "M", full: "Meta" },
  google_ads: { short: "G", full: "Google Ads" },
  stackadapt: { short: "SA", full: "StackAdapt" },
};

export type SortKey = "vendor" | "type" | "campaigns" | "audiences" | "maids" | "match" | "refreshed" | "leads" | "quality" | "decisions";

export type AudienceReader = "staff" | "client" | "share";

const CLIENT_KINDS = new Set(["client_owner", "client_viewer", "share", "none"]);

/** Staff, account managers, and super admins. Client roles and share links are refused. */
export function canOpenAudienceData(kind: string) {
  if (CLIENT_KINDS.has(kind)) return false;
  return kind === "super_admin" || kind === "account_manager" || kind === "staff" || kind === "all_clients_viewer";
}

export function formatMaids(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    const digits = abs >= 10_000_000 ? 1 : 2;
    const text = (abs / 1_000_000).toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d)0$/, "$1");
    return `${text}M`;
  }
  if (abs >= 1_000) {
    const text = abs >= 100_000 ? String(Math.round(abs / 1_000)) : String(Math.round(abs / 1_000));
    return `${text}K`;
  }
  return String(abs);
}

export function formatDelta(value: number | null) {
  if (value === null) return "—";
  const body = formatMaids(value);
  if (value > 0) return `+${body}`;
  if (value < 0) return `−${body}`;
  return body;
}

export function refreshLabel(refreshedAt: string, now: string, staleAfterMs = audienceDataStaleMs()) {
  const age = Date.parse(now) - Date.parse(refreshedAt);
  const stale = age > staleAfterMs;
  const hours = Math.max(0, Math.round(age / (60 * 60 * 1000)));
  const base = hours >= 48 ? `${Math.round(hours / 24)}d ago` : hours >= 24 ? "1d ago" : `${hours}h ago`;
  return { label: stale ? `${base} · stale` : base, stale, age };
}

export function logicLabel(logic: SelectionLogic) {
  if (logic === "include_or") return "Include · OR";
  if (logic === "and_narrows") return "AND (narrows)";
  if (logic === "and") return "AND";
  if (logic === "exclude") return "Exclude";
  if (logic === "or") return "OR";
  return "—";
}

export type PresentedMatch = {
  platform: PlatformId;
  short: string;
  full: string;
  percent: number;
  hold: boolean;
};

export type PresentedRow = {
  id: string;
  vendor?: string;
  label?: string;
  type: string;
  campaigns: number;
  campaignIds: string[];
  audiences: number;
  maids: number;
  maidsLabel: string;
  match: PresentedMatch[];
  /** YouTube and CTV stay off this cell's columns. Present only when JARVIS_UI_V2 is on. */
  moreChannels?: MoreMatch[];
  refreshed: string;
  stale: boolean;
  leads: number;
  leadQuality: number | null;
  qualityLabel: string;
  provisional: boolean;
  decisions?: { scale: number; learning: number; cut: number };
  dataCostCpm?: number;
  cpm?: number;
  spend?: number;
  cpl?: number;
  cpa?: number;
  roas?: number;
};

export type PresentedSelection = {
  id: string;
  value: string;
  logic: string;
  maidsLabel: string;
  leadsLabel: string;
  qualityLabel: string;
  measurable: boolean;
};

export type PresentedGroup = {
  id: SelectionGroupId;
  title: string;
  count: number;
  selections: PresentedSelection[];
};

export type PresentedDetail = PresentedRow & {
  audienceId: string;
  audienceName: string;
  selectionCount: number;
  why: string;
  recommendation: string;
  workedOut: string[];
  groups: PresentedGroup[];
  recommendationOnly: true;
  example: true;
};

function matchRows(match: RawSource["match"]): PresentedMatch[] {
  return match.map((row) => ({
    platform: row.platform,
    short: PLATFORM_LABEL[row.platform].short,
    full: PLATFORM_LABEL[row.platform].full,
    percent: Math.round(row.rate * 100),
    hold: row.rate < LOW_MATCH_RATE,
  }));
}

function qualityLabel(quality: number | null, provisional: boolean) {
  if (quality === null) return "— no CRM outcome yet";
  return provisional ? `${quality} provisional` : String(quality);
}

function narrowsPool(logic: SelectionLogic) {
  return logic === "and" || logic === "and_narrows" || logic === "exclude" || logic === "unused";
}

function presentSelection(row: RawSelection): PresentedSelection {
  const measurable = !narrowsPool(row.logic) && row.leads !== null;
  return {
    id: row.id,
    value: row.value,
    logic: logicLabel(row.logic),
    maidsLabel: formatDelta(row.maidsDelta),
    leadsLabel: measurable ? String(row.leads) : "—",
    qualityLabel: measurable ? qualityLabel(row.quality, row.provisional) : "Not measurable alone",
    measurable,
  };
}

function presentRow(source: RawSource, now: string, staleAfterMs: number, env?: Env): PresentedRow {
  const refresh = refreshLabel(source.refreshedAt, now, staleAfterMs);
  const moreChannels = audienceMoreChannels(source.match.find((row) => row.platform === "google_ads")?.rate, jarvisUiV2Enabled(env));
  const row: PresentedRow = {
    id: source.id,
    vendor: source.vendor,
    type: source.type,
    campaigns: source.campaigns.length,
    campaignIds: source.campaigns.map((campaign) => campaign.id),
    audiences: source.audienceCount,
    maids: source.maids,
    maidsLabel: formatMaids(source.maids),
    match: matchRows(source.match),
    ...(moreChannels ? { moreChannels } : {}),
    refreshed: refresh.label,
    stale: refresh.stale,
    leads: source.leads,
    leadQuality: source.leadQuality,
    qualityLabel: qualityLabel(source.leadQuality, source.provisional),
    provisional: source.provisional && source.leadQuality !== null,
    decisions: source.decisions,
    dataCostCpm: source.dataCostCpm,
    cpm: source.dataCostCpm,
    spend: source.spend,
    cpl: source.cpl,
    cpa: source.cpa,
    roas: source.roas,
  };
  return row;
}

const VENDOR_KEY = /vendor|segmentid/i;

function stripIdentity<T>(value: T): T {
  return walk(value) as T;
}

function walk(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(walk);
  if (!value || typeof value !== "object") return value;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (VENDOR_KEY.test(key) || key === "decisions") continue;
    next[key] = walk(child);
  }
  return next;
}

function stripClient<T>(value: T, reader: AudienceReader): T {
  if (reader === "staff") return value;
  const audience: CostAudience = reader === "share" ? "share" : "client";
  return stripIdentity(stripForAudience(value, audience));
}

export function listAudienceSources(input: {
  reader: AudienceReader;
  now?: string;
  campaignId?: string;
  search?: string;
  sort?: SortKey;
  direction?: "asc" | "desc";
  sources?: RawSource[];
  staleAfterMs?: number;
  env?: Env;
}) {
  const now = input.now ?? AUDIENCE_DATA_NOW;
  const staleAfterMs = input.staleAfterMs ?? audienceDataStaleMs(input.env);
  const sources = input.sources ?? EXAMPLE_SOURCES;
  const campaignId = (input.campaignId || "all").trim();
  const search = (input.search || "").trim().toLowerCase();
  let rows = sources.filter((source) => {
    if (campaignId !== "all" && !source.campaigns.some((campaign) => campaign.id === campaignId)) return false;
    if (!search) return true;
    return source.vendor.toLowerCase().includes(search) || source.type.toLowerCase().includes(search);
  });
  const sort = input.sort ?? "leads";
  const direction = input.direction ?? "desc";
  rows = [...rows].sort((a, b) => compareSources(a, b, sort, direction, now));
  const presented = rows.map((source) => presentRow(source, now, staleAfterMs, input.env));
  const audiences = presented.reduce((sum, row) => sum + row.audiences, 0);
  const maids = presented.reduce((sum, row) => sum + row.maids, 0);
  const noun = input.reader === "staff" ? "sources" : presented.length === 1 ? "source type" : "source types";
  const body = {
    example: true as const,
    recommendationOnly: true as const,
    summary: `${presented.length} ${noun} · ${audiences} audiences · ${formatMaids(maids)} MAIDs`,
    rows: presented,
    campaigns: campaignChoices(rows),
  };
  return stripClient(body, input.reader);
}

export function campaignChoices(sources: RawSource[] = EXAMPLE_SOURCES) {
  const seen = new Map<string, string>();
  for (const source of sources) {
    for (const campaign of source.campaigns) seen.set(campaign.id, campaign.name);
  }
  return [...seen.entries()].map(([id, name]) => ({ id, name }));
}

function compareSources(a: RawSource, b: RawSource, sort: SortKey, direction: "asc" | "desc", now: string) {
  const sign = direction === "asc" ? 1 : -1;
  const num = (left: number, right: number) => (left - right) * sign;
  if (sort === "vendor") return a.vendor.localeCompare(b.vendor) * sign;
  if (sort === "type") return a.type.localeCompare(b.type) * sign;
  if (sort === "campaigns") return num(a.campaigns.length, b.campaigns.length);
  if (sort === "audiences") return num(a.audienceCount, b.audienceCount);
  if (sort === "maids") return num(a.maids, b.maids);
  if (sort === "match") return num(lowestMatch(a), lowestMatch(b));
  if (sort === "refreshed") return num(Date.parse(a.refreshedAt), Date.parse(b.refreshedAt));
  if (sort === "quality") return num(a.leadQuality ?? -1, b.leadQuality ?? -1);
  if (sort === "decisions") return num(a.decisions.scale, b.decisions.scale);
  void now;
  return num(a.leads, b.leads);
}

function lowestMatch(source: RawSource) {
  return Math.min(...source.match.map((row) => row.rate));
}

export function audienceSourceDetail(id: string, reader: AudienceReader, now = AUDIENCE_DATA_NOW, sources: RawSource[] = EXAMPLE_SOURCES, staleAfterMs = audienceDataStaleMs(), env?: Env): PresentedDetail | null {
  const source = sources.find((row) => row.id === id);
  if (!source) return null;
  const base = presentRow(source, now, staleAfterMs, env);
  const groups = GROUP_ORDER.map((group) => {
    const selections = source.selections.filter((row) => row.group === group.id).map(presentSelection);
    return { id: group.id, title: group.title, count: selections.length, selections };
  });
  const detail: PresentedDetail = {
    ...base,
    audienceId: source.audienceId,
    audienceName: source.audienceName,
    selectionCount: source.selections.length,
    why: source.why,
    recommendation: source.recommendation,
    workedOut: source.workedOut,
    groups,
    recommendationOnly: true,
    example: true,
  };
  return stripClient(detail, reader);
}

function clientRows(accountId: string) {
  return CLIENT_SOURCES.filter((source) => source.accountId === accountId);
}

function formatClientMaids(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(2)}M`;
  return formatMaids(value);
}

function presentClientRow(source: ClientSource, now: string, staleAfterMs: number, env?: Env) {
  const refresh = refreshLabel(source.refreshedAt, now, staleAfterMs);
  const moreChannels = audienceMoreChannels(source.match.find((row) => row.platform === "google_ads")?.rate, jarvisUiV2Enabled(env));
  return {
    id: source.publicId,
    label: source.label,
    type: source.type,
    campaigns: source.campaigns.length,
    campaignIds: source.campaigns.map((campaign) => campaign.id),
    audiences: source.audienceCount,
    maids: source.maids,
    maidsLabel: formatClientMaids(source.maids),
    match: matchRows(source.match),
    ...(moreChannels ? { moreChannels } : {}),
    refreshed: refresh.label,
    stale: refresh.stale,
    leads: source.leads,
    leadQuality: source.leadQuality,
    qualityLabel: qualityLabel(source.leadQuality, source.provisional),
    provisional: source.provisional && source.leadQuality !== null,
  };
}

export function listClientSources(input: {
  accountId: string;
  reader?: "client" | "share";
  now?: string;
  campaignId?: string;
  search?: string;
  staleAfterMs?: number;
  env?: Env;
}) {
  const now = input.now ?? AUDIENCE_DATA_NOW;
  const staleAfterMs = input.staleAfterMs ?? audienceDataStaleMs(input.env);
  const campaignId = (input.campaignId || "all").trim();
  const search = (input.search || "").trim().toLowerCase();
  const rows = clientRows(input.accountId).filter((source) => {
    if (campaignId !== "all" && !source.campaigns.some((campaign) => campaign.id === campaignId)) return false;
    if (!search) return true;
    return source.label.toLowerCase().includes(search) || source.type.toLowerCase().includes(search);
  });
  const presented = rows
    .sort((a, b) => b.leads - a.leads)
    .map((source) => presentClientRow(source, now, staleAfterMs, input.env));
  const audiences = presented.reduce((sum, row) => sum + row.audiences, 0);
  const maids = presented.reduce((sum, row) => sum + row.maids, 0);
  const accountName = clientRows(input.accountId)[0]?.accountName || "";
  const body = {
    example: true as const,
    recommendationOnly: true as const,
    accountId: input.accountId,
    accountName,
    summary: `${presented.length} source types · ${audiences} audiences · ${formatClientMaids(maids)} MAIDs`,
    rows: presented,
    campaigns: campaignChoices(rows),
  };
  return stripClient(body, input.reader ?? "client");
}

export function clientSourceDetail(accountId: string, publicId: string, reader: "client" | "share" = "client", now = AUDIENCE_DATA_NOW, staleAfterMs = audienceDataStaleMs(), env?: Env) {
  if (/vendor/i.test(publicId)) return null;
  const source = clientRows(accountId).find((row) => row.publicId === publicId);
  if (!source) return null;
  const base = presentClientRow(source, now, staleAfterMs, env);
  const groups = GROUP_ORDER.map((group) => {
    const selections = source.selections.filter((row) => row.group === group.id).map(presentSelection);
    return { id: group.id, title: group.title, count: selections.length, selections };
  });
  const detail = {
    ...base,
    audienceId: source.publicId,
    audienceName: source.audienceName,
    accountName: source.accountName,
    selectionCount: source.selections.length,
    why: source.why,
    recommendation: source.recommendation,
    workedOut: source.workedOut,
    groups,
    recommendationOnly: true as const,
    example: true as const,
  };
  return stripClient(detail, reader);
}

/** Refuses another account. Strips vendor identity and cost. Plain public ids only. */
export function readClientAudienceData(input: {
  ownAccountId: string;
  requestedAccountId?: string | null;
  sourceId?: string | null;
  reader?: "client" | "share";
  now?: string;
  env?: Env;
}) {
  const own = input.ownAccountId.trim();
  const requested = (input.requestedAccountId || own).trim();
  if (!own || requested !== own) return { ok: false as const, status: 403 as const, error: "Not allowed" as const };
  const reader = input.reader ?? "client";
  const sourceId = (input.sourceId || "").trim();
  if (sourceId) {
    const detail = clientSourceDetail(own, sourceId, reader, input.now, audienceDataStaleMs(input.env), input.env);
    if (!detail) return { ok: false as const, status: 404 as const, error: "Not found" as const };
    return { ok: true as const, body: detail };
  }
  return { ok: true as const, body: listClientSources({ accountId: own, reader, now: input.now, env: input.env }) };
}

/** Client and share payloads lose vendor identity and cost. Staff keeps both. */
export function audienceDataPayload(reader: AudienceReader, accountId = "org") {
  if (reader === "staff") {
    const list = listAudienceSources({ reader });
    const detail = audienceSourceDetail("vendor-a", reader);
    return { list, detail };
  }
  const list = listClientSources({ accountId, reader });
  const detail = clientSourceDetail(accountId, "1", reader);
  return { list, detail };
}

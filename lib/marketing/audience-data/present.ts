import { stripForAudience, type CostAudience } from "../channels/cost-strip";
import {
  AUDIENCE_DATA_NOW,
  EXAMPLE_SOURCES,
  LOW_MATCH_RATE,
  STALE_AFTER_MS,
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

export function refreshLabel(refreshedAt: string, now: string) {
  const age = Date.parse(now) - Date.parse(refreshedAt);
  const stale = age > STALE_AFTER_MS;
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
  vendor: string;
  type: string;
  campaigns: number;
  campaignIds: string[];
  audiences: number;
  maids: number;
  maidsLabel: string;
  match: PresentedMatch[];
  refreshed: string;
  stale: boolean;
  leads: number;
  leadQuality: number | null;
  qualityLabel: string;
  provisional: boolean;
  decisions: { scale: number; learning: number; cut: number };
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

function presentSelection(row: RawSelection): PresentedSelection {
  const measurable = row.leads !== null;
  return {
    id: row.id,
    value: row.value,
    logic: logicLabel(row.logic),
    maidsLabel: formatDelta(row.maidsDelta),
    leadsLabel: row.leads === null ? "—" : String(row.leads),
    qualityLabel: measurable ? qualityLabel(row.quality, row.provisional) : "Not measurable alone",
    measurable,
  };
}

function presentRow(source: RawSource, now: string): PresentedRow {
  const refresh = refreshLabel(source.refreshedAt, now);
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

function stripClient<T>(value: T, reader: AudienceReader): T {
  if (reader === "staff") return value;
  const audience: CostAudience = reader === "share" ? "share" : "client";
  return stripForAudience(value, audience);
}

export function listAudienceSources(input: {
  reader: AudienceReader;
  now?: string;
  campaignId?: string;
  search?: string;
  sort?: SortKey;
  direction?: "asc" | "desc";
  sources?: RawSource[];
}) {
  const now = input.now ?? AUDIENCE_DATA_NOW;
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
  const presented = rows.map((source) => presentRow(source, now));
  const audiences = presented.reduce((sum, row) => sum + row.audiences, 0);
  const maids = presented.reduce((sum, row) => sum + row.maids, 0);
  const body = {
    example: true as const,
    recommendationOnly: true as const,
    summary: `${presented.length} sources · ${audiences} audiences · ${formatMaids(maids)} MAIDs`,
    rows: presented,
    campaigns: campaignChoices(sources),
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

export function audienceSourceDetail(id: string, reader: AudienceReader, now = AUDIENCE_DATA_NOW, sources: RawSource[] = EXAMPLE_SOURCES): PresentedDetail | null {
  const source = sources.find((row) => row.id === id);
  if (!source) return null;
  const base = presentRow(source, now);
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

/** Client and share payloads lose data cost, spend, CPL, CPA, and ROAS. Staff keeps data cost. */
export function audienceDataPayload(reader: AudienceReader) {
  const list = listAudienceSources({ reader });
  const detail = audienceSourceDetail("vendor-a", reader);
  return { list, detail };
}

import { isolatedWhere } from "./workspace";

export const WASTE_REASONS = ["job_seekers", "free_diy", "wrong_location", "no_qualified_conversions"] as const;
export type WasteReason = (typeof WASTE_REASONS)[number];

export const REASON_LABELS: Record<WasteReason, string> = {
  job_seekers: "Job seekers",
  free_diy: "Free/DIY",
  wrong_location: "Wrong location",
  no_qualified_conversions: "No qualified conversions",
};

export type SearchMatchType = "exact" | "phrase" | "broad";
export type NegativeLevel = "campaign" | "ad_group" | "account";
export type WasteConfidence = "high" | "medium" | "low";

export type SearchTermRow = {
  workspaceId: string;
  adAccountId: string;
  campaignId: string | null;
  adGroupId: string | null;
  campaignName: string;
  adGroupName: string;
  date: string;
  term: string;
  matchType: SearchMatchType;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  qualifiedConversions: number;
  currency: string;
};

export type NegativeProposalDraft = {
  workspaceId: string;
  adAccountId: string;
  campaignId: string | null;
  adGroupId: string | null;
  scopeKey: string;
  campaignName: string;
  adGroupName: string;
  term: string;
  matchType: "exact" | "phrase";
  level: NegativeLevel;
  wasteSpend: number;
  currency: string;
  clicks: number;
  impressions: number;
  reason: WasteReason;
  reasonLabel: string;
  confidence: WasteConfidence;
  defaultAction: "block" | "keep";
  safetyNote: string;
  windowStart: string;
  windowEnd: string;
};

const JOB_PATTERN = /\b(jobs?|hiring|salary|career|resume|employment|recruit)\b/i;
const FREE_PATTERN = /\b(free|diy|how to|tutorial|youtube|homemade)\b/i;

export function normalizeTerm(term: string) {
  return term.trim().toLowerCase().replace(/\s+/g, " ");
}

export function termScopeKey(row: { campaignId: string | null; adGroupId: string | null; campaignName: string; adGroupName: string }) {
  const campaign = row.campaignId || row.campaignName.trim().toLowerCase();
  const adGroup = row.adGroupId || row.adGroupName.trim().toLowerCase();
  return `c:${campaign}|g:${adGroup}`;
}

export function negativeScopeKey(row: { campaignId: string | null; campaignName: string }) {
  if (row.campaignId || row.campaignName.trim()) return `c:${row.campaignId || row.campaignName.trim().toLowerCase()}`;
  return "account";
}

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i += 1) {
    const char = src[i];
    if (quoted) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }
  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((value) => value.trim())) rows.push(row);
  }
  return rows;
}

function headerIndex(headers: string[], names: string[]) {
  const normalized = headers.map((header) => header.trim().toLowerCase());
  for (const name of names) {
    const index = normalized.indexOf(name);
    if (index >= 0) return index;
  }
  return -1;
}

function cell(row: string[], index: number) {
  if (index < 0) return "";
  return (row[index] || "").trim();
}

function amount(raw: string) {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!cleaned || cleaned === "-") return 0;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

function matchTypeOf(raw: string): SearchMatchType {
  const value = raw.trim().toLowerCase();
  if (value.startsWith("exact")) return "exact";
  if (value.startsWith("phrase")) return "phrase";
  return "broad";
}

export function parseSearchTermsReport(
  csv: string,
  defaults: { workspaceId: string; adAccountId: string; currency?: string; date?: string },
): SearchTermRow[] {
  const workspaceId = defaults.workspaceId.trim();
  const adAccountId = defaults.adAccountId.trim();
  if (!workspaceId || !adAccountId) return [];
  const table = parseCsv(csv);
  if (table.length < 2) return [];
  const headers = table[0];
  const termIndex = headerIndex(headers, ["search term", "search terms", "query", "keyword"]);
  if (termIndex < 0) return [];
  const campaignIndex = headerIndex(headers, ["campaign"]);
  const adGroupIndex = headerIndex(headers, ["ad group", "ad group name", "adgroup"]);
  const matchIndex = headerIndex(headers, ["match type", "matched type"]);
  const impressionIndex = headerIndex(headers, ["impressions", "impr.", "impr"]);
  const clickIndex = headerIndex(headers, ["clicks"]);
  const costIndex = headerIndex(headers, ["cost", "spend"]);
  const conversionIndex = headerIndex(headers, ["conversions", "conv.", "all conv."]);
  const qualifiedIndex = headerIndex(headers, ["qualified conversions", "qualified conv."]);
  const currencyIndex = headerIndex(headers, ["currency code", "currency"]);
  const dateIndex = headerIndex(headers, ["day", "date"]);
  const fallbackDate = defaults.date || new Date().toISOString().slice(0, 10);
  const rows: SearchTermRow[] = [];
  for (const record of table.slice(1)) {
    const term = cell(record, termIndex);
    if (!term || term.toLowerCase() === "total") continue;
    const date = cell(record, dateIndex) || fallbackDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    rows.push({
      workspaceId,
      adAccountId,
      campaignId: null,
      adGroupId: null,
      campaignName: cell(record, campaignIndex),
      adGroupName: cell(record, adGroupIndex),
      date,
      term,
      matchType: matchTypeOf(cell(record, matchIndex)),
      impressions: Math.max(0, Math.round(amount(cell(record, impressionIndex)))),
      clicks: Math.max(0, Math.round(amount(cell(record, clickIndex)))),
      spend: Math.max(0, amount(cell(record, costIndex))),
      conversions: Math.max(0, amount(cell(record, conversionIndex))),
      qualifiedConversions: Math.max(0, amount(cell(record, qualifiedIndex))),
      currency: cell(record, currencyIndex) || defaults.currency || "USD",
    });
  }
  return rows;
}

function phrase(needle: string) {
  const escaped = needle.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escaped) return null;
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`, "i");
}

function matchesList(term: string, values: string[]) {
  return values.some((value) => {
    const pattern = phrase(value);
    return pattern ? pattern.test(term) : false;
  });
}

function reasonFor(term: string, otherLocations: string[]): WasteReason {
  if (JOB_PATTERN.test(term)) return "job_seekers";
  if (FREE_PATTERN.test(term)) return "free_diy";
  if (matchesList(term, otherLocations)) return "wrong_location";
  return "no_qualified_conversions";
}

function leadDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

function addUtcDays(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function findWastedSearchTerms(
  rows: SearchTermRow[],
  options: {
    workspaceId: string;
    now?: Date;
    windowDays?: number;
    brandTerms?: string[];
    otherLocations?: string[];
    minClicks?: number;
    minSpend?: number;
  },
): NegativeProposalDraft[] {
  const workspaceId = options.workspaceId.trim();
  if (!workspaceId) return [];
  const windowDays = Math.min(90, Math.max(1, Math.floor(options.windowDays ?? 7)));
  const end = (options.now ?? new Date()).toISOString().slice(0, 10);
  const start = addUtcDays(end, -(windowDays - 1));
  const minClicks = options.minClicks ?? 1;
  const minSpend = options.minSpend ?? 1;
  const brands = options.brandTerms ?? [];
  const places = options.otherLocations ?? [];
  const inWorkspace = rows.filter((row) => row.workspaceId === workspaceId);
  const mine = inWorkspace.filter((row) => row.date >= start && row.date <= end);

  const converting = new Map<string, string>();
  for (const row of inWorkspace) {
    if (row.conversions <= 0 && row.qualifiedConversions <= 0) continue;
    const key = normalizeTerm(row.term);
    const previous = converting.get(key);
    if (!previous || row.date > previous) converting.set(key, row.date);
  }

  type Bucket = {
    display: string;
    adAccountId: string;
    campaignId: string | null;
    adGroupId: string | null;
    campaignName: string;
    adGroupName: string;
    impressions: number;
    clicks: number;
    spend: number;
    conversions: number;
    qualifiedConversions: number;
    currency: string;
  };
  const buckets = new Map<string, Bucket>();
  for (const row of mine) {
    const term = normalizeTerm(row.term);
    if (!term) continue;
    const key = [row.adAccountId, negativeScopeKey(row), term].join("\t");
    const bucket = buckets.get(key) ?? {
      display: row.term.trim(),
      adAccountId: row.adAccountId,
      campaignId: row.campaignId,
      adGroupId: row.adGroupId,
      campaignName: row.campaignName,
      adGroupName: row.adGroupName,
      impressions: 0,
      clicks: 0,
      spend: 0,
      conversions: 0,
      qualifiedConversions: 0,
      currency: row.currency || "USD",
    };
    bucket.impressions += row.impressions;
    bucket.clicks += row.clicks;
    bucket.spend += row.spend;
    bucket.conversions += row.conversions;
    bucket.qualifiedConversions += row.qualifiedConversions;
    if (!bucket.campaignName && row.campaignName) bucket.campaignName = row.campaignName;
    if (!bucket.adGroupName && row.adGroupName) bucket.adGroupName = row.adGroupName;
    buckets.set(key, bucket);
  }

  const proposals: NegativeProposalDraft[] = [];
  for (const bucket of buckets.values()) {
    const term = normalizeTerm(bucket.display);
    if (bucket.qualifiedConversions > 0) continue;
    if (bucket.clicks < minClicks && bucket.spend < minSpend) continue;
    const reason = reasonFor(term, places);
    const patterned = reason !== "no_qualified_conversions";
    const confidence: WasteConfidence = patterned && bucket.conversions === 0 ? "high" : bucket.clicks >= 3 ? "medium" : "low";
    const convertedOn = converting.get(term);
    const brand = matchesList(term, brands);
    const notes: string[] = [];
    if (brand) notes.push("This search matches a brand name.");
    if (convertedOn) notes.push(`This search brought a lead on ${leadDate(convertedOn)}.`);
    const safety = brand || Boolean(convertedOn);
    const level: NegativeLevel = bucket.campaignName || bucket.campaignId ? "campaign" : "account";
    proposals.push({
      workspaceId,
      adAccountId: bucket.adAccountId,
      campaignId: bucket.campaignId,
      adGroupId: bucket.adGroupId,
      scopeKey: negativeScopeKey(bucket),
      campaignName: bucket.campaignName,
      adGroupName: level === "campaign" ? "" : bucket.adGroupName,
      term: bucket.display,
      matchType: "phrase",
      level,
      wasteSpend: roundMoney(bucket.spend),
      currency: bucket.currency,
      clicks: bucket.clicks,
      impressions: bucket.impressions,
      reason,
      reasonLabel: REASON_LABELS[reason],
      confidence,
      defaultAction: safety || confidence !== "high" ? "keep" : "block",
      safetyNote: notes.join(" "),
      windowStart: start,
      windowEnd: end,
    });
  }

  return proposals.sort((a, b) => a.reasonLabel.localeCompare(b.reasonLabel) || b.clicks - a.clicks || a.term.localeCompare(b.term));
}

function roundMoney(value: number) {
  return Math.round(value * 10000) / 10000;
}

export type ProposalView = {
  id?: string;
  term: string;
  matchType: "exact" | "phrase";
  level: NegativeLevel;
  levelLabel: string;
  campaignName: string;
  adGroupName: string;
  clicks: number;
  impressions: number;
  reason: WasteReason;
  reasonLabel: string;
  confidence: WasteConfidence;
  defaultAction: "block" | "keep";
  safetyNote: string;
  status?: string;
  spend?: number;
  currency?: string;
};

const LEVEL_LABEL: Record<NegativeLevel, string> = {
  campaign: "Campaign",
  ad_group: "Ad group",
  account: "Account",
};

export function presentProposal(
  proposal: NegativeProposalDraft & { id?: string; status?: string },
  seesCost: boolean,
): ProposalView {
  const view: ProposalView = {
    id: proposal.id,
    term: proposal.term,
    matchType: proposal.matchType,
    level: proposal.level,
    levelLabel: LEVEL_LABEL[proposal.level],
    campaignName: proposal.campaignName,
    adGroupName: proposal.adGroupName,
    clicks: proposal.clicks,
    impressions: proposal.impressions,
    reason: proposal.reason,
    reasonLabel: proposal.reasonLabel,
    confidence: proposal.confidence,
    defaultAction: proposal.defaultAction,
    safetyNote: proposal.safetyNote,
    status: proposal.status,
  };
  if (seesCost) {
    view.spend = proposal.wasteSpend;
    view.currency = proposal.currency;
  }
  return view;
}

export function groupProposals(rows: ProposalView[]) {
  const groups: { reason: string; label: string; rows: ProposalView[] }[] = [];
  for (const row of rows) {
    const current = groups.find((group) => group.reason === row.reason);
    if (current) current.rows.push(row);
    else groups.push({ reason: row.reason, label: row.reasonLabel, rows: [row] });
  }
  return groups;
}

function csvCell(value: string | number) {
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

const MATCH_LABEL = { exact: "Exact", phrase: "Phrase" } as const;

export function negativeKeywordCsv(
  rows: Array<ProposalView & { include?: boolean }>,
  seesCost: boolean,
) {
  const included = rows.filter((row) => row.include !== false && row.defaultAction !== "keep");
  const header = seesCost
    ? ["Campaign", "Ad group", "Keyword", "Match type", "Level", "Clicks", "Impressions", "Cost", "Currency", "Reason"]
    : ["Campaign", "Ad group", "Keyword", "Match type", "Level", "Clicks", "Impressions", "Reason"];
  const lines = [header.join(",")];
  for (const row of included) {
    const base = [
      csvCell(row.level === "account" ? "" : row.campaignName),
      csvCell(row.level === "ad_group" ? row.adGroupName : ""),
      csvCell(row.term),
      MATCH_LABEL[row.matchType],
      row.levelLabel,
      String(row.clicks),
      String(row.impressions),
    ];
    if (seesCost) base.push(csvCell(row.spend ?? ""), csvCell(row.currency ?? ""), csvCell(row.reasonLabel));
    else base.push(csvCell(row.reasonLabel));
    lines.push(base.join(","));
  }
  return `${lines.join("\n")}\n`;
}

export function proposalQuery(workspaceId: string, adAccountIds: "all" | string[]) {
  if (adAccountIds === "all") return isolatedWhere(workspaceId);
  return isolatedWhere(workspaceId, { adAccountId: { in: adAccountIds } });
}

import { collectsCostKeys, stripForAudience } from "../channels/cost-strip";
import { resolutionMoreChannels, type MoreResolution } from "../channels/video-channels";
import { jarvisUiV2Enabled, type Env } from "../config";

/** Good ≥ 50%, Fair 30–49%, Low — on hold under 30%. */
export function rateBand(percent: number) {
  if (percent < 30) return { word: "Low — on hold", band: "low" as const, hold: true };
  if (percent < 50) return { word: "Fair", band: "fair" as const, hold: false };
  return { word: "Good", band: "good" as const, hold: false };
}

export function formatCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

const VENDOR_KEY = /vendor|segmentid/i;

export type ResolutionWindow = 30 | 60 | 90;

export type RateRow = {
  id: string;
  label: string;
  category?: string;
  sent: number;
  matched: number;
  unmatched: number;
  percent: number;
  placeholder?: boolean;
};

/** Confirmed platforms. Anything else is a placeholder until it is added here. */
export const CONFIRMED_PLATFORMS = ["meta", "google_ads", "stackadapt"] as const;

export type IdentifierPart = {
  id: string;
  label: string;
  /** Short name used in the records-uploaded line. */
  short: string;
  uploaded: number;
  matched: number;
  unmatched: number;
  percent: number;
};

export function classifyPlatforms<T extends { id: string }>(rows: T[]) {
  const confirmed = new Set<string>(CONFIRMED_PLATFORMS);
  return rows.map((row) => ({ ...row, placeholder: !confirmed.has(row.id) }));
}

/** Appends an identifier type. The list is not fixed at five. */
export function withIdentifier(parts: IdentifierPart[], extra: IdentifierPart) {
  return [...parts, extra];
}

export type ResolutionReport = {
  id: string;
  title: string;
  audienceName: string;
  type: string;
  accountId: string;
  accountName: string;
  example: true;
  updated: string;
  definition: string;
  uploaded: number;
  parts: IdentifierPart[];
  matchedAny: number;
  unmatched: number;
  platforms: RateRow[];
  /** YouTube and CTV sit under the platform table. Omitted while JARVIS_UI_V2 is off. */
  moreChannels?: MoreResolution[];
  bySource: RateRow[];
  windows: Record<ResolutionWindow, { from: number; to: number; points: { label: string; percent: number }[] }>;
  why: string;
  recommendation: string;
  workedOut: string[];
  vendor?: string;
  vendorId?: string;
};

const PARTS: IdentifierPart[] = [
  { id: "maid", label: "MAID (mobile ad ID)", short: "MAIDs", uploaded: 2_410_000, matched: 1_620_000, unmatched: 790_000, percent: 67 },
  { id: "email", label: "Hashed email", short: "emails", uploaded: 1_100_000, matched: 720_000, unmatched: 380_000, percent: 65 },
  { id: "phone", label: "Phone", short: "phones", uploaded: 640_000, matched: 330_000, unmatched: 310_000, percent: 52 },
  { id: "ipv4", label: "IPv4 / household", short: "IPv4/household", uploaded: 620_000, matched: 150_000, unmatched: 470_000, percent: 24 },
  { id: "ipv6", label: "IPv6 / household", short: "IPv6/household", uploaded: 260_000, matched: 60_000, unmatched: 200_000, percent: 23 },
];

const PLATFORMS: RateRow[] = classifyPlatforms([
  { id: "meta", label: "Meta", sent: 5_030_000, matched: 3_220_000, unmatched: 1_810_000, percent: 64 },
  { id: "google_ads", label: "Google", sent: 5_030_000, matched: 2_460_000, unmatched: 2_570_000, percent: 49 },
  { id: "stackadapt", label: "StackAdapt", sent: 5_030_000, matched: 2_870_000, unmatched: 2_160_000, percent: 57 },
  { id: "trade_desk", label: "The Trade Desk (other)", sent: 5_030_000, matched: 1_360_000, unmatched: 3_670_000, percent: 27 },
]);

const SOURCES: (RateRow & { vendor: string; vendorId: string; vendorSegmentIds: string[]; clientLabel: string })[] = [
  { id: "1", vendor: "Vendor A", vendorId: "vnd_a", vendorSegmentIds: ["seg_a_1"], clientLabel: "Intent data source", label: "Vendor A", category: "Intent (B2C)", sent: 2_100_000, matched: 1_360_000, unmatched: 740_000, percent: 65 },
  { id: "2", vendor: "Vendor B", vendorId: "vnd_b", vendorSegmentIds: ["seg_b_1"], clientLabel: "Demographic data source", label: "Vendor B", category: "Demographic + household", sent: 1_550_000, matched: 930_000, unmatched: 620_000, percent: 60 },
  { id: "3", vendor: "Vendor C", vendorId: "vnd_c", vendorSegmentIds: ["seg_c_1"], clientLabel: "Purchase data source", label: "Vendor C", category: "Purchase / behavioral", sent: 820_000, matched: 390_000, unmatched: 430_000, percent: 48 },
  { id: "4", vendor: "Vendor D", vendorId: "vnd_d", vendorSegmentIds: ["seg_d_1"], clientLabel: "Device data source", label: "Vendor D", category: "Device / app", sent: 560_000, matched: 160_000, unmatched: 400_000, percent: 29 },
];

const WINDOWS: ResolutionReport["windows"] = {
  30: { from: 58, to: 63, points: [
    { label: "Wk 1", percent: 58 }, { label: "Wk 2", percent: 59 }, { label: "Wk 3", percent: 61 },
    { label: "Wk 4", percent: 60 }, { label: "Wk 5", percent: 62 }, { label: "Now", percent: 63 },
  ] },
  60: { from: 54, to: 63, points: [
    { label: "Wk 1", percent: 54 }, { label: "Wk 2", percent: 55 }, { label: "Wk 3", percent: 57 },
    { label: "Wk 4", percent: 58 }, { label: "Wk 5", percent: 60 }, { label: "Now", percent: 63 },
  ] },
  90: { from: 49, to: 63, points: [
    { label: "Wk 1", percent: 49 }, { label: "Wk 2", percent: 52 }, { label: "Wk 3", percent: 55 },
    { label: "Wk 4", percent: 58 }, { label: "Wk 5", percent: 60 }, { label: "Now", percent: 63 },
  ] },
};

const HARBOR_CAMPAIGNS = new Set(["all", "implants", "crowns"]);
const GULF_CAMPAIGNS = new Set(["all", "spring"]);

const STAFF_SOURCE_IDS: Record<string, string> = {
  "vendor-a": "1",
  "vendor-b": "2",
  "vendor-c": "3",
  "vendor-d": "4",
};

function withMoreChannels(report: ResolutionReport, env?: Env): ResolutionReport {
  const google = report.platforms.find((row) => row.id === "google_ads");
  const moreChannels = resolutionMoreChannels(google?.percent ?? null, jarvisUiV2Enabled(env));
  if (!moreChannels) return report;
  return { ...report, moreChannels };
}

function harborReport(reader: "staff" | "client" | "share", sourcePublicId?: string, env?: Env): ResolutionReport {
  const source = sourcePublicId ? SOURCES.find((row) => row.id === sourcePublicId) : undefined;
  const staff = reader === "staff";
  const title = source
    ? staff ? `${source.vendor} · ${source.category}` : `${source.clientLabel} · ${source.category}`
    : staff ? "Resolution Data across all audiences" : "Resolution Data across your audiences";
  const why = staff
    ? "This audience is under 30% on The Trade Desk (27%), so it is on hold there. IPv4 / household matches at 24% and IPv6 / household matches at 23%; Vendor D matches at 29%."
    : "Your audience is under 30% on The Trade Desk (27%), so it is on hold there. IPv4 / household matches at 24% and IPv6 / household matches at 23%; Device and app data source matches at 29%.";
  const recommendation = staff
    ? "consider adding hashed emails for these records or rebuilding the audience with fewer IP-only records. Nothing changes until your team builds it in the data market."
    : "your Specificity team may suggest adding hashed emails for these records or rebuilding the audience with fewer IP-only records. Nothing changes until your Specificity team makes the change.";
  const report: ResolutionReport = {
    id: source?.id || "all",
    title,
    audienceName: "Implant intent 55+",
    type: source?.category || "All audiences",
    accountId: "org",
    accountName: "Harbor Dental",
    example: true,
    updated: "Updated 2h ago",
    definition: "Match rate = matched records ÷ records sent to that platform. Counts are de-duplicated per identifier type.",
    uploaded: 5_030_000,
    parts: PARTS,
    matchedAny: 2_880_000,
    unmatched: 2_150_000,
    platforms: PLATFORMS,
    bySource: SOURCES.map((row) => ({
      id: row.id,
      label: staff ? row.vendor : row.clientLabel,
      category: row.category,
      sent: row.sent,
      matched: row.matched,
      unmatched: row.unmatched,
      percent: row.percent,
    })),
    windows: WINDOWS,
    why,
    recommendation,
    workedOut: [
      "Inputs: records sent, matched counts, and the 30% hold line.",
      "The Trade Desk is a placeholder. Only Meta, Google, and StackAdapt are confirmed. It matched 27%.",
      "IPv4 / household matches at 24%. IPv6 / household matches at 23%.",
      "Recommendation only. Nothing is paused, edited, or rebuilt.",
    ],
  };
  if (staff && source) report.vendor = source.vendor;
  if (staff && source) report.vendorId = source.vendorId;
  const withMore = withMoreChannels(report, env);
  return reader === "staff" ? withMore : stripResolution(withMore);
}

function gulfReport(env?: Env): ResolutionReport {
  const report: ResolutionReport = {
    id: "1",
    title: "Resolution Data across your audiences",
    audienceName: "Regional firms",
    type: "Firmographic (B2B)",
    accountId: "gulf",
    accountName: "Gulf Pest",
    example: true,
    updated: "Updated 2h ago",
    definition: "Match rate = matched records ÷ records sent to that platform. Counts are de-duplicated per identifier type.",
    uploaded: 80_000,
    parts: [
      { id: "maid", label: "MAID (mobile ad ID)", short: "MAIDs", uploaded: 50_000, matched: 30_000, unmatched: 20_000, percent: 60 },
      { id: "email", label: "Hashed email", short: "emails", uploaded: 20_000, matched: 12_000, unmatched: 8_000, percent: 60 },
      { id: "phone", label: "Phone", short: "phones", uploaded: 6_000, matched: 3_000, unmatched: 3_000, percent: 50 },
      { id: "ipv4", label: "IPv4 / household", short: "IPv4/household", uploaded: 2_400, matched: 1_200, unmatched: 1_200, percent: 50 },
      { id: "ipv6", label: "IPv6 / household", short: "IPv6/household", uploaded: 1_600, matched: 800, unmatched: 800, percent: 50 },
    ],
    matchedAny: 47_000,
    unmatched: 33_000,
    platforms: classifyPlatforms([
      { id: "meta", label: "Meta", sent: 80_000, matched: 48_000, unmatched: 32_000, percent: 60 },
      { id: "google_ads", label: "Google", sent: 80_000, matched: 40_000, unmatched: 40_000, percent: 50 },
      { id: "stackadapt", label: "StackAdapt", sent: 80_000, matched: 36_000, unmatched: 44_000, percent: 45 },
    ]),
    bySource: [
      { id: "1", label: "Firmographic data source", category: "Firmographic (B2B)", sent: 80_000, matched: 47_000, unmatched: 33_000, percent: 59 },
    ],
    windows: {
      30: { from: 55, to: 59, points: [{ label: "Wk 1", percent: 55 }, { label: "Now", percent: 59 }] },
      60: { from: 52, to: 59, points: [{ label: "Wk 1", percent: 52 }, { label: "Now", percent: 59 }] },
      90: { from: 50, to: 59, points: [{ label: "Wk 1", percent: 50 }, { label: "Now", percent: 59 }] },
    },
    why: "Your audience is above the hold line on every connected platform.",
    recommendation: "your Specificity team may suggest leaving this audience as it is. Nothing changes until your Specificity team makes the change.",
    workedOut: ["Inputs: records sent and the 30% hold line.", "Recommendation only. Nothing is written."],
  };
  return stripResolution(withMoreChannels(report, env));
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

function campaignsFor(accountId: string) {
  if (accountId === "org") return HARBOR_CAMPAIGNS;
  if (accountId === "gulf") return GULF_CAMPAIGNS;
  return new Set(["all"]);
}

export function readResolution(input: {
  reader: "staff" | "client" | "share";
  sourceId?: string | null;
  ownAccountId?: string;
  requestedAccountId?: string | null;
  campaignId?: string | null;
  env?: Env;
}) {
  const campaignId = (input.campaignId || "all").trim() || "all";
  if (input.reader !== "staff") {
    const own = (input.ownAccountId || "").trim();
    const requested = (input.requestedAccountId || own).trim();
    if (!own || requested !== own) return { ok: false as const, status: 403 as const, error: "Not allowed" as const };
    if (campaignId !== "all" && !campaignsFor(own).has(campaignId)) {
      return { ok: false as const, status: 403 as const, error: "Not allowed" as const };
    }
    const sourceId = (input.sourceId || "").trim();
    if (/vendor/i.test(sourceId)) return { ok: false as const, status: 404 as const, error: "Not found" as const };
    if (own === "gulf") {
      if (sourceId && sourceId !== "1") return { ok: false as const, status: 404 as const, error: "Not found" as const };
      const body = gulfReport(input.env);
      if (collectsCostKeys(body).length) return { ok: false as const, status: 500 as const, error: "Not allowed" as const };
      return { ok: true as const, body };
    }
    if (own !== "org") return { ok: false as const, status: 404 as const, error: "Not found" as const };
    if (sourceId && !SOURCES.some((row) => row.id === sourceId)) return { ok: false as const, status: 404 as const, error: "Not found" as const };
    const body = harborReport(input.reader, sourceId || undefined, input.env);
    if (collectsCostKeys(body).length) return { ok: false as const, status: 500 as const, error: "Not allowed" as const };
    return { ok: true as const, body };
  }
  const sourceId = (input.sourceId || "").trim();
  const publicId = STAFF_SOURCE_IDS[sourceId] || (SOURCES.some((row) => row.id === sourceId) ? sourceId : "");
  if (sourceId && !publicId) return { ok: false as const, status: 404 as const, error: "Not found" as const };
  return { ok: true as const, body: harborReport("staff", publicId || undefined, input.env) };
}

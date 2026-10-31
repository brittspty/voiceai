/** Example catalog only. Vendors are placeholders. Nothing here calls the network. */

export const AUDIENCE_DATA_NOW = "2026-10-31T21:12:00.000Z";
export const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
export const LOW_MATCH_RATE = 0.3;

export type PlatformId = "meta" | "google_ads" | "stackadapt";

export type CampaignRef = { id: string; name: string };

export type MatchRate = { platform: PlatformId; rate: number };

export type DecisionCounts = { scale: number; learning: number; cut: number };

export type SelectionGroupId = "intent" | "demographics" | "geography" | "behavioral" | "device" | "firmographic";

export type SelectionLogic = "include_or" | "and" | "and_narrows" | "exclude" | "or" | "unused";

export type RawSelection = {
  id: string;
  group: SelectionGroupId;
  value: string;
  logic: SelectionLogic;
  maidsDelta: number | null;
  leads: number | null;
  quality: number | null;
  provisional: boolean;
};

export type RawSource = {
  id: string;
  vendor: string;
  type: string;
  b2c: boolean;
  campaigns: CampaignRef[];
  audienceCount: number;
  maids: number;
  match: MatchRate[];
  refreshedAt: string;
  leads: number;
  /** Null until a CRM outcome exists. */
  leadQuality: number | null;
  provisional: boolean;
  decisions: DecisionCounts;
  audienceId: string;
  audienceName: string;
  selections: RawSelection[];
  why: string;
  recommendation: string;
  workedOut: string[];
  /** Staff-only. Stripped for every client and share payload. */
  dataCostCpm: number;
  spend: number;
  cpl: number;
  cpa: number;
  roas: number;
};

export const CAMPAIGNS: CampaignRef[] = [
  { id: "harbor", name: "Harbor Dental · Implants 55+" },
  { id: "gulf", name: "Gulf Pest · Spring" },
  { id: "coastal", name: "Coastal Roofing · Storm" },
];

const harbor = CAMPAIGNS[0];
const gulf = CAMPAIGNS[1];
const coastal = CAMPAIGNS[2];

function hoursBefore(hours: number) {
  return new Date(Date.parse(AUDIENCE_DATA_NOW) - hours * 60 * 60 * 1000).toISOString();
}

export const EXAMPLE_SOURCES: RawSource[] = [
  {
    id: "vendor-a",
    vendor: "Vendor A",
    type: "Intent (B2C)",
    b2c: true,
    campaigns: [harbor, gulf, coastal, { id: "north", name: "Northwind · Consult" }],
    audienceCount: 9,
    maids: 2_410_000,
    match: [
      { platform: "meta", rate: 0.62 },
      { platform: "google_ads", rate: 0.48 },
      { platform: "stackadapt", rate: 0.55 },
    ],
    refreshedAt: hoursBefore(4),
    leads: 412,
    leadQuality: 71,
    provisional: false,
    decisions: { scale: 2, learning: 3, cut: 0 },
    audienceId: "implant-intent-55",
    audienceName: "Implant intent 55+",
    dataCostCpm: 3.1,
    spend: 1840,
    cpl: 4.47,
    cpa: 21,
    roas: 2.4,
    why: "Intent topics drive 86% of this source's leads. The 14-day recency window cuts reach by 1.12M MAIDs but leads from it score 9 points higher.",
    recommendation: "Test a 30-day window in a new sub-segment. Nothing changes until your team builds it in the data market.",
    workedOut: [
      "Inputs: topic selections for dental implants and denture replacement, keyword selections, and a 14-day recency window.",
      "412 leads were counted once per person. Intent topics account for 86% of them.",
      "The recency window removes 1.12M MAIDs. Leads that remain score 9 points higher.",
      "Recommendation only. No data-market write and no ad-account write.",
    ],
    selections: [
      { id: "a-implants", group: "intent", value: "Topic: dental implants", logic: "include_or", maidsDelta: 820_000, leads: 188, quality: 74, provisional: true },
      { id: "a-denture", group: "intent", value: "Topic: denture replacement", logic: "include_or", maidsDelta: 410_000, leads: 96, quality: 69, provisional: true },
      { id: "a-keywords", group: "intent", value: "Keywords: “implant cost”, “same-day teeth”", logic: "include_or", maidsDelta: 290_000, leads: 71, quality: 72, provisional: true },
      { id: "a-recency", group: "intent", value: "Recency window: last 14 days", logic: "and_narrows", maidsDelta: -1_120_000, leads: null, quality: null, provisional: false },
      { id: "a-age", group: "demographics", value: "Age 55–74", logic: "and", maidsDelta: -610_000, leads: null, quality: null, provisional: false },
      { id: "a-income", group: "demographics", value: "Household income $75K+", logic: "and", maidsDelta: -240_000, leads: null, quality: null, provisional: false },
      { id: "a-home", group: "demographics", value: "Homeowner household", logic: "and", maidsDelta: -95_000, leads: null, quality: null, provisional: false },
      { id: "a-zips", group: "geography", value: "ZIPs within 25 mi of 2 clinics", logic: "and", maidsDelta: -3_100_000, leads: null, quality: null, provisional: false },
      { id: "a-patients", group: "geography", value: "Excluded: existing patient ZIP+4 list", logic: "exclude", maidsDelta: -18_000, leads: null, quality: null, provisional: false },
      { id: "a-otc", group: "behavioral", value: "Bought OTC denture adhesive, last 90 days", logic: "or", maidsDelta: 160_000, leads: 41, quality: 61, provisional: true },
      { id: "a-apps", group: "device", value: "Health & fitness app users", logic: "or", maidsDelta: 70_000, leads: 16, quality: 52, provisional: true },
      { id: "a-devices", group: "device", value: "Excluded: devices seen < 2 times in 30 days", logic: "exclude", maidsDelta: -44_000, leads: null, quality: null, provisional: false },
      { id: "a-firm", group: "firmographic", value: "Not used: B2C audience", logic: "unused", maidsDelta: null, leads: null, quality: null, provisional: false },
    ],
  },
  {
    id: "vendor-b",
    vendor: "Vendor B",
    type: "Demographic + household",
    b2c: true,
    campaigns: [harbor, gulf, coastal],
    audienceCount: 6,
    maids: 1_880_000,
    match: [
      { platform: "meta", rate: 0.58 },
      { platform: "google_ads", rate: 0.51 },
      { platform: "stackadapt", rate: 0.27 },
    ],
    refreshedAt: hoursBefore(24),
    leads: 298,
    leadQuality: 64,
    provisional: false,
    decisions: { scale: 1, learning: 2, cut: 1 },
    audienceId: "household-55",
    audienceName: "Household 55+",
    dataCostCpm: 2.4,
    spend: 990,
    cpl: 3.32,
    cpa: 18,
    roas: 1.8,
    why: "Household filters narrow the pool. StackAdapt match rate is under 30%, so that platform stays on hold.",
    recommendation: "Keep the household filters. Do not move money. A person decides any campaign change by hand.",
    workedOut: [
      "Inputs: age, income, and homeowner selections, plus one intent topic.",
      "298 leads. Lead quality 64 from staff marks.",
      "StackAdapt matched 27% of MAIDs, under the 30% hold line.",
      "Recommendation only. No budget is written.",
    ],
    selections: [
      { id: "b-topic", group: "intent", value: "Topic: dental care", logic: "include_or", maidsDelta: 640_000, leads: 120, quality: 66, provisional: true },
      { id: "b-age", group: "demographics", value: "Age 55–74", logic: "and", maidsDelta: -400_000, leads: null, quality: null, provisional: false },
      { id: "b-income", group: "demographics", value: "Household income $75K+", logic: "and", maidsDelta: -180_000, leads: null, quality: null, provisional: false },
      { id: "b-zip", group: "geography", value: "ZIPs within 25 mi of 2 clinics", logic: "and", maidsDelta: -900_000, leads: null, quality: null, provisional: false },
      { id: "b-buy", group: "behavioral", value: "Bought dental care products, last 90 days", logic: "or", maidsDelta: 90_000, leads: 28, quality: 60, provisional: true },
      { id: "b-dev", group: "device", value: "Excluded: devices seen < 2 times in 30 days", logic: "exclude", maidsDelta: -22_000, leads: null, quality: null, provisional: false },
      { id: "b-firm", group: "firmographic", value: "Not used: B2C audience", logic: "unused", maidsDelta: null, leads: null, quality: null, provisional: false },
    ],
  },
  {
    id: "vendor-c",
    vendor: "Vendor C",
    type: "Purchase / behavioral",
    b2c: true,
    campaigns: [harbor, gulf],
    audienceCount: 4,
    maids: 960_000,
    match: [
      { platform: "meta", rate: 0.44 },
      { platform: "google_ads", rate: 0.39 },
      { platform: "stackadapt", rate: 0.41 },
    ],
    refreshedAt: hoursBefore(72),
    leads: 131,
    leadQuality: 58,
    provisional: true,
    decisions: { scale: 0, learning: 3, cut: 1 },
    audienceId: "recent-buyers",
    audienceName: "Recent buyers",
    dataCostCpm: 4.2,
    spend: 640,
    cpl: 4.89,
    cpa: 26,
    roas: 1.1,
    why: "Purchase selections add leads, and quality is still provisional until CRM outcomes arrive.",
    recommendation: "Keep learning. Do not scale or cut from this screen.",
    workedOut: [
      "Inputs: one purchase selection over 90 days.",
      "131 leads. Quality 58 is provisional.",
      "Recommendation only. Nothing is sent to a vendor or an ad account.",
    ],
    selections: [
      { id: "c-buy", group: "intent", value: "Topic: treatment research", logic: "include_or", maidsDelta: 210_000, leads: 40, quality: 57, provisional: true },
      { id: "c-age", group: "demographics", value: "Age 45–74", logic: "and", maidsDelta: -120_000, leads: null, quality: null, provisional: false },
      { id: "c-zip", group: "geography", value: "ZIPs within 25 mi of 2 clinics", logic: "and", maidsDelta: -300_000, leads: null, quality: null, provisional: false },
      { id: "c-otc", group: "behavioral", value: "Bought OTC denture adhesive, last 90 days", logic: "or", maidsDelta: 160_000, leads: 41, quality: 61, provisional: true },
      { id: "c-dev", group: "device", value: "Mobile web visitors", logic: "or", maidsDelta: 40_000, leads: 8, quality: 50, provisional: true },
      { id: "c-firm", group: "firmographic", value: "Not used: B2C audience", logic: "unused", maidsDelta: null, leads: null, quality: null, provisional: false },
    ],
  },
  {
    id: "vendor-d",
    vendor: "Vendor D",
    type: "Device / app",
    b2c: true,
    campaigns: [gulf, coastal],
    audienceCount: 3,
    maids: 1_120_000,
    match: [
      { platform: "meta", rate: 0.71 },
      { platform: "google_ads", rate: 0.24 },
      { platform: "stackadapt", rate: 0.66 },
    ],
    refreshedAt: hoursBefore(6),
    leads: 87,
    leadQuality: 49,
    provisional: true,
    decisions: { scale: 0, learning: 1, cut: 2 },
    audienceId: "app-users",
    audienceName: "Health app users",
    dataCostCpm: 1.9,
    spend: 410,
    cpl: 4.71,
    cpa: 19,
    roas: 0.9,
    why: "Google Ads match rate is under 30%, so that platform is on hold. Two audiences are marked cut as a recommendation only.",
    recommendation: "Leave the cuts as a recommendation. A person pauses them by hand if they agree.",
    workedOut: [
      "Inputs: health and fitness app users, minus devices seen fewer than 2 times.",
      "87 leads. Quality 49 is provisional.",
      "Google Ads matched 24% of MAIDs.",
      "Recommendation only. This screen does not pause ads.",
    ],
    selections: [
      { id: "d-topic", group: "intent", value: "Topic: wellness", logic: "include_or", maidsDelta: 180_000, leads: 22, quality: 48, provisional: true },
      { id: "d-age", group: "demographics", value: "Age 25–54", logic: "and", maidsDelta: -200_000, leads: null, quality: null, provisional: false },
      { id: "d-zip", group: "geography", value: "ZIPs within 40 mi", logic: "and", maidsDelta: -500_000, leads: null, quality: null, provisional: false },
      { id: "d-buy", group: "behavioral", value: "Bought fitness accessories, last 90 days", logic: "or", maidsDelta: 60_000, leads: 11, quality: 47, provisional: true },
      { id: "d-apps", group: "device", value: "Health & fitness app users", logic: "or", maidsDelta: 70_000, leads: 16, quality: 52, provisional: true },
      { id: "d-seen", group: "device", value: "Excluded: devices seen < 2 times in 30 days", logic: "exclude", maidsDelta: -44_000, leads: null, quality: null, provisional: false },
      { id: "d-firm", group: "firmographic", value: "Not used: B2C audience", logic: "unused", maidsDelta: null, leads: null, quality: null, provisional: false },
    ],
  },
  {
    id: "vendor-e",
    vendor: "Vendor E",
    type: "Firmographic (B2B)",
    b2c: false,
    campaigns: [coastal],
    audienceCount: 2,
    maids: 310_000,
    match: [
      { platform: "meta", rate: 0.39 },
      { platform: "google_ads", rate: 0.35 },
      { platform: "stackadapt", rate: 0.33 },
    ],
    refreshedAt: hoursBefore(12 * 24),
    leads: 22,
    leadQuality: null,
    provisional: false,
    decisions: { scale: 0, learning: 2, cut: 0 },
    audienceId: "b2b-firms",
    audienceName: "Regional firms",
    dataCostCpm: 6.5,
    spend: 220,
    cpl: 10,
    cpa: 40,
    roas: 0.4,
    why: "This source has not refreshed in 12 days, so it is stale. No CRM outcome is recorded yet.",
    recommendation: "Ask the data team to re-sync. Do not scale it from here.",
    workedOut: [
      "Inputs: company size and industry selections for a B2B audience.",
      "22 leads. No CRM outcome yet, so lead quality stays blank.",
      "Last refresh is older than 7 days.",
      "Recommendation only. Re-sync is a request, not a send.",
    ],
    selections: [
      { id: "e-topic", group: "intent", value: "Topic: commercial roofing", logic: "include_or", maidsDelta: 80_000, leads: 9, quality: null, provisional: false },
      { id: "e-age", group: "demographics", value: "Not used: firmographic audience", logic: "unused", maidsDelta: null, leads: null, quality: null, provisional: false },
      { id: "e-zip", group: "geography", value: "ZIPs in the service area", logic: "and", maidsDelta: -40_000, leads: null, quality: null, provisional: false },
      { id: "e-buy", group: "behavioral", value: "Not used on this audience", logic: "unused", maidsDelta: null, leads: null, quality: null, provisional: false },
      { id: "e-dev", group: "device", value: "Not used on this audience", logic: "unused", maidsDelta: null, leads: null, quality: null, provisional: false },
      { id: "e-size", group: "firmographic", value: "Company size 20–200", logic: "and", maidsDelta: -90_000, leads: null, quality: null, provisional: false },
      { id: "e-industry", group: "firmographic", value: "Industry: construction", logic: "include_or", maidsDelta: 120_000, leads: 13, quality: null, provisional: false },
    ],
  },
];

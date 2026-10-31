export const VERTICALS = ["home_services", "marine", "healthcare", "medicare", "financial_services"] as const;
export type Vertical = (typeof VERTICALS)[number];

export const METRIC_CATEGORIES = [
  "acquisition",
  "engagement",
  "conversion",
  "revenue",
  "roas",
  "ltv",
  "cac",
  "payback",
  "speed_to_lead",
  "lead_quality",
  "attribution",
  "incrementality",
] as const;
export type MetricCategory = (typeof METRIC_CATEGORIES)[number];

export type MetricDirection = "higher_better" | "lower_better";

export type MetricBenchmarks = Partial<Record<Vertical, number>>;

/**
 * Channel labels the dictionary can name.
 * Fact tables for StackAdapt, Google Business Profile, and the cross-channel daily model
 * belong to those PRs. This catalog does not create them.
 */
export type DictionaryChannel =
  | "meta"
  | "google_ads"
  | "stackadapt"
  | "gbp"
  | "landing_page"
  | "voice"
  | "crm"
  | "maid"
  | "all";

export type CatalogMetric = {
  id: string;
  name: string;
  definition: string;
  formula: string;
  unit: string;
  direction: MetricDirection;
  category: MetricCategory;
  channels: DictionaryChannel[];
  staffOnly: boolean;
  benchmarks: MetricBenchmarks;
};

const ALL: DictionaryChannel[] = ["all"];

function metric(row: CatalogMetric): CatalogMetric {
  return row;
}

/** The module every bot and screen reads. Stored rows override a field; they do not invent a second dictionary. */
export const METRIC_CATALOG: CatalogMetric[] = [
  metric({
    id: "impressions",
    name: "Impressions",
    definition: "How many times ads or listings were shown.",
    formula: "sum(impressions)",
    unit: "count",
    direction: "higher_better",
    category: "acquisition",
    channels: ALL,
    staffOnly: false,
    benchmarks: {},
  }),
  metric({
    id: "reach",
    name: "Reach",
    definition: "How many people saw the ad at least once.",
    formula: "sum(reach)",
    unit: "count",
    direction: "higher_better",
    category: "acquisition",
    channels: ["meta", "stackadapt"],
    staffOnly: false,
    benchmarks: {},
  }),
  metric({
    id: "clicks",
    name: "Clicks",
    definition: "How many times people clicked.",
    formula: "sum(clicks)",
    unit: "count",
    direction: "higher_better",
    category: "acquisition",
    channels: ALL,
    staffOnly: false,
    benchmarks: {},
  }),
  metric({
    id: "ctr",
    name: "Click-through rate",
    definition: "Clicks divided by impressions.",
    formula: "clicks / impressions",
    unit: "rate",
    direction: "higher_better",
    category: "acquisition",
    channels: ALL,
    staffOnly: false,
    benchmarks: { home_services: 0.012, marine: 0.01, healthcare: 0.009, medicare: 0.008, financial_services: 0.007 },
  }),
  metric({
    id: "cpc",
    name: "Cost per click",
    definition: "Spend divided by clicks.",
    formula: "spend / clicks",
    unit: "currency",
    direction: "lower_better",
    category: "acquisition",
    channels: ALL,
    staffOnly: true,
    benchmarks: { home_services: 3.5, marine: 2.8, healthcare: 4.2, medicare: 6, financial_services: 5.5 },
  }),
  metric({
    id: "cpm",
    name: "Cost per thousand impressions",
    definition: "Spend divided by impressions, times 1,000.",
    formula: "spend / impressions * 1000",
    unit: "currency",
    direction: "lower_better",
    category: "acquisition",
    channels: ["meta", "stackadapt"],
    staffOnly: true,
    benchmarks: { home_services: 14, marine: 12, healthcare: 16, medicare: 22, financial_services: 18 },
  }),
  metric({
    id: "spend",
    name: "Spend",
    definition: "Money the ad platforms report as spent.",
    formula: "sum(spend)",
    unit: "currency",
    direction: "lower_better",
    category: "acquisition",
    channels: ALL,
    staffOnly: true,
    benchmarks: {},
  }),
  metric({
    id: "frequency",
    name: "Frequency",
    definition: "How many times the average person saw the ad.",
    formula: "impressions / reach",
    unit: "ratio",
    direction: "lower_better",
    category: "acquisition",
    channels: ["meta", "stackadapt"],
    staffOnly: false,
    benchmarks: { home_services: 2.5, marine: 2.5, healthcare: 3, medicare: 3, financial_services: 2.5 },
  }),
  metric({
    id: "engagement_rate",
    name: "Engagement rate",
    definition: "Engaged people divided by people reached.",
    formula: "engagements / reach",
    unit: "rate",
    direction: "higher_better",
    category: "engagement",
    channels: ALL,
    staffOnly: false,
    benchmarks: { home_services: 0.02, marine: 0.018, healthcare: 0.015, medicare: 0.012, financial_services: 0.01 },
  }),
  metric({
    id: "video_view_rate",
    name: "Video view rate",
    definition: "Video views divided by impressions.",
    formula: "video_views / impressions",
    unit: "rate",
    direction: "higher_better",
    category: "engagement",
    channels: ["meta", "stackadapt"],
    staffOnly: false,
    benchmarks: {},
  }),
  metric({
    id: "leads",
    name: "Leads",
    definition: "People who asked to be contacted, counted once.",
    formula: "count(distinct person where lead)",
    unit: "count",
    direction: "higher_better",
    category: "conversion",
    channels: ALL,
    staffOnly: false,
    benchmarks: {},
  }),
  metric({
    id: "conversion_rate",
    name: "Conversion rate",
    definition: "Verified conversions divided by people in the group.",
    formula: "verified_conversions / people",
    unit: "rate",
    direction: "higher_better",
    category: "conversion",
    channels: ALL,
    staffOnly: false,
    benchmarks: { home_services: 0.08, marine: 0.06, healthcare: 0.07, medicare: 0.05, financial_services: 0.04 },
  }),
  metric({
    id: "conversions",
    name: "Verified conversions",
    definition: "Conversions that passed source, dedupe, and contact checks.",
    formula: "count(verified conversions)",
    unit: "count",
    direction: "higher_better",
    category: "conversion",
    channels: ALL,
    staffOnly: false,
    benchmarks: {},
  }),
  metric({
    id: "qualified_rate",
    name: "Qualified rate",
    definition: "Leads marked qualified divided by leads.",
    formula: "qualified / leads",
    unit: "rate",
    direction: "higher_better",
    category: "conversion",
    channels: ["crm", "voice", "maid"],
    staffOnly: false,
    benchmarks: { home_services: 0.35, marine: 0.3, healthcare: 0.33, medicare: 0.28, financial_services: 0.25 },
  }),
  metric({
    id: "cpl",
    name: "Cost per lead",
    definition: "Spend divided by leads.",
    formula: "spend / leads",
    unit: "currency",
    direction: "lower_better",
    category: "conversion",
    channels: ALL,
    staffOnly: true,
    benchmarks: { home_services: 45, marine: 55, healthcare: 60, medicare: 80, financial_services: 90 },
  }),
  metric({
    id: "cpa",
    name: "Cost per acquisition",
    definition: "Spend divided by verified conversions.",
    formula: "spend / verified_conversions",
    unit: "currency",
    direction: "lower_better",
    category: "conversion",
    channels: ALL,
    staffOnly: true,
    benchmarks: { home_services: 180, marine: 220, healthcare: 250, medicare: 320, financial_services: 400 },
  }),
  metric({
    id: "revenue",
    name: "Revenue",
    definition: "Closed sales the CRM linked to these people. Only won deals count.",
    formula: "sum(won deal value)",
    unit: "currency",
    direction: "higher_better",
    category: "revenue",
    channels: ["crm"],
    staffOnly: false,
    benchmarks: {},
  }),
  metric({
    id: "average_order_value",
    name: "Average order value",
    definition: "Revenue divided by won deals.",
    formula: "revenue / won_deals",
    unit: "currency",
    direction: "higher_better",
    category: "revenue",
    channels: ["crm"],
    staffOnly: false,
    benchmarks: {},
  }),
  metric({
    id: "roas",
    name: "Return on ad spend",
    definition: "Revenue divided by spend.",
    formula: "revenue / spend",
    unit: "ratio",
    direction: "higher_better",
    category: "roas",
    channels: ALL,
    staffOnly: true,
    benchmarks: { home_services: 4, marine: 3.5, healthcare: 3, medicare: 2.5, financial_services: 3 },
  }),
  metric({
    id: "ltv",
    name: "Lifetime value",
    definition: "The revenue expected from a customer over the relationship.",
    formula: "average order value * purchases per customer",
    unit: "currency",
    direction: "higher_better",
    category: "ltv",
    channels: ["crm"],
    staffOnly: false,
    benchmarks: {},
  }),
  metric({
    id: "cac",
    name: "Customer acquisition cost",
    definition: "Spend divided by new customers.",
    formula: "spend / new_customers",
    unit: "currency",
    direction: "lower_better",
    category: "cac",
    channels: ALL,
    staffOnly: true,
    benchmarks: { home_services: 250, marine: 300, healthcare: 350, medicare: 400, financial_services: 450 },
  }),
  metric({
    id: "payback_months",
    name: "Payback",
    definition: "How many months of gross profit it takes to cover the acquisition cost.",
    formula: "cac / monthly_gross_profit",
    unit: "months",
    direction: "lower_better",
    category: "payback",
    channels: ["crm"],
    staffOnly: true,
    benchmarks: { home_services: 3, marine: 4, healthcare: 4, medicare: 6, financial_services: 5 },
  }),
  metric({
    id: "speed_to_lead_minutes",
    name: "Speed to lead",
    definition: "Minutes from the lead arriving until the first real response.",
    formula: "first_response_at - arrived_at",
    unit: "minutes",
    direction: "lower_better",
    category: "speed_to_lead",
    channels: ["crm", "voice"],
    staffOnly: false,
    benchmarks: { home_services: 5, marine: 10, healthcare: 5, medicare: 5, financial_services: 5 },
  }),
  metric({
    id: "lead_quality_score",
    name: "Lead quality",
    definition: "A 0 to 100 score. CRM outcome counts the most, then contact validity, fit, and early engagement.",
    formula: "0.40*crm + 0.25*contact + 0.20*fit + 0.15*engagement",
    unit: "score",
    direction: "higher_better",
    category: "lead_quality",
    channels: ["crm", "maid", "voice"],
    staffOnly: false,
    benchmarks: { home_services: 60, marine: 55, healthcare: 60, medicare: 55, financial_services: 50 },
  }),
  metric({
    id: "attributed_conversions",
    name: "Attributed conversions",
    definition: "Verified conversions credited inside the click and view windows.",
    formula: "count(verified conversions inside credit window)",
    unit: "count",
    direction: "higher_better",
    category: "attribution",
    channels: ALL,
    staffOnly: false,
    benchmarks: {},
  }),
  metric({
    id: "incremental_lift",
    name: "Incremental lift",
    definition: "How much extra outcome the tested group produced versus its baseline.",
    formula: "(treatment_rate - baseline_rate) / baseline_rate",
    unit: "ratio",
    direction: "higher_better",
    category: "incrementality",
    channels: ALL,
    staffOnly: false,
    benchmarks: {},
  }),
];

export function catalogById() {
  return new Map(METRIC_CATALOG.map((row) => [row.id, row]));
}

const STAFF_IDS = new Set(["roas", "cac", "spend", "cpc", "cpm", "cpa", "cpl", "payback_months"]);

export function assertStaffOnlyCosts() {
  for (const row of METRIC_CATALOG) {
    if (STAFF_IDS.has(row.id) && !row.staffOnly) throw new Error(`${row.id} must be staff only`);
  }
}

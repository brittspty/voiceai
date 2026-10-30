import type { Prisma } from "@prisma/client";

/** Metrics, cards, and copy that reveal spend or a figure derived from it. */
export const COST_METRICS = ["cpc", "cpm", "cpa", "cpl", "budget", "roi", "spend", "cost", "roas", "conversion_value", "pacing"] as const;

export const COST_ALERT_CODES = ["cpc_off", "cpm_off", "cpa_off", "cpl_off", "budget_change", "roi_within_budget", "pacing_over", "pacing_under", "pacing_critical"] as const;

export const COST_REC_TYPES = ["budget_change", "roi", "pacing"] as const;

const COST_KEYS = new Set([
  "spend",
  "budgettype",
  "budgetamount",
  "budgetcurrency",
  "budgetsetat",
  "reportedbudgettype",
  "reportedbudgetamount",
  "cpc",
  "cpm",
  "cpa",
  "cpl",
  "roas",
  "cost",
  "costperlead",
  "costperbooked",
  "conversionvalue",
  "revenue",
  "currentbudgetamount",
  "currentbudgetperiod",
  "proposedbudgetamount",
  "proposedbudgetperiod",
  "proposedcurrency",
  "costperqualifiedlead",
  "cpql",
  "projectedspend",
  "spendtodate",
  "expectedspend",
  "marginalcpa",
  "paceratio",
  "cparecent",
  "cpaprior",
  "cparise",
]);

const COST_TEXT = /cost|spend|cpc|cpm|cpa|cpl|roas|\bbudget\b|revenue|\$/i;

export function campaignSelect(seesCost: boolean): Prisma.CampaignSelect {
  return {
    id: true,
    name: true,
    objective: true,
    status: true,
    adAccount: { select: { id: true, name: true, ...(seesCost ? { currency: true } : {}) } },
    _count: { select: { adGroups: true } },
    ...(seesCost
      ? {
          budgetType: true,
          budgetAmount: true,
          budgetCurrency: true,
          budgetSetAt: true,
          reportedBudgetType: true,
          reportedBudgetAmount: true,
        }
      : {}),
  };
}

export function dailyMetricSelect(seesCost: boolean): Prisma.DailyMetricSelect {
  return {
    id: true,
    date: true,
    impressions: true,
    clicks: true,
    reach: true,
    platformLeads: true,
    ad: { select: { name: true } },
    campaign: {
      select: {
        id: true,
        name: true,
        adAccountId: true,
        adAccount: { select: { name: true } },
      },
    },
    ...(seesCost ? { spend: true, currency: true, conversionValue: true } : {}),
  };
}

export function searchTermSelect(seesCost: boolean): Prisma.SearchTermMetricSelect {
  return {
    id: true,
    date: true,
    term: true,
    matchType: true,
    status: true,
    impressions: true,
    clicks: true,
    conversions: true,
    platform: true,
    campaign: {
      select: {
        id: true,
        name: true,
        adAccountId: true,
        adAccount: { select: { name: true } },
      },
    },
    ...(seesCost ? { spend: true, currency: true } : {}),
  };
}

export function metricSum(seesCost: boolean) {
  return seesCost
    ? { spend: true as const, impressions: true as const, clicks: true as const, platformLeads: true as const }
    : { impressions: true as const, clicks: true as const, platformLeads: true as const };
}

export function alertWhere(seesCost: boolean): Prisma.AdAlertWhereInput {
  if (seesCost) return {};
  return {
    code: { notIn: [...COST_ALERT_CODES] },
    metric: { notIn: [...COST_METRICS] },
  };
}

export function recommendationSelect(seesCost: boolean): Prisma.RecommendationSelect {
  return {
    id: true,
    type: true,
    status: true,
    title: true,
    summary: true,
    rationale: true,
    metric: true,
    baseline: true,
    observed: true,
    windowStart: true,
    windowEnd: true,
    sampleSize: true,
    sourceMetricIds: true,
    createdAt: true,
    decidedAt: true,
    decisionNote: true,
    verifierNote: true,
    campaignId: true,
    adAccountId: true,
    ad: { select: { name: true } },
    ...(seesCost
      ? {
          currentBudgetAmount: true,
          currentBudgetPeriod: true,
          proposedBudgetAmount: true,
          proposedBudgetPeriod: true,
          proposedCurrency: true,
          campaign: { select: { budgetSetBy: { select: { name: true } } } },
        }
      : {}),
  };
}

export function alertSelect(): Prisma.AdAlertSelect {
  return {
    id: true,
    adAccountId: true,
    campaignId: true,
    severity: true,
    code: true,
    title: true,
    summary: true,
    metric: true,
    detectedAt: true,
    ad: { select: { name: true } },
    adAccount: { select: { name: true } },
  };
}

export function recommendationWhere(seesCost: boolean): Prisma.RecommendationWhereInput {
  const status = { in: ["verified", "accepted", "declined", "dismissed"] as ("verified" | "accepted" | "declined" | "dismissed")[] };
  if (seesCost) return { status };
  return {
    status,
    type: { notIn: [...COST_REC_TYPES] },
    metric: { notIn: [...COST_METRICS] },
  };
}

export function isCostContent(input: { type?: string | null; code?: string | null; metric?: string | null; title?: string | null; summary?: string | null; rationale?: string | null }) {
  if (input.type && (COST_REC_TYPES as readonly string[]).includes(input.type)) return true;
  if (input.code && (COST_ALERT_CODES as readonly string[]).includes(input.code)) return true;
  if (input.metric && (COST_METRICS as readonly string[]).includes(input.metric)) return true;
  return COST_TEXT.test([input.title, input.summary, input.rationale].filter(Boolean).join(" "));
}

function stripCostKeys(value: Record<string, unknown>) {
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (COST_KEYS.has(key.toLowerCase())) continue;
    if (key === "currency" && ("spend" in value || "budgetAmount" in value || "reportedBudgetAmount" in value)) continue;
    next[key] = child;
  }
  return next;
}

function digestWithoutCost(digest: { id: string; createdAt: string; delivery: string; payload: unknown }) {
  const payload = digest.payload;
  if (!payload || typeof payload !== "object") {
    return COST_TEXT.test(JSON.stringify(payload)) ? null : digest;
  }
  const record = payload as Record<string, unknown>;
  const next: Record<string, unknown> = { ...record };
  for (const key of ["alerts", "recommendations"] as const) {
    const items = record[key];
    if (!Array.isArray(items)) continue;
    next[key] = items.filter((item) => item && typeof item === "object" && !isCostContent(item as { title?: string; summary?: string; type?: string; metric?: string }));
  }
  const alerts = Array.isArray(next.alerts) ? next.alerts : [];
  const recommendations = Array.isArray(next.recommendations) ? next.recommendations : [];
  const hadItems =
    (Array.isArray(record.alerts) && record.alerts.length > 0) ||
    (Array.isArray(record.recommendations) && record.recommendations.length > 0);
  if (hadItems && alerts.length === 0 && recommendations.length === 0) return null;
  const cleaned = { ...digest, payload: next };
  if (COST_TEXT.test(JSON.stringify(cleaned.payload))) return null;
  return cleaned;
}

export function redactMarketingPage<T extends {
  campaigns: Record<string, unknown>[];
  rows: Record<string, unknown>[];
  totals: Record<string, unknown>[];
  alerts: Record<string, unknown>[];
  recommendations: Record<string, unknown>[];
  digests: { id: string; createdAt: string; delivery: string; payload: unknown }[];
  searchTerms?: Record<string, unknown>[];
}>(page: T, seesCost: boolean): T {
  if (seesCost) return page;
  const cleaned = {
    ...page,
    campaigns: page.campaigns.map((row) => stripCostKeys(row)),
    rows: page.rows.map((row) => stripCostKeys(row)),
    totals: page.totals.map((row) => stripCostKeys(row)),
    alerts: page.alerts.filter((row) => !isCostContent(row as { type?: string; code?: string; metric?: string; title?: string; summary?: string })).map((row) => stripCostKeys(row)),
    recommendations: page.recommendations
      .filter((row) => !isCostContent(row as { type?: string; code?: string; metric?: string; title?: string; summary?: string; rationale?: string }))
      .map((row) => stripCostKeys(row)),
    digests: page.digests.flatMap((digest) => {
      const cleanedDigest = digestWithoutCost(digest);
      return cleanedDigest ? [cleanedDigest] : [];
    }),
    searchTerms: (page.searchTerms ?? []).map((row) => stripCostKeys(row)),
  };
  if ("leadQuality" in page) {
    (cleaned as unknown as { leadQuality: unknown }).leadQuality = leadQualityWithoutCost((page as { leadQuality?: unknown }).leadQuality);
  }
  return cleaned;
}

function leadQualityWithoutCost(value: unknown) {
  if (!value || typeof value !== "object") return value ?? null;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (COST_KEYS.has(key.toLowerCase()) || /cost|spend|cpql/i.test(key)) continue;
    next[key] = child;
  }
  if (COST_TEXT.test(JSON.stringify(next))) return null;
  return next;
}

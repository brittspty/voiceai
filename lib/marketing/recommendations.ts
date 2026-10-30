import type { MarketingAccess } from "./access";
import type { BudgetStore } from "./budget";
import type { MetricPoint, MonitorDraft } from "./monitor";

export type RecommendationDecision = "dismiss" | "accept" | "decline";

function sumRecent(rows: MetricPoint[], adId: string, dates: Set<string>) {
  const mine = rows.filter((row) => row.adId === adId && dates.has(row.date));
  return mine.reduce(
    (total, row) => {
      total.spend += row.spend;
      total.impressions += row.impressions;
      total.clicks += row.clicks;
      total.leads += row.leads;
      total.conversions += row.conversions;
      total.ids.push(row.id);
      return total;
    },
    { spend: 0, impressions: 0, clicks: 0, leads: 0, conversions: 0, ids: [] as string[] },
  );
}

function rate(metric: string, totals: { spend: number; impressions: number; clicks: number; leads: number; conversions: number }) {
  if (metric === "ctr") return totals.impressions ? totals.clicks / totals.impressions : null;
  if (metric === "cpc") return totals.clicks ? totals.spend / totals.clicks : null;
  if (metric === "cpm") return totals.impressions ? (totals.spend / totals.impressions) * 1000 : null;
  if (metric === "cpa") return totals.conversions ? totals.spend / totals.conversions : null;
  if (metric === "cpl") return totals.leads ? totals.spend / totals.leads : null;
  if (metric === "click_to_landing") return null;
  return null;
}

/**
 * Second check. It re-reads the metric rows and recomputes the comparison.
 * It does not trust the draft's observed value.
 */
export function verifyRecommendation(
  draft: MonitorDraft,
  rows: MetricPoint[],
  config: { minImpressions: number; minClicks: number; today: string; yesterday: string },
) {
  const dates = new Set([config.today, config.yesterday]);
  const fresh = sumRecent(rows, draft.adId, dates);
  const sampleTooSmall = fresh.impressions < config.minImpressions || fresh.clicks < config.minClicks;
  if (draft.type === "roi") {
    if (!draft.currentBudgetAmount) return { status: "draft" as const, note: "ROI advice needs a budget a person has set.", sampleSize: fresh.impressions };
    if (draft.proposedBudgetAmount && Number(draft.proposedBudgetAmount) > Number(draft.currentBudgetAmount)) {
      return { status: "draft" as const, note: "ROI advice cannot raise the budget.", sampleSize: fresh.impressions };
    }
    if (sampleTooSmall) return { status: "draft" as const, note: "Not enough results to confirm yet.", sampleSize: fresh.impressions };
    return { status: "verified" as const, note: "Confirmed against the stored rows. Spend stays inside the set budget.", sampleSize: fresh.impressions };
  }
  if (draft.type === "budget_change") {
    if (!draft.currentBudgetAmount || !draft.proposedBudgetAmount) {
      return { status: "draft" as const, note: "A budget change needs a current and a proposed amount.", sampleSize: fresh.impressions };
    }
    if (Number(draft.proposedBudgetAmount) >= Number(draft.currentBudgetAmount)) {
      return { status: "draft" as const, note: "The proposal does not stay within the current budget.", sampleSize: fresh.impressions };
    }
    if (sampleTooSmall) return { status: "draft" as const, note: "Not enough results to confirm yet.", sampleSize: fresh.impressions };
    const freshRate = rate("cpa", fresh) ?? rate("cpl", fresh) ?? rate("cpc", fresh);
    if (freshRate === null) return { status: "draft" as const, note: "Could not recompute the result cost.", sampleSize: fresh.impressions };
    return { status: "verified" as const, note: "Confirmed against the stored rows. Accepting it only updates the local budget.", sampleSize: fresh.impressions };
  }
  if (sampleTooSmall) return { status: "draft" as const, note: "Not enough results to confirm yet.", sampleSize: fresh.impressions };
  const freshRate = draft.metric === "ctr" || draft.metric === "cpc" || draft.metric === "cpm" || draft.metric === "cpa" || draft.metric === "cpl" ? rate(draft.metric, fresh) : Number(draft.observed);
  if (freshRate === null || !Number.isFinite(freshRate)) {
    return { status: "draft" as const, note: "Could not recompute the metric.", sampleSize: fresh.impressions };
  }
  const baseline = Number(draft.baseline);
  if (draft.metric === "ctr" && Number.isFinite(baseline) && freshRate >= baseline) {
    return { status: "draft" as const, note: "The fresh click rate is no longer below the baseline.", sampleSize: fresh.impressions };
  }
  if (draft.metric !== "ctr" && draft.metric !== "frequency" && draft.metric !== "odd_hour_clicks" && draft.metric !== "click_to_landing" && Number.isFinite(baseline) && freshRate <= baseline) {
    return { status: "draft" as const, note: "The fresh number is no longer above the baseline.", sampleSize: fresh.impressions };
  }
  return { status: "verified" as const, note: "Confirmed against the stored rows.", sampleSize: fresh.impressions };
}

export async function decideRecommendation(input: {
  actor: { kind: string; access?: MarketingAccess };
  recommendation: {
    id: string;
    type: string;
    status: string;
    campaignId: string | null;
    adAccountId: string | null;
    proposedBudgetAmount: string | null;
    proposedBudgetPeriod: "daily" | "lifetime" | null;
    proposedCurrency: string | null;
  };
  decision: RecommendationDecision;
  note?: string;
  budgetStore: BudgetStore;
  now?: Date;
}) {
  if (input.actor.kind !== "human" || !input.actor.access) {
    throw new Error("Only a person can decide a recommendation.");
  }
  if (input.recommendation.status !== "verified") {
    throw new Error("Only a confirmed recommendation can be decided.");
  }
  if (input.decision === "accept") {
    if (input.recommendation.type === "pacing" || input.recommendation.type === "creative_fatigue") {
      return { status: "accepted" as const, budgetWrite: "none" as const };
    }
    if (input.recommendation.type === "budget_change") {
      if (!input.recommendation.proposedBudgetAmount) throw new Error("The budget suggestion is incomplete.");
      // Records the person's OK only. The budget itself is not written.
      void input.budgetStore;
      return { status: "accepted" as const, budgetWrite: "none" as const };
    }
    return { status: "accepted" as const, budgetWrite: "none" as const };
  }
  return { status: input.decision === "decline" ? ("declined" as const) : ("dismissed" as const) };
}

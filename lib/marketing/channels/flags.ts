import { DEFAULT_THRESHOLDS, resolveThresholds, type Thresholds } from "./thresholds";

export type FlagKind = "anomaly" | "opp_grow" | "opp_realloc" | "low_volume";

export type MetricFlag = {
  kind: FlagKind;
  label: string;
  reason: string;
  threshold: string;
  decisionId: string | null;
};

export type FlagInput = {
  leads?: number;
  priorLeads?: number;
  qualified?: number;
  priorQualified?: number;
  clicks?: number;
  ctr?: number | null;
  priorCtr?: number | null;
  cpl?: number | null;
  priorCpl?: number | null;
  cpql?: number | null;
  priorCpql?: number | null;
  frequency?: number | null;
  failedChecks?: number;
  pacingRatio?: number | null;
  speedSec?: number | null;
  hoursSinceLead?: number | null;
  spend?: number | null;
  searchTermSpend?: number | null;
  searchTermLeads?: number | null;
  convRate?: number | null;
  accountConvRate?: number | null;
  budgetLimitedShare?: number | null;
  impressionShare?: number | null;
  reviewLift?: number | null;
  callsLift?: number | null;
  bestChannelCpl?: number | null;
  decisionId?: string | null;
  seesCost?: boolean;
  thresholds?: Partial<Thresholds> | null;
};

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function drop(current: number, prior: number) {
  if (prior <= 0) return null;
  return (prior - current) / prior;
}

function rise(current: number, prior: number) {
  if (prior <= 0) return null;
  return (current - prior) / prior;
}

export function evaluateFlags(input: FlagInput): MetricFlag[] {
  const limits = resolveThresholds(input.thresholds ?? DEFAULT_THRESHOLDS);
  const seesCost = input.seesCost !== false;
  const decisionId = input.decisionId ?? null;
  const leads = input.leads ?? 0;
  const clicks = input.clicks ?? 0;
  if (leads < limits.minLeads && clicks < limits.minClicks) {
    return [{ kind: "low_volume", label: "Low volume", reason: "Low volume", threshold: `${limits.minLeads} leads or ${limits.minClicks} clicks`, decisionId: null }];
  }
  const flags: MetricFlag[] = [];
  const leadDrop = drop(leads, input.priorLeads ?? 0);
  if (leadDrop != null && leadDrop >= limits.leadsDropPct) {
    flags.push({
      kind: "anomaly",
      label: "Anomaly",
      reason: `Leads down ${pct(leadDrop)} vs the prior period. The line is ${pct(limits.leadsDropPct)}.`,
      threshold: pct(limits.leadsDropPct),
      decisionId,
    });
  }
  const qualifiedDrop = drop(input.qualified ?? 0, input.priorQualified ?? 0);
  if (qualifiedDrop != null && qualifiedDrop >= limits.leadsDropPct) {
    flags.push({
      kind: "anomaly",
      label: "Anomaly",
      reason: `Qualified leads down ${pct(qualifiedDrop)}. The line is ${pct(limits.leadsDropPct)}.`,
      threshold: pct(limits.leadsDropPct),
      decisionId,
    });
  }
  const ctrDrop = input.ctr != null && input.priorCtr != null ? drop(input.ctr, input.priorCtr) : null;
  if (ctrDrop != null && ctrDrop >= limits.ctrDropPct) {
    flags.push({
      kind: "anomaly",
      label: "Anomaly",
      reason: `Click-through rate down ${pct(ctrDrop)}. The line is ${pct(limits.ctrDropPct)}.`,
      threshold: pct(limits.ctrDropPct),
      decisionId,
    });
  }
  if (input.frequency != null && input.frequency > limits.frequencyWarn) {
    flags.push({
      kind: "anomaly",
      label: "Anomaly",
      reason: `Frequency ${input.frequency.toFixed(1)} is over the ${limits.frequencyWarn} warning.`,
      threshold: String(limits.frequencyWarn),
      decisionId,
    });
  }
  if ((input.failedChecks ?? 0) >= limits.failedChecks) {
    flags.push({
      kind: "anomaly",
      label: "Anomaly",
      reason: `Landing page failed ${input.failedChecks} checks. The line is ${limits.failedChecks}.`,
      threshold: String(limits.failedChecks),
      decisionId,
    });
  }
  if (input.speedSec != null && input.speedSec > limits.speedToLeadSec) {
    flags.push({
      kind: "anomaly",
      label: "Anomaly",
      reason: `Speed to lead is ${Math.round(input.speedSec)}s. The line is ${limits.speedToLeadSec}s.`,
      threshold: `${limits.speedToLeadSec}s`,
      decisionId,
    });
  }
  if (seesCost && input.cpl != null && input.priorCpl != null) {
    const cplRise = rise(input.cpl, input.priorCpl);
    if (cplRise != null && cplRise >= limits.cplRisePct) {
      flags.push({
        kind: "anomaly",
        label: "Anomaly",
        reason: `Cost per lead up ${pct(cplRise)}. The line is ${pct(limits.cplRisePct)}.`,
        threshold: pct(limits.cplRisePct),
        decisionId,
      });
    }
  }
  if (seesCost && input.cpql != null && input.priorCpql != null) {
    const cpqlRise = rise(input.cpql, input.priorCpql);
    if (cpqlRise != null && cpqlRise >= limits.cplRisePct) {
      flags.push({
        kind: "anomaly",
        label: "Anomaly",
        reason: `Cost per qualified lead up ${pct(cpqlRise)}. The line is ${pct(limits.cplRisePct)}.`,
        threshold: pct(limits.cplRisePct),
        decisionId,
      });
    }
  }
  if (seesCost && input.pacingRatio != null && Math.abs(input.pacingRatio) > limits.pacingBand) {
    flags.push({
      kind: "anomaly",
      label: "Anomaly",
      reason: `Spend pacing is ${pct(Math.abs(input.pacingRatio))} off plan. The band is ${pct(limits.pacingBand)}.`,
      threshold: pct(limits.pacingBand),
      decisionId,
    });
  }
  if (seesCost && (input.spend ?? 0) > 0 && input.hoursSinceLead != null && input.hoursSinceLead >= limits.trackingQuietHours && leads === 0) {
    flags.push({
      kind: "anomaly",
      label: "Anomaly",
      reason: `No leads for ${Math.round(input.hoursSinceLead)}h while the campaign spent. The line is ${limits.trackingQuietHours}h.`,
      threshold: `${limits.trackingQuietHours}h`,
      decisionId,
    });
  }
  if (seesCost && (input.searchTermSpend ?? 0) >= limits.searchWasteSpend && (input.searchTermLeads ?? 0) === 0) {
    flags.push({
      kind: "anomaly",
      label: "Anomaly",
      reason: `Search term spent ${Math.round(input.searchTermSpend ?? 0)} with 0 leads in ${limits.searchWasteDays} days. The line is ${limits.searchWasteSpend}.`,
      threshold: String(limits.searchWasteSpend),
      decisionId,
    });
  }
  const accountRate = input.accountConvRate ?? 0;
  if (input.convRate != null && accountRate > 0 && input.convRate >= accountRate * limits.growMultiple) {
    const limited = (input.budgetLimitedShare ?? 0) > limits.budgetLimitedShare;
    const shareLow = input.impressionShare != null && input.impressionShare < limits.impressionShare;
    if (limited || shareLow) {
      flags.push({
        kind: "opp_grow",
        label: "Opportunity",
        reason: `Converts at ${input.convRate.toFixed(2)} vs ${accountRate.toFixed(2)} for the account, and delivery is held back.`,
        threshold: `${limits.growMultiple}x`,
        decisionId,
      });
    }
  }
  if ((input.reviewLift ?? 0) >= limits.reviewLiftPct || (input.callsLift ?? 0) >= limits.reviewLiftPct) {
    flags.push({
      kind: "opp_grow",
      label: "Opportunity",
      reason: `Reviews or calls are up at least ${pct(limits.reviewLiftPct)}.`,
      threshold: pct(limits.reviewLiftPct),
      decisionId,
    });
  }
  if (seesCost && input.cpl != null && input.bestChannelCpl != null && input.bestChannelCpl > 0 && input.cpl >= input.bestChannelCpl * limits.reallocMultiple) {
    flags.push({
      kind: "opp_realloc",
      label: "Opportunity",
      reason: `Cost per lead is ${limits.reallocMultiple}x the best channel. You make the change. This is a recommendation only.`,
      threshold: `${limits.reallocMultiple}x`,
      decisionId,
    });
  }
  return flags;
}

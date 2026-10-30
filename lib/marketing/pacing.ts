import { shouldRefire, type Severity } from "./refire";

export const PACING_COOLDOWN_DAYS = 3;
export const PACING_FIXED_LINE = "Budgets are set by people only. The platform will not change this budget.";

/** Pacing never requests a platform write scope and never changes a budget. */
export const BUDGET_API_SCOPE_REQUESTED = false;

export type PacingStatus = "on_track" | "under" | "over" | "critical";
export type DaypartName = "overnight" | "morning" | "afternoon" | "evening";

export type PacingCampaign = {
  campaignId: string;
  name: string;
  adAccountId: string;
  platform: string;
  budgetAmount: number;
  budgetPeriod: "daily" | "lifetime";
  currency: string;
  startDate?: string | null;
  endDate?: string | null;
  adId?: string | null;
};

export type SpendRow = {
  campaignId: string;
  date: string;
  spend: number;
  conversions: number;
  leads: number;
  impressions: number;
};

export type HourRow = {
  campaignId: string;
  date: string;
  hour: number;
  impressions: number;
  conversions: number;
};

export type DaypartSpend = {
  campaignId: string;
  daypart: DaypartName;
  spend: number;
  conversions: number;
  impressions: number;
};

export type PacingPrevious = { campaignId: string; severity: Severity; at: string };

export type PacingSnapshotDraft = {
  campaignId: string;
  name: string;
  adAccountId: string;
  platform: string;
  adId: string | null;
  periodStart: string;
  periodEnd: string;
  dayOfPeriod: number;
  daysInPeriod: number;
  budgetAmount: number;
  budgetForPeriod: number;
  budgetPeriod: "daily" | "lifetime";
  currency: string;
  spendToDate: number;
  expectedSpend: number;
  projectedSpend: number;
  paceRatio: number;
  marginalCpa: number | null;
  costPerQualifiedLead: number | null;
  qualifiedLeadBasis: "platform_leads";
  status: PacingStatus;
  severity: Severity;
  reasons: string[];
  recommendationOnly: true;
  periodLabel: string;
  chip: string;
  bar: string;
  dedupeKey: string;
};

export type PacingShift = { campaignId: string; name: string; fromDaily: number; toDaily: number };

export type PacingRecommendationDraft = {
  type: "pacing";
  campaignId: string;
  name: string;
  adAccountId: string;
  adId: string | null;
  platform: string;
  severity: "warning" | "critical";
  title: string;
  summary: string;
  rationale: string;
  metric: "pacing";
  baseline: string;
  observed: string;
  windowStart: string;
  windowEnd: string;
  sampleSize: number;
  currentBudgetAmount: string;
  proposedBudgetAmount: string;
  currentBudgetPeriod: "daily" | "lifetime";
  proposedBudgetPeriod: "daily" | "lifetime";
  proposedCurrency: string;
  shifts: PacingShift[];
  accountTotalBefore: number;
  accountTotalAfter: number;
  recommendationOnly: true;
  writesBudget: false;
  dedupeKey: string;
  marginalCpa: number | null;
  costPerQualifiedLead: number | null;
};

export function daypartFromHour(hour: number): DaypartName {
  if (hour <= 5) return "overnight";
  if (hour <= 11) return "morning";
  if (hour <= 17) return "afternoon";
  return "evening";
}

export function allocateDayparts(input: { days: { campaignId: string; date: string; spend: number }[]; hours: HourRow[] }): DaypartSpend[] {
  const hoursByDay = new Map<string, HourRow[]>();
  for (const hour of input.hours) {
    const key = `${hour.campaignId}:${hour.date}`;
    const list = hoursByDay.get(key) ?? [];
    list.push(hour);
    hoursByDay.set(key, list);
  }
  const totals = new Map<string, DaypartSpend>();
  for (const day of input.days) {
    const hours = hoursByDay.get(`${day.campaignId}:${day.date}`) ?? [];
    const impressions = hours.reduce((sum, hour) => sum + hour.impressions, 0);
    if (impressions <= 0 || day.spend <= 0) continue;
    for (const hour of hours) {
      const share = hour.impressions / impressions;
      const name = daypartFromHour(hour.hour);
      const key = `${day.campaignId}:${name}`;
      const row = totals.get(key) ?? { campaignId: day.campaignId, daypart: name, spend: 0, conversions: 0, impressions: 0 };
      row.spend += day.spend * share;
      row.conversions += hour.conversions;
      row.impressions += hour.impressions;
      totals.set(key, row);
    }
  }
  return [...totals.values()];
}

export function pacingChip(status: string) {
  if (status === "under") return "Under";
  if (status === "critical") return "Over · Critical";
  if (status === "over") return "Over";
  return "On track";
}

export function money(amount: number, currency: string) {
  const digits = Number.isInteger(amount) ? 0 : 2;
  if (currency === "USD") {
    return amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits, minimumFractionDigits: digits });
  }
  return `${amount.toFixed(digits)} ${currency}`;
}

export function pacingBarCopy(row: {
  spendToDate: number;
  budgetForPeriod: number;
  dayOfPeriod: number;
  daysInPeriod: number;
  projectedSpend: number;
  currency: string;
  periodLabel: string;
}) {
  const pct = row.budgetForPeriod ? Math.round((row.projectedSpend / row.budgetForPeriod - 1) * 100) : 0;
  const direction = pct > 0 ? `${pct}% over` : pct < 0 ? `${Math.abs(pct)}% under` : "on plan";
  return `Spent ${money(row.spendToDate, row.currency)} of ${money(row.budgetForPeriod, row.currency)} ${row.periodLabel} · Day ${row.dayOfPeriod} of ${row.daysInPeriod} · On track to spend ${money(row.projectedSpend, row.currency)} (${direction})`;
}

export function budgetSeenNote(reported: number | null, proposed: number | null, currency: string) {
  if (reported === null || proposed === null) return "";
  if (Math.abs(reported - proposed) < 0.05) return `We see the new budget: ${money(proposed, currency)}`;
  return `We still see ${money(reported, currency)}.`;
}

function addDays(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function daysInMonth(iso: string) {
  const [year, month] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dayCount(start: string, end: string) {
  const left = Date.parse(`${start}T00:00:00.000Z`);
  const right = Date.parse(`${end}T00:00:00.000Z`);
  return Math.round((right - left) / 86_400_000) + 1;
}

function roundCents(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function managerName(platform: string) {
  if (platform === "google_ads") return "Google Ads";
  if (platform === "meta") return "Meta Ads Manager";
  return "your ads manager";
}

function classify(ratio: number, runsOutBefore25: boolean): { status: PacingStatus; severity: Severity } {
  if (ratio > 1.25 || runsOutBefore25) return { status: "critical", severity: "critical" };
  if (ratio > 1.1) return { status: "over", severity: "warning" };
  if (ratio < 0.9) return { status: "under", severity: "warning" };
  return { status: "on_track", severity: "info" };
}

function runsOutBefore25(day: number, spend: number, budgetForPeriod: number) {
  if (day <= 0 || spend <= 0 || budgetForPeriod <= 0) return false;
  if (day >= 25) return false;
  const burn = spend / day;
  const remaining = budgetForPeriod - spend;
  if (remaining <= 0) return true;
  return day + remaining / burn < 25;
}

export function daypartAdvice(rows: DaypartSpend[], campaignId: string) {
  const mine = rows.filter((row) => row.campaignId === campaignId && row.conversions > 0 && row.impressions >= 100);
  if (mine.length < 2) return null;
  const cpa = (row: DaypartSpend) => row.spend / row.conversions;
  const best = mine.reduce((left, right) => (cpa(left) <= cpa(right) ? left : right));
  const worst = mine.reduce((left, right) => (cpa(left) >= cpa(right) ? left : right));
  if (cpa(best) <= 0 || worst.daypart === best.daypart) return null;
  if (cpa(worst) < cpa(best) * 1.25) return null;
  return { worst: worst.daypart, best: best.daypart, worstCpa: cpa(worst), bestCpa: cpa(best) };
}

function numbered(lines: string[]) {
  return lines.map((line, index) => `${index + 1}. ${line}`).join("\n");
}

function latestPrevious(rows: PacingPrevious[], campaignId: string) {
  return rows.filter((row) => row.campaignId === campaignId).sort((left, right) => right.at.localeCompare(left.at))[0] ?? null;
}

type Planned = {
  snapshot: PacingSnapshotDraft;
  suggestedDaily: number | null;
  marginalCpa: number | null;
};

/**
 * Compares human-set budgets with synced spend and drafts recommendation-only shifts.
 * The account total never goes up. This function does not write a budget.
 */
export function evaluatePacing(input: {
  today: string;
  campaigns: PacingCampaign[];
  spend: SpendRow[];
  hours?: HourRow[];
  previous?: PacingPrevious[];
  now?: string;
}) {
  const today = input.today;
  const now = input.now ?? `${today}T12:00:00.000Z`;
  const marginalStart = addDays(today, -6);
  const dayparts = allocateDayparts({
    days: input.spend.map((row) => ({ campaignId: row.campaignId, date: row.date, spend: row.spend })),
    hours: input.hours ?? [],
  });
  const planned: Planned[] = [];

  for (const campaign of input.campaigns) {
    if (campaign.budgetAmount <= 0) continue;
    const [year, month, day] = today.split("-");
    let periodStart = "";
    let periodEnd = "";
    let dayOfPeriod = 0;
    let days = 0;
    let budgetForPeriod = 0;
    let periodLabel = "monthly budget";
    let earlyEmpty = false;
    if (campaign.budgetPeriod === "daily") {
      days = daysInMonth(today);
      periodStart = `${year}-${month}-01`;
      periodEnd = `${year}-${month}-${String(days).padStart(2, "0")}`;
      dayOfPeriod = Number(day);
      budgetForPeriod = campaign.budgetAmount * days;
      const inMonth = input.spend.filter((row) => row.campaignId === campaign.campaignId && row.date >= periodStart && row.date <= today);
      const spendToDate = inMonth.reduce((sum, row) => sum + row.spend, 0);
      const impressions = inMonth.reduce((sum, row) => sum + row.impressions, 0);
      earlyEmpty = runsOutBefore25(dayOfPeriod, spendToDate, budgetForPeriod);
      const expected = campaign.budgetAmount * dayOfPeriod;
      const projected = dayOfPeriod > 0 ? (spendToDate / dayOfPeriod) * days : 0;
      const ratio = budgetForPeriod > 0 ? projected / budgetForPeriod : 0;
      planned.push(buildPlanned(campaign, input, { periodStart, periodEnd, dayOfPeriod, days, budgetForPeriod, periodLabel, spendToDate, expected, projected, ratio, earlyEmpty, impressions, marginalStart }));
      continue;
    }
    if (!campaign.startDate || !campaign.endDate || today < campaign.startDate) continue;
    periodStart = campaign.startDate;
    periodEnd = campaign.endDate;
    days = dayCount(periodStart, periodEnd);
    const elapsedEnd = today < periodEnd ? today : periodEnd;
    dayOfPeriod = dayCount(periodStart, elapsedEnd);
    budgetForPeriod = campaign.budgetAmount;
    periodLabel = "lifetime budget";
    const inFlight = input.spend.filter((row) => row.campaignId === campaign.campaignId && row.date >= periodStart && row.date <= elapsedEnd);
    const spendToDate = inFlight.reduce((sum, row) => sum + row.spend, 0);
    const impressions = inFlight.reduce((sum, row) => sum + row.impressions, 0);
    const expected = days > 0 ? (budgetForPeriod * dayOfPeriod) / days : 0;
    const projected = dayOfPeriod > 0 ? (spendToDate / dayOfPeriod) * days : 0;
    const ratio = budgetForPeriod > 0 ? projected / budgetForPeriod : 0;
    planned.push(buildPlanned(campaign, input, { periodStart, periodEnd, dayOfPeriod, days, budgetForPeriod, periodLabel, spendToDate, expected, projected, ratio, earlyEmpty, impressions, marginalStart }));
  }

  const nextDaily = new Map(planned.filter((row) => row.snapshot.budgetPeriod === "daily").map((row) => [row.snapshot.campaignId, row.snapshot.budgetAmount]));
  const usedPartners = new Set<string>();
  const shiftsByDonor = new Map<string, PacingShift[]>();
  const overs = planned
    .filter((row) => row.snapshot.budgetPeriod === "daily" && (row.snapshot.status === "over" || row.snapshot.status === "critical") && row.suggestedDaily !== null)
    .sort((left, right) => right.snapshot.paceRatio - left.snapshot.paceRatio);

  for (const donor of overs) {
    const current = donor.snapshot.budgetAmount;
    const suggested = donor.suggestedDaily ?? current;
    const delta = roundCents(current - suggested);
    if (delta <= 0) continue;
    const partner = planned.find((row) => {
      if (usedPartners.has(row.snapshot.campaignId) || row.snapshot.campaignId === donor.snapshot.campaignId) return false;
      if (row.snapshot.adAccountId !== donor.snapshot.adAccountId || row.snapshot.currency !== donor.snapshot.currency) return false;
      if (row.snapshot.budgetPeriod !== "daily" || row.snapshot.status !== "under") return false;
      if (donor.marginalCpa === null || row.marginalCpa === null) return false;
      return row.marginalCpa < donor.marginalCpa;
    });
    if (partner) {
      const partnerTo = roundCents(partner.snapshot.budgetAmount + delta);
      const donorTo = roundCents(current - delta);
      nextDaily.set(donor.snapshot.campaignId, donorTo);
      nextDaily.set(partner.snapshot.campaignId, partnerTo);
      usedPartners.add(partner.snapshot.campaignId);
      shiftsByDonor.set(donor.snapshot.campaignId, [
        { campaignId: donor.snapshot.campaignId, name: donor.snapshot.name, fromDaily: current, toDaily: donorTo },
        { campaignId: partner.snapshot.campaignId, name: partner.snapshot.name, fromDaily: partner.snapshot.budgetAmount, toDaily: partnerTo },
      ]);
    } else {
      nextDaily.set(donor.snapshot.campaignId, roundCents(suggested));
      shiftsByDonor.set(donor.snapshot.campaignId, [
        { campaignId: donor.snapshot.campaignId, name: donor.snapshot.name, fromDaily: current, toDaily: roundCents(suggested) },
      ]);
    }
  }

  const accountBefore = new Map<string, number>();
  const accountAfter = new Map<string, number>();
  for (const row of planned) {
    if (row.snapshot.budgetPeriod !== "daily") continue;
    accountBefore.set(row.snapshot.adAccountId, (accountBefore.get(row.snapshot.adAccountId) ?? 0) + row.snapshot.budgetAmount);
    accountAfter.set(row.snapshot.adAccountId, (accountAfter.get(row.snapshot.adAccountId) ?? 0) + (nextDaily.get(row.snapshot.campaignId) ?? row.snapshot.budgetAmount));
  }

  const recommendations: PacingRecommendationDraft[] = [];
  for (const row of planned) {
    const shifts = shiftsByDonor.get(row.snapshot.campaignId) ?? [];
    const advice = daypartAdvice(dayparts, row.snapshot.campaignId);
    const involved = shifts.length > 0 || usedPartners.has(row.snapshot.campaignId);
    const daypartOnly = !involved && advice && row.snapshot.budgetPeriod === "daily";
    const lifetimeHold = row.snapshot.budgetPeriod === "lifetime" && (row.snapshot.status === "over" || row.snapshot.status === "critical");
    if (!shifts.length && !daypartOnly && !lifetimeHold) continue;
    const severity = row.snapshot.severity === "critical" ? "critical" : "warning";
    const previous = latestPrevious(input.previous ?? [], row.snapshot.campaignId);
    if (!shouldRefire({ previous, next: severity, now, cooldownDays: PACING_COOLDOWN_DAYS })) continue;
    const proposed = lifetimeHold ? row.snapshot.budgetAmount : (nextDaily.get(row.snapshot.campaignId) ?? row.snapshot.budgetAmount);
    const lines = lifetimeHold && !shifts.length ? lifetimeLines(row.snapshot) : shiftLines(row.snapshot, shifts, advice);
    const overBy = row.snapshot.projectedSpend - row.snapshot.budgetForPeriod;
    const title = shifts.length || lifetimeHold
      ? `${row.snapshot.name} will overspend by about ${money(Math.max(0, overBy), row.snapshot.currency)} this month.`
      : `Shift '${row.snapshot.name}' away from ${advice?.worst ?? "a weak part of the day"}.`;
    const summary = shifts.length
      ? shiftSummary(row.snapshot, shifts)
      : lifetimeHold
        ? `Keep the lifetime budget at ${money(row.snapshot.budgetAmount, row.snapshot.currency)} and slow delivery so spend stays inside it.`
        : `Keep the daily budget at ${money(row.snapshot.budgetAmount, row.snapshot.currency)}. Reduce ${advice?.worst} delivery and allow more during ${advice?.best}.`;
    recommendations.push({
      type: "pacing",
      campaignId: row.snapshot.campaignId,
      name: row.snapshot.name,
      adAccountId: row.snapshot.adAccountId,
      adId: row.snapshot.adId,
      platform: row.snapshot.platform,
      severity,
      title,
      summary,
      rationale: numbered(lines),
      metric: "pacing",
      baseline: row.snapshot.expectedSpend.toFixed(4),
      observed: row.snapshot.spendToDate.toFixed(4),
      windowStart: row.snapshot.periodStart,
      windowEnd: row.snapshot.periodEnd,
      sampleSize: row.snapshot.dayOfPeriod,
      currentBudgetAmount: row.snapshot.budgetAmount.toFixed(4),
      proposedBudgetAmount: proposed.toFixed(4),
      currentBudgetPeriod: row.snapshot.budgetPeriod,
      proposedBudgetPeriod: row.snapshot.budgetPeriod,
      proposedCurrency: row.snapshot.currency,
      shifts,
      accountTotalBefore: row.snapshot.budgetPeriod === "daily" ? roundCents(accountBefore.get(row.snapshot.adAccountId) ?? row.snapshot.budgetAmount) : row.snapshot.budgetAmount,
      accountTotalAfter: row.snapshot.budgetPeriod === "daily" ? roundCents(accountAfter.get(row.snapshot.adAccountId) ?? proposed) : row.snapshot.budgetAmount,
      recommendationOnly: true,
      writesBudget: false,
      dedupeKey: row.snapshot.dedupeKey,
      marginalCpa: row.marginalCpa,
      costPerQualifiedLead: row.snapshot.costPerQualifiedLead,
    });
  }

  return { snapshots: planned.map((row) => row.snapshot), recommendations, dayparts };
}

function buildPlanned(
  campaign: PacingCampaign,
  input: { spend: SpendRow[]; today: string },
  period: {
    periodStart: string;
    periodEnd: string;
    dayOfPeriod: number;
    days: number;
    budgetForPeriod: number;
    periodLabel: string;
    spendToDate: number;
    expected: number;
    projected: number;
    ratio: number;
    earlyEmpty: boolean;
    impressions: number;
    marginalStart: string;
  },
): Planned {
  const recent = input.spend.filter((row) => row.campaignId === campaign.campaignId && row.date >= period.marginalStart && row.date <= input.today);
  const recentSpend = recent.reduce((sum, row) => sum + row.spend, 0);
  const recentConversions = recent.reduce((sum, row) => sum + row.conversions, 0);
  const recentLeads = recent.reduce((sum, row) => sum + row.leads, 0);
  const marginalCpa = recentConversions > 0 ? recentSpend / recentConversions : null;
  const costPerQualifiedLead = recentLeads > 0 ? recentSpend / recentLeads : null;
  const judged = classify(period.ratio, period.earlyEmpty);
  const reasons: string[] = [judged.status];
  if (period.earlyEmpty) reasons.push("runs_out_before_day_25");
  const daysLeft = Math.max(1, period.days - period.dayOfPeriod);
  const suggestedDaily =
    campaign.budgetPeriod === "daily" && (judged.status === "over" || judged.status === "critical")
      ? roundCents(Math.max(0, period.budgetForPeriod - period.spendToDate) / daysLeft)
      : null;
  const snapshot: PacingSnapshotDraft = {
    campaignId: campaign.campaignId,
    name: campaign.name,
    adAccountId: campaign.adAccountId,
    platform: campaign.platform,
    adId: campaign.adId ?? null,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    dayOfPeriod: period.dayOfPeriod,
    daysInPeriod: period.days,
    budgetAmount: campaign.budgetAmount,
    budgetForPeriod: period.budgetForPeriod,
    budgetPeriod: campaign.budgetPeriod,
    currency: campaign.currency,
    spendToDate: period.spendToDate,
    expectedSpend: period.expected,
    projectedSpend: period.projected,
    paceRatio: period.ratio,
    marginalCpa,
    costPerQualifiedLead,
    qualifiedLeadBasis: "platform_leads",
    status: judged.status,
    severity: judged.severity,
    reasons,
    recommendationOnly: true,
    periodLabel: period.periodLabel,
    chip: pacingChip(judged.status),
    bar: pacingBarCopy({
      spendToDate: period.spendToDate,
      budgetForPeriod: period.budgetForPeriod,
      dayOfPeriod: period.dayOfPeriod,
      daysInPeriod: period.days,
      projectedSpend: period.projected,
      currency: campaign.currency,
      periodLabel: period.periodLabel,
    }),
    dedupeKey: `${campaign.adAccountId}:pacing:${campaign.campaignId}`,
  };
  return { snapshot, suggestedDaily, marginalCpa };
}

function shiftSummary(snapshot: PacingSnapshotDraft, shifts: PacingShift[]) {
  const donor = shifts[0];
  const partner = shifts[1];
  if (!donor) return PACING_FIXED_LINE;
  if (!partner) {
    return `Lower '${donor.name}' daily budget from ${money(donor.fromDaily, snapshot.currency)} to ${money(donor.toDaily, snapshot.currency)}.`;
  }
  const pair = donor.fromDaily + partner.fromDaily;
  return `Lower '${donor.name}' daily budget from ${money(donor.fromDaily, snapshot.currency)} to ${money(donor.toDaily, snapshot.currency)}, and raise '${partner.name}' from ${money(partner.fromDaily, snapshot.currency)} to ${money(partner.toDaily, snapshot.currency)}. Those daily budgets still add up to ${money(pair, snapshot.currency)}.`;
}

function lifetimeLines(snapshot: PacingSnapshotDraft) {
  return [
    `Open ${managerName(snapshot.platform)} › Campaigns.`,
    `Select '${snapshot.name}' › Edit.`,
    `Keep the lifetime budget at ${money(snapshot.budgetAmount, snapshot.currency)}.`,
    "Slow delivery so spend stays inside that amount.",
    "Do this yourself. The platform will not change this budget.",
  ];
}

function shiftLines(snapshot: PacingSnapshotDraft, shifts: PacingShift[], advice: { worst: string; best: string } | null) {
  const place = managerName(snapshot.platform);
  const lines: string[] = [];
  if (shifts.length) {
    for (const shift of shifts) {
      lines.push(`Open ${place} › Campaigns.`);
      lines.push(`Select '${shift.name}' › Edit.`);
      lines.push(`Set Daily budget to ${money(shift.toDaily, snapshot.currency)}.`);
      lines.push("Publish.");
    }
  } else {
    lines.push(`Open ${place} › Campaigns.`);
    lines.push(`Select '${snapshot.name}' › Edit.`);
    lines.push(`Keep Daily budget at ${money(snapshot.budgetAmount, snapshot.currency)}.`);
  }
  if (advice) lines.push(`Reduce delivery during ${advice.worst} and allow more during ${advice.best}.`);
  lines.push("Do this yourself. The platform will not change this budget.");
  return lines;
}

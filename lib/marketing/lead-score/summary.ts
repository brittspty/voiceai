import type { LeadLabel } from "./types";

export type LabelledLead = { label: LeadLabel; overrideLabel: LeadLabel | null; createdAt?: Date };

export function effectiveLabel(row: { label: LeadLabel; overrideLabel: LeadLabel | null }): LeadLabel {
  return row.overrideLabel ?? row.label;
}

export function automaticScoreText(label: LeadLabel, score: number) {
  const word = label === "qualified" ? "qualified" : label === "spam" ? "spam" : "not qualified";
  return `Likely ${word} (${score}%)`;
}

export function manualMarkText(label: LeadLabel, by: string, at: string) {
  const word = label === "qualified" ? "Qualified" : label === "spam" ? "Spam" : "Not qualified";
  return `Marked ${word} by ${by} on ${at}. This mark overrides the automatic score.`;
}

export function choiceLabel(choice: "qualified" | "unqualified" | "spam" | "clear", audience: "owner" | "staff") {
  if (choice === "qualified") return "Qualified";
  if (choice === "spam") return "Spam";
  if (choice === "clear") return "Not sure yet";
  return audience === "owner" ? "Not qualified" : "Not a fit";
}

export type SpendByCurrency = { currency: string; spend: number };

export type LeadQualityTiles = {
  qualified: number;
  total: number;
  rateLabel: string;
  trend: string;
  costPerQualifiedLead?: string;
};

function money(amount: number, currency: string) {
  try {
    return amount.toLocaleString("en-US", { style: "currency", currency });
  } catch {
    return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
  }
}

export function trendText(delta: number, period: "week" | "period" = "week") {
  const tail = period === "week" ? "vs last week" : "vs the previous period";
  if (delta > 0) return `up ${delta} ${tail}`;
  if (delta < 0) return `down ${Math.abs(delta)} ${tail}`;
  return period === "week" ? "same as last week" : "same as the previous period";
}

export function costPerQualifiedLead(spendByCurrency: SpendByCurrency[], qualified: number) {
  if (qualified <= 0) return "—";
  const rows = spendByCurrency.filter((row) => row.spend > 0);
  if (!rows.length) return money(0, "USD");
  const top = [...rows].sort((a, b) => b.spend - a.spend)[0];
  return money(top.spend / qualified, top.currency || "USD");
}

/** Counts use the manual mark when one exists. Cost is attached only for staff who may see it. */
export function buildLeadQualityTiles(input: {
  current: LabelledLead[];
  previous: LabelledLead[];
  seesCost: boolean;
  spendByCurrency?: SpendByCurrency[] | null;
  period?: "week" | "period";
}): LeadQualityTiles {
  const qualified = input.current.filter((row) => effectiveLabel(row) === "qualified").length;
  const previousQualified = input.previous.filter((row) => effectiveLabel(row) === "qualified").length;
  const tiles: LeadQualityTiles = {
    qualified,
    total: input.current.length,
    rateLabel: input.current.length ? `${Math.round((qualified / input.current.length) * 100)}%` : "0%",
    trend: trendText(qualified - previousQualified, input.period ?? "week"),
  };
  if (!input.seesCost) return tiles;
  return { ...tiles, costPerQualifiedLead: costPerQualifiedLead(input.spendByCurrency ?? [], qualified) };
}

export function presentLeadQualityTiles<T extends { costPerQualifiedLead?: string }>(tiles: T, seesCost: boolean): T {
  if (seesCost) return tiles;
  const next = { ...tiles };
  delete next.costPerQualifiedLead;
  return next;
}

export function clientQualifiedKpis(input: { count: number; total: number; delta: number; period?: "week" | "period" } | null | undefined) {
  if (!input) return [];
  const rate = input.total ? Math.round((input.count / input.total) * 100) : 0;
  return [
    {
      label: "Qualified leads",
      value: String(input.count),
      delta: trendText(input.delta, input.period ?? "week"),
      meaning: "People who look like a fit for your business.",
    },
    {
      label: "Qualified rate",
      value: `${rate}%`,
      delta: "",
      meaning: "Qualified leads out of everyone who reached you.",
    },
  ];
}

export function leadQualityDigestNote(waiting: number) {
  if (waiting <= 0) return null;
  return `${waiting} ${waiting === 1 ? "lead" : "leads"} waiting for a quality mark`;
}

export function splitByWindow<T extends { createdAt: Date }>(rows: T[], start: Date, previousStart: Date) {
  return {
    current: rows.filter((row) => row.createdAt >= start),
    previous: rows.filter((row) => row.createdAt >= previousStart && row.createdAt < start),
  };
}

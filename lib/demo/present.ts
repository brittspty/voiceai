import { campaignTotals, type DemoDataset, type DemoMetric } from "./dataset";
import { dataChipLabel } from "./chip";

export type DemoView = "staff" | "client";

const COST_KEY = /spend|roas|cost|cpa|cpl|cpc|cpm|budget|revenue/i;

export function stripCostFields<T extends Record<string, unknown>>(row: T, showCost: boolean): T {
  if (showCost) return row;
  const copy = { ...row };
  for (const key of Object.keys(copy)) {
    if (COST_KEY.test(key)) delete copy[key];
  }
  return copy;
}

export function presentDemo(dataset: DemoDataset, view: DemoView) {
  const showCost = view === "staff";
  const clientName = (id: string) => dataset.clients.find((client) => client.id === id)?.name || id;
  const totals = dataset.campaigns.map((campaign) => {
    const sum = campaignTotals(dataset, campaign.id);
    return stripCostFields(
      {
        id: campaign.id,
        client: clientName(campaign.clientId),
        platform: campaign.platform,
        name: campaign.name,
        illustrative: campaign.illustrative,
        impressions: sum.impressions,
        clicks: sum.clicks,
        leads: sum.leads,
        verifiedConversions: sum.verifiedConversions,
        spendCents: sum.spendCents,
      },
      showCost,
    );
  });
  const compare = {
    badge: "ILLUSTRATIVE DEMO DATA" as const,
    ours: "Verified humans — boat service",
    platform: "Platform targeting (illustrative)",
    note: "Side by side in this demo. This step shows no figures.",
  };
  return {
    chip: dataChipLabel("demo"),
    view,
    clients: dataset.clients.map((client) => ({ name: client.name, email: client.email, phone: client.phone })),
    totals,
    compare,
    audiences: {
      uploaded: dataset.maids.length,
      matched: dataset.maids.filter((row) => row.matched).length,
      sample: dataset.maids.slice(0, 4).map((row) => ({ maid: row.maid, matched: row.matched, lineage: row.lineage })),
    },
    serving: totals.filter((row) => !row.illustrative),
    segments: dataset.segments.map((row) => ({ ...row, client: clientName(row.clientId) })),
    bots: dataset.bots,
    feed: dataset.feed,
    decisions: dataset.decisions,
    leads: dataset.leads.map((lead) => ({ ...lead, client: clientName(lead.clientId) })),
    report: dataset.reports.map((report) => ({
      title: report.title,
      client: clientName(report.clientId),
      weeks: report.weeks.map((week) => stripCostFields({ ...week }, showCost)),
    })),
  };
}

export function compareHasFigures(compare: { badge: string; ours: string; platform: string; note: string }) {
  return /\d/.test(`${compare.badge} ${compare.ours} ${compare.platform} ${compare.note}`);
}

export function presentationHasCost(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => presentationHasCost(item));
  return Object.entries(value as Record<string, unknown>).some(([key, inner]) => COST_KEY.test(key) || presentationHasCost(inner));
}

export function metricRows(metrics: DemoMetric[]) {
  return metrics;
}

import { prisma } from "../../db";
import { ctvFrequencyCap, decisionsV1Enabled } from "../config";
import { zonedISODate } from "../../time";
import { WORKSPACE_ID } from "../types";
import { evaluateDecisionRules, type AlertSlice, type BreakdownSlice, type CtvDaySlice, type DailySlice } from "./rules";
import { upsertOpenRecommendation } from "./store";

function iso(value: Date) {
  return value.toISOString().slice(0, 10);
}

function num(value: { toString(): string } | number | bigint | null | undefined) {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Reads stored rows and upserts one open recommendation per rule key.
 * Off while DECISIONS_V1 is off, so the current monitor stays as it is.
 * No budget write and no ad-platform call.
 */
export async function runStoredDecisionRules(now = new Date()) {
  if (!decisionsV1Enabled()) return { status: "skipped" as const, written: 0 };
  const org = await prisma.org.findUnique({ where: { id: "org" }, select: { timezone: true } });
  const end = zonedISODate(now, org?.timezone || "America/New_York");
  const [campaigns, grouped, ctvDays, breakdowns, alerts, clients] = await Promise.all([
    prisma.campaign.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        clientId: true,
        adAccountId: true,
        adAccount: { select: { clientId: true } },
        client: { select: { name: true } },
      },
    }),
    prisma.dailyMetric.groupBy({
      by: ["campaignId", "date"],
      where: { campaignId: { not: null }, workspaceId: WORKSPACE_ID },
      _sum: { impressions: true, clicks: true, platformConversions: true },
    }),
    prisma.ctvDeliveryDay.findMany({
      where: { workspaceId: WORKSPACE_ID, exampleData: false },
      select: {
        clientId: true,
        campaignId: true,
        campaignName: true,
        date: true,
        impressions: true,
        uniqueImpressions: true,
        exampleData: true,
      },
    }),
    prisma.ctvAttributionBreakdown.findMany({
      where: { workspaceId: WORKSPACE_ID, exampleData: false, dimension: { in: ["app", "publisher"] } },
      select: { clientId: true, dimension: true, name: true, impressions: true, viewConversions: true, exampleData: true },
    }),
    prisma.adAlert.findMany({
      where: { workspaceId: WORKSPACE_ID, archivedAt: null },
      select: {
        id: true,
        adId: true,
        campaignId: true,
        code: true,
        severity: true,
        title: true,
        metric: true,
        baseline: true,
        observed: true,
        windowStart: true,
        windowEnd: true,
        sampleSize: true,
        sourceMetricIds: true,
        ad: { select: { name: true } },
        campaign: { select: { clientId: true, name: true, adAccount: { select: { clientId: true } }, client: { select: { name: true } } } },
      },
    }),
    prisma.marketingClient.findMany({ where: { workspaceId: WORKSPACE_ID }, select: { id: true, name: true } }),
  ]);
  const clientName = new Map(clients.map((client) => [client.id, client.name]));
  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  const daily: DailySlice[] = [];
  for (const row of grouped) {
    if (!row.campaignId) continue;
    const campaign = campaignById.get(row.campaignId);
    if (!campaign) continue;
    const clientId = campaign.clientId || campaign.adAccount.clientId || "";
    daily.push({
      id: `${row.campaignId}:${iso(row.date)}`,
      campaignId: campaign.id,
      campaignName: campaign.name,
      clientId,
      clientName: campaign.client?.name || clientName.get(clientId) || "Unassigned",
      status: campaign.status,
      date: iso(row.date),
      impressions: num(row._sum.impressions),
      clicks: num(row._sum.clicks),
      conversions: num(row._sum.platformConversions),
    });
  }
  const ctv: CtvDaySlice[] = ctvDays.map((row) => ({
    clientId: row.clientId,
    clientName: clientName.get(row.clientId) || "Unassigned",
    campaignId: row.campaignId,
    campaignName: row.campaignName || row.campaignId,
    date: iso(row.date),
    impressions: num(row.impressions),
    uniqueImpressions: num(row.uniqueImpressions),
    exampleData: row.exampleData,
  }));
  const breakdown: BreakdownSlice[] = breakdowns.map((row) => ({
    clientId: row.clientId,
    clientName: clientName.get(row.clientId) || "Unassigned",
    dimension: row.dimension,
    name: row.name,
    impressions: num(row.impressions),
    visits: num(row.viewConversions),
    exampleData: row.exampleData,
  }));
  const alertRows: AlertSlice[] = alerts.map((row) => {
    const clientId = row.campaign.clientId || row.campaign.adAccount.clientId || "";
    return {
      id: row.id,
      adId: row.adId,
      adName: row.ad.name,
      campaignId: row.campaignId,
      clientId,
      clientName: row.campaign.client?.name || clientName.get(clientId) || "Unassigned",
      campaignName: row.campaign.name,
      code: row.code,
      severity: row.severity,
      title: row.title,
      metric: row.metric,
      baseline: row.baseline,
      observed: row.observed,
      windowStart: row.windowStart ? iso(row.windowStart) : "",
      windowEnd: row.windowEnd ? iso(row.windowEnd) : "",
      sampleSize: row.sampleSize,
      sourceMetricIds: row.sourceMetricIds,
    };
  });
  const drafts = evaluateDecisionRules({ end, frequencyCap: ctvFrequencyCap(), daily, ctvDays: ctv, breakdowns: breakdown, alerts: alertRows });
  const campaignIds = [...new Set(drafts.flatMap((draft) => (draft.campaignId ? [draft.campaignId] : [])))];
  if (campaignIds.length) {
    const metrics = await prisma.dailyMetric.findMany({
      where: { campaignId: { in: campaignIds }, workspaceId: WORKSPACE_ID },
      select: { id: true, campaignId: true, date: true, impressions: true, clicks: true, platformConversions: true },
    });
    for (const draft of drafts) {
      if (!draft.campaignId) continue;
      const start = typeof draft.evidence.windowStart === "string" ? draft.evidence.windowStart : draft.windowStart;
      const stop = typeof draft.evidence.windowEnd === "string" ? draft.evidence.windowEnd : draft.windowEnd;
      const mine = metrics.filter((row) => {
        if (row.campaignId !== draft.campaignId) return false;
        const date = iso(row.date);
        if (start && date < start) return false;
        if (stop && date > stop) return false;
        return true;
      });
      if (!mine.length) continue;
      draft.sourceMetricIds = mine.map((row) => row.id);
      draft.evidence = {
        ...draft.evidence,
        sourceMetricIds: draft.sourceMetricIds,
        sources: mine.map((row) => ({
          id: row.id,
          date: iso(row.date),
          impressions: num(row.impressions),
          clicks: num(row.clicks),
          conversions: num(row.platformConversions),
        })),
      };
    }
  }
  for (const draft of drafts) {
    const campaign = draft.campaignId ? campaignById.get(draft.campaignId) : undefined;
    await upsertOpenRecommendation(draft, now, { adAccountId: campaign?.adAccountId ?? null });
  }
  return { status: "ran" as const, written: drafts.length };
}

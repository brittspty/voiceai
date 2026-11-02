import { prisma } from "../db";
import { channelRowToSynced, dailyRowToSynced, insightViewFromSynced, presentInsightView, type InsightView, type SyncedMetric } from "./live";

function verticalFrom(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const vertical = (value as Record<string, unknown>).vertical;
  return typeof vertical === "string" ? vertical.trim() : "";
}

function audienceType(audiences: { role: string; audience: { type: string } }[]) {
  const include = audiences.find((row) => row.role === "include" && row.audience.type !== "unknown");
  return include?.audience.type || audiences.find((row) => row.audience.type !== "unknown")?.audience.type || "";
}

/** Reads stored lead counts only. Spend, names, and client labels are not selected. */
export async function readSyncedMetrics(): Promise<SyncedMetric[]> {
  const [daily, channel] = await Promise.all([
    prisma.dailyMetric.findMany({
      select: {
        workspaceId: true,
        platform: true,
        platformLeads: true,
        date: true,
        creativeVersion: { select: { creative: { select: { format: true } } } },
        audienceSegment: { select: { kind: true } },
        ad: {
          select: {
            adGroup: {
              select: {
                audiences: { select: { role: true, audience: { select: { type: true } } } },
                campaign: { select: { namingParsed: true, adAccount: { select: { clientId: true } } } },
              },
            },
          },
        },
      },
    }),
    prisma.channelDailyMetric.findMany({
      select: { workspaceId: true, channel: true, clientKey: true, leads: true, qualifiedLeads: true, date: true },
    }),
  ]);
  const dailyRows = daily.map((row) =>
    dailyRowToSynced({
      workspaceId: row.workspaceId,
      platform: row.platform,
      platformLeads: row.platformLeads,
      date: row.date,
      creativeFormat: row.creativeVersion?.creative.format ?? null,
      audienceType: audienceType(row.ad.adGroup.audiences),
      segmentKind: row.audienceSegment.kind,
      vertical: verticalFrom(row.ad.adGroup.campaign.namingParsed),
      clientId: row.ad.adGroup.campaign.adAccount.clientId,
    }),
  );
  const channelRows = channel.map((row) =>
    channelRowToSynced({
      workspaceId: row.workspaceId,
      channel: row.channel,
      clientKey: row.clientKey,
      leads: row.leads,
      qualifiedLeads: row.qualifiedLeads,
      date: row.date,
    }),
  );
  return [...dailyRows, ...channelRows];
}

export async function loadInsightView(): Promise<InsightView> {
  try {
    return presentInsightView(insightViewFromSynced(await readSyncedMetrics()));
  } catch {
    return presentInsightView({
      origin: "unavailable",
      label: "Synced data unavailable",
      recommendationsOnly: true,
      note: "Synced metrics could not be read. Example numbers are not shown.",
      items: [],
    });
  }
}

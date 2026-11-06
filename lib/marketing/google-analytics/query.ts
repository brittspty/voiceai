import { prisma } from "../../db";
import { addDaysISO, zonedISODate } from "../../time";
import { googleAnalyticsSyncEnabled, type Env } from "../config";
import { isolatedWhere } from "../workspace";
import { presentAnalyticsTraffic, type AnalyticsTrafficView } from "./view";

/**
 * Traffic for the dashboard. Null when the sync flag is off or no client in this workspace is mapped.
 * The payload has sessions, engaged sessions, conversions, and landing pages. It has no spend.
 */
export async function loadAnalyticsTraffic(input: {
  workspaceId: string;
  clientId?: string | null;
  days: number;
  now?: Date;
  timeZone?: string;
  env?: Env;
}): Promise<AnalyticsTrafficView | null> {
  const env = input.env ?? process.env;
  if (!googleAnalyticsSyncEnabled(env)) return null;
  const workspaceId = input.workspaceId.trim();
  if (!workspaceId) return null;
  const clientId = input.clientId?.trim() || null;
  const mapped = await prisma.marketingClient.count({
    where: isolatedWhere(workspaceId, {
      googleAnalyticsPropertyId: { not: "" },
      ...(clientId ? { id: clientId } : {}),
    }),
  });
  if (!mapped) return null;
  const end = zonedISODate(input.now ?? new Date(), input.timeZone ?? "America/New_York");
  const start = addDaysISO(end, -(Math.max(1, input.days) - 1));
  const rows = await prisma.googleAnalyticsDaily.findMany({
    where: isolatedWhere(workspaceId, {
      date: { gte: new Date(`${start}T00:00:00.000Z`), lte: new Date(`${end}T00:00:00.000Z`) },
      ...(clientId ? { clientId } : {}),
    }),
    select: {
      date: true,
      sessionCampaignName: true,
      sessionSource: true,
      sessionMedium: true,
      landingPage: true,
      sessions: true,
      engagedSessions: true,
      conversions: true,
      campaign: { select: { name: true } },
    },
  });
  return presentAnalyticsTraffic(
    rows.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      campaign: row.campaign?.name || row.sessionCampaignName,
      source: row.sessionSource,
      medium: row.sessionMedium,
      landingPage: row.landingPage,
      sessions: row.sessions,
      engagedSessions: row.engagedSessions,
      conversions: Number(row.conversions.toString()),
    })),
    start,
  );
}

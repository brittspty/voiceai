import { prisma } from "../../db";
import { addDaysISO, zonedISODate } from "../../time";
import { claritySyncEnabled, type Env } from "../config";
import { isolatedWhere } from "../workspace";
import { presentClarityFrustration, type ClarityFrustrationView } from "./view";

/**
 * Frustrated landing pages for the dashboard.
 * Null when the sync flag is off or no client in this workspace is mapped.
 * The payload has rage clicks, dead clicks, quick backs, and scroll depth. It has no spend.
 */
export async function loadClarityFrustration(input: {
  workspaceId: string;
  clientId?: string | null;
  days: number;
  now?: Date;
  timeZone?: string;
  env?: Env;
}): Promise<ClarityFrustrationView | null> {
  const env = input.env ?? process.env;
  if (!claritySyncEnabled(env)) return null;
  const workspaceId = input.workspaceId.trim();
  if (!workspaceId) return null;
  const clientId = input.clientId?.trim() || null;
  const scopes = await prisma.clarityClientScope.findMany({
    where: isolatedWhere(workspaceId, clientId ? { clientId } : {}),
    select: { projectId: true, clientId: true },
  });
  if (!scopes.length) return null;
  const end = zonedISODate(input.now ?? new Date(), input.timeZone ?? "America/New_York");
  const start = addDaysISO(end, -(Math.max(1, input.days) - 1));
  const breakdowns = ["url", "url_source_campaign"];
  const rows = await prisma.clarityDaily.findMany({
    where: isolatedWhere(workspaceId, {
      date: { gte: new Date(`${start}T00:00:00.000Z`), lte: new Date(`${end}T00:00:00.000Z`) },
      breakdown: { in: breakdowns },
      ...(clientId ? { clientId } : {}),
    }),
    select: {
      date: true,
      clientId: true,
      projectId: true,
      breakdown: true,
      url: true,
      sessions: true,
      rageClicks: true,
      deadClicks: true,
      quickbacks: true,
      scrollDepth: true,
    },
  });
  return presentClarityFrustration(
    rows.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      clientId: row.clientId,
      projectId: row.projectId,
      breakdown: row.breakdown,
      url: row.url,
      sessions: row.sessions,
      rageClicks: row.rageClicks,
      deadClicks: row.deadClicks,
      quickbacks: row.quickbacks,
      scrollDepth: row.scrollDepth === null ? null : Number(row.scrollDepth.toString()),
    })),
    scopes.map((scope) => scope.projectId),
    start,
  );
}

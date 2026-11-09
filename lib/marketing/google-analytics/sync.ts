import { demoForcesMock } from "../../demo/outbound";
import { addDaysISO, zonedISODate } from "../../time";
import { googleAnalyticsSyncEnabled, lookbackDays, type Env } from "../config";
import { WORKSPACE_ID } from "../types";
import { pullAnalyticsReport, redactAnalyticsSecrets, refreshAnalyticsAccessToken } from "./client";
import {
  clientsToRead,
  planAnalyticsConnections,
  type AnalyticsClientRow,
  type AnalyticsConnection,
  type AnalyticsSkip,
  type PlannedAnalyticsSkip,
} from "./connections";
import { matchAnalyticsCampaign, type AnalyticsCampaignRef } from "./match";
import { analyticsDimensionKey, emptyAnalyticsMarker, parseRunReport, type ParsedAnalyticsRow } from "./report";

export type GoogleAnalyticsSyncResult = {
  status: "skipped" | "succeeded" | "failed";
  reason?: string;
  error?: string;
  rowsWritten?: number;
  since?: string;
  until?: string;
  skipped: PlannedAnalyticsSkip[];
};

export type AnalyticsWriteRow = ParsedAnalyticsRow & {
  clientId: string;
  propertyId: string;
  connectionName: string;
  dimensionKey: string;
  campaignId: string | null;
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type GoogleAnalyticsDecision =
  | { action: "skip"; reason: string; skipped: AnalyticsSkip[] }
  | { action: "mock"; skipped: AnalyticsSkip[] }
  | { action: "live"; oauthClientId: string; oauthClientSecret: string; connections: AnalyticsConnection[]; skipped: AnalyticsSkip[] };

/**
 * Off unless GOOGLE_ANALYTICS_SYNC is on and a refresh token env is set.
 * Live reads use GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.
 * GOOGLE_ADS_REFRESH_TOKEN is not read. Mock makes no request.
 */
export function decideGoogleAnalytics(env: Env): GoogleAnalyticsDecision {
  if (!googleAnalyticsSyncEnabled(env)) return { action: "skip", reason: "GOOGLE_ANALYTICS_SYNC is off", skipped: [] };
  const plan = planAnalyticsConnections(env);
  const mode = (env.MARKETING_SYNC_MODE || "auto").trim().toLowerCase();
  if (mode === "off") return { action: "skip", reason: "MARKETING_SYNC_MODE=off", skipped: plan.skipped };
  if (mode !== "auto" && mode !== "live" && mode !== "mock") {
    return { action: "skip", reason: `unknown MARKETING_SYNC_MODE ${mode}`, skipped: plan.skipped };
  }
  if (!plan.connections.length) {
    const reason = plan.skipped.find((row) => row.name === "primary")?.reason || "missing GOOGLE_ANALYTICS_REFRESH_TOKEN";
    return { action: "skip", reason, skipped: plan.skipped };
  }
  if (mode === "mock") return { action: "mock", skipped: plan.skipped };
  const oauthClientId = (env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
  const oauthClientSecret = (env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();
  const missing = [!oauthClientId ? "GOOGLE_OAUTH_CLIENT_ID" : "", !oauthClientSecret ? "GOOGLE_OAUTH_CLIENT_SECRET" : ""].filter(Boolean);
  if (missing.length) return { action: "skip", reason: `missing ${missing.join(", ")}`, skipped: plan.skipped };
  return { action: "live", oauthClientId, oauthClientSecret, connections: plan.connections, skipped: plan.skipped };
}

function clip(value: string, max = 400) {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function connectionSkips(rows: readonly AnalyticsSkip[]): PlannedAnalyticsSkip[] {
  return rows.map((row) => ({ name: row.name, client: "", reason: row.reason }));
}

function toWriteRow(row: ParsedAnalyticsRow, planned: { client: AnalyticsClientRow; connection: string; propertyId: string }, campaigns: readonly AnalyticsCampaignRef[]): AnalyticsWriteRow {
  return {
    ...row,
    clientId: planned.client.id,
    propertyId: planned.propertyId,
    connectionName: planned.connection === "primary" ? "" : planned.connection,
    dimensionKey: analyticsDimensionKey(row),
    campaignId: matchAnalyticsCampaign(campaigns, planned.client.id, { name: row.sessionCampaignName, externalId: row.sessionCampaignId }),
  };
}

async function loadClients(): Promise<AnalyticsClientRow[]> {
  const { prisma } = await import("../../db");
  return prisma.marketingClient.findMany({
    where: { workspaceId: WORKSPACE_ID },
    select: { id: true, name: true, googleAnalyticsConnectionName: true, googleAnalyticsPropertyId: true },
  });
}

async function loadCampaigns(): Promise<AnalyticsCampaignRef[]> {
  const { prisma } = await import("../../db");
  return prisma.campaign.findMany({
    where: { workspaceId: WORKSPACE_ID },
    select: { id: true, name: true, externalId: true, clientId: true },
  });
}

/** Rows in one createMany. A day bigger than this is split into more short transactions. */
export const ANALYTICS_DAILY_WRITE_CHUNK = 500;

/** Passed on every batch so each transaction has an explicit timeout. */
export const ANALYTICS_WRITE_TIMEOUT_MS = 15_000;
export const ANALYTICS_WRITE_MAX_WAIT_MS = 5_000;

export type AnalyticsDailyWriteData = {
  workspaceId: string;
  clientId: string;
  propertyId: string;
  connectionName: string;
  date: Date;
  dimensionKey: string;
  sessionCampaignName: string;
  sessionSource: string;
  sessionMedium: string;
  landingPage: string;
  sessions: number;
  engagedSessions: number;
  conversions: number;
  campaignId: string | null;
};

export type AnalyticsWriteChunk = {
  clientId: string;
  propertyId: string;
  /** Dates cleared before this chunk's inserts. Empty on a continuation chunk so earlier batches stay put. */
  deleteDates: string[];
  rows: AnalyticsWriteRow[];
};

type AnalyticsDailyWriter = {
  googleAnalyticsDaily: {
    deleteMany(args: { where: { workspaceId: string; clientId: string; propertyId: string; date: { in: Date[] } } }): Promise<unknown>;
    createMany(args: { data: AnalyticsDailyWriteData[] }): Promise<unknown>;
  };
};

export type AnalyticsDailyDatabase = {
  $transaction<T>(fn: (tx: AnalyticsDailyWriter) => Promise<T>, options?: { maxWait?: number; timeout?: number }): Promise<T>;
};

function utcDay(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`);
}

function isoDatesThrough(since: string, until: string) {
  const dates: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !/^\d{4}-\d{2}-\d{2}$/.test(until)) return dates;
  let cursor = since;
  for (let i = 0; i < 400 && cursor <= until; i += 1) {
    dates.push(cursor);
    const next = addDaysISO(cursor, 1);
    if (next <= cursor) break;
    cursor = next;
  }
  return dates;
}

function dailyData(row: AnalyticsWriteRow): AnalyticsDailyWriteData {
  return {
    workspaceId: WORKSPACE_ID,
    clientId: row.clientId,
    propertyId: row.propertyId,
    connectionName: row.connectionName,
    date: utcDay(row.date),
    dimensionKey: row.dimensionKey,
    sessionCampaignName: row.sessionCampaignName,
    sessionSource: row.sessionSource,
    sessionMedium: row.sessionMedium,
    landingPage: row.landingPage,
    sessions: row.sessions,
    engagedSessions: row.engagedSessions,
    conversions: row.conversions,
    campaignId: row.campaignId,
  };
}

/**
 * One chunk is one short transaction.
 * The first chunk of a day deletes that day, then inserts. Later chunks only insert.
 * Days in the window with no rows are deleted so a re-run matches the pull and does not leave stale keys.
 * Duplicate dimension keys on the same day collapse to the last row, matching the old upsert.
 */
export function planAnalyticsWriteChunks(
  rows: readonly AnalyticsWriteRow[],
  since: string,
  until: string,
  chunkSize = ANALYTICS_DAILY_WRITE_CHUNK,
): AnalyticsWriteChunk[] {
  const size = Math.max(1, Math.floor(chunkSize));
  const window = isoDatesThrough(since, until);
  const groups = new Map<string, AnalyticsWriteRow[]>();
  for (const row of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) continue;
    const key = `${row.clientId}\u001f${row.propertyId}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  const chunks: AnalyticsWriteChunk[] = [];
  for (const group of groups.values()) {
    const sample = group[0];
    if (!sample) continue;
    const byDate = new Map<string, Map<string, AnalyticsWriteRow>>();
    for (const row of group) {
      const day = byDate.get(row.date) ?? new Map<string, AnalyticsWriteRow>();
      day.set(row.dimensionKey, row);
      byDate.set(row.date, day);
    }
    const covered = new Set(byDate.keys());
    const emptyDates = window.filter((date) => !covered.has(date));
    if (emptyDates.length) {
      chunks.push({ clientId: sample.clientId, propertyId: sample.propertyId, deleteDates: emptyDates, rows: [] });
    }
    for (const date of [...byDate.keys()].sort()) {
      const dayRows = [...(byDate.get(date)?.values() ?? [])];
      for (let offset = 0; offset < dayRows.length; offset += size) {
        chunks.push({
          clientId: sample.clientId,
          propertyId: sample.propertyId,
          deleteDates: offset === 0 ? [date] : [],
          rows: dayRows.slice(offset, offset + size),
        });
      }
    }
  }
  return chunks;
}

/**
 * Writes each property in its own series of short transactions.
 * A property that fails does not stop the properties after it.
 * Running again deletes each day in the window and inserts the same rows, so the table matches the pull.
 */
export async function writeAnalyticsDailyRows(
  db: AnalyticsDailyDatabase,
  rows: readonly AnalyticsWriteRow[],
  since: string,
  until: string,
): Promise<number> {
  const chunks = planAnalyticsWriteChunks(rows, since, until);
  const order: string[] = [];
  const byClient = new Map<string, AnalyticsWriteChunk[]>();
  for (const chunk of chunks) {
    const key = `${chunk.clientId}\u001f${chunk.propertyId}`;
    if (!byClient.has(key)) order.push(key);
    const list = byClient.get(key) ?? [];
    list.push(chunk);
    byClient.set(key, list);
  }
  const failures: unknown[] = [];
  let written = 0;
  const options = { maxWait: ANALYTICS_WRITE_MAX_WAIT_MS, timeout: ANALYTICS_WRITE_TIMEOUT_MS };
  for (const key of order) {
    const group = byClient.get(key) ?? [];
    try {
      for (const chunk of group) {
        await db.$transaction(async (tx) => {
          if (chunk.deleteDates.length) {
            await tx.googleAnalyticsDaily.deleteMany({
              where: {
                workspaceId: WORKSPACE_ID,
                clientId: chunk.clientId,
                propertyId: chunk.propertyId,
                date: { in: chunk.deleteDates.map(utcDay) },
              },
            });
          }
          if (chunk.rows.length) await tx.googleAnalyticsDaily.createMany({ data: chunk.rows.map(dailyData) });
        }, options);
      }
      written += group.reduce((sum, chunk) => sum + chunk.rows.length, 0);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length) {
    throw new Error(failures.map((error) => (error instanceof Error ? error.message : "Analytics write failed")).join("; "));
  }
  return written;
}

async function persistRows(rows: AnalyticsWriteRow[], since: string, until: string) {
  const { prisma } = await import("../../db");
  return writeAnalyticsDailyRows(prisma as unknown as AnalyticsDailyDatabase, rows, since, until);
}

/**
 * Pull GA4 sessions, engaged sessions, and key events for mapped properties.
 * Writes nothing when the flag is off, the refresh token is missing, or the workspace is the demo.
 * A client mapped to a missing extra connection is skipped. Unmapped clients are skipped.
 * This function never calls a Google Analytics write method.
 */
export async function runGoogleAnalyticsSync(options: {
  env?: Env;
  now?: Date;
  timezone?: string;
  fetchImpl?: FetchLike;
  clients?: AnalyticsClientRow[];
  campaigns?: AnalyticsCampaignRef[];
  writeRows?: (rows: AnalyticsWriteRow[], since: string, until: string) => Promise<number>;
} = {}): Promise<GoogleAnalyticsSyncResult> {
  if (demoForcesMock()) return { status: "skipped", reason: "demo workspace does not sync", skipped: [] };
  const env = options.env ?? process.env;
  const decision = decideGoogleAnalytics(env);
  if (decision.action === "skip") return { status: "skipped", reason: decision.reason, skipped: connectionSkips(decision.skipped) };
  if (decision.action === "mock") return { status: "skipped", reason: "MARKETING_SYNC_MODE=mock", skipped: connectionSkips(decision.skipped) };

  const clients = options.clients ?? (await loadClients());
  const planned = clientsToRead(clients, decision);
  const skipped = [...connectionSkips(decision.skipped), ...planned.skipped];
  if (!planned.ready.length) return { status: "skipped", reason: "no Analytics property is mapped", skipped };

  const now = options.now ?? new Date();
  const until = zonedISODate(now, options.timezone ?? "America/New_York");
  const since = addDaysISO(until, -(lookbackDays(env) - 1));
  const campaigns = options.campaigns ?? (await loadCampaigns());
  const secrets = [decision.oauthClientSecret, ...decision.connections.map((row) => row.refreshToken)];
  const failures: string[] = [];
  let rowsWritten = 0;
  const readyByConnection = new Map<string, typeof planned.ready>();
  for (const row of planned.ready) {
    const list = readyByConnection.get(row.connection) ?? [];
    list.push(row);
    readyByConnection.set(row.connection, list);
  }

  for (const connection of decision.connections) {
    const batch = readyByConnection.get(connection.name) ?? [];
    if (!batch.length) continue;
    let accessToken = "";
    try {
      accessToken = await refreshAnalyticsAccessToken({
        clientId: decision.oauthClientId,
        clientSecret: decision.oauthClientSecret,
        refreshToken: connection.refreshToken,
        fetchImpl: options.fetchImpl,
      });
    } catch (error) {
      const message = clip(redactAnalyticsSecrets(error instanceof Error ? error.message : "Analytics token refresh failed", [...secrets, accessToken]));
      failures.push(`${connection.name}: ${message}`);
      for (const row of batch) skipped.push({ name: connection.name, client: row.client.name, reason: message });
      continue;
    }
    for (const row of batch) {
      try {
        const pages = await pullAnalyticsReport({
          propertyId: row.propertyId,
          accessToken,
          since,
          until,
          fetchImpl: options.fetchImpl,
        });
        const parsed = pages.flatMap((page) => parseRunReport(page));
        const source = parsed.length ? parsed : [emptyAnalyticsMarker(until)];
        const writes = source.map((item) => toWriteRow(item, row, campaigns));
        rowsWritten += options.writeRows ? await options.writeRows(writes, since, until) : await persistRows(writes, since, until);
      } catch (error) {
        const message = clip(redactAnalyticsSecrets(error instanceof Error ? error.message : "Analytics report failed", [...secrets, accessToken]));
        failures.push(`${row.client.name}: ${message}`);
        skipped.push({ name: connection.name, client: row.client.name, reason: message });
      }
    }
  }

  if (failures.length) {
    return { status: "failed", error: clip(failures.join("; ")), rowsWritten, since, until, skipped };
  }
  return { status: "succeeded", rowsWritten, since, until, skipped };
}

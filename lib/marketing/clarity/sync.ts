import { demoForcesMock } from "../../demo/outbound";
import { zonedISODate } from "../../time";
import { claritySyncEnabled, type Env } from "../config";
import { WORKSPACE_ID } from "../types";
import { matchAnalyticsCampaign, type AnalyticsCampaignRef } from "../google-analytics/match";
import { ClarityApiError, pullClarityInsights, redactClaritySecrets } from "./client";
import {
  planClarityConnections,
  scopesToRead,
  type ClarityConnection,
  type ClarityScopeRow,
  type ClaritySkip,
  type PlannedClaritySkip,
} from "./connections";
import { CLARITY_PULLS, clarityDimensionKey, parseClarityExport, type ClarityBreakdown, type ParsedClarityRow } from "./report";

export const CLARITY_DAILY_REQUEST_CAP = 2;
export const CLARITY_DAILY_WRITE_CHUNK = 500;
export const CLARITY_WRITE_TIMEOUT_MS = 15_000;
export const CLARITY_WRITE_MAX_WAIT_MS = 5_000;

export type ClaritySyncResult = {
  status: "skipped" | "succeeded" | "failed";
  reason?: string;
  error?: string;
  rowsWritten?: number;
  requests?: number;
  date?: string;
  skipped: PlannedClaritySkip[];
};

export type ClarityWriteRow = ParsedClarityRow & {
  clientId: string;
  scopeId: string;
  projectId: string;
  connectionName: string;
  date: string;
  breakdown: ClarityBreakdown;
  dimensionKey: string;
  campaignId: string | null;
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type ClarityDecision =
  | { action: "skip"; reason: string; skipped: ClaritySkip[] }
  | { action: "mock"; skipped: ClaritySkip[] }
  | { action: "live"; connections: ClarityConnection[]; skipped: ClaritySkip[] };

/**
 * Off unless CLARITY_SYNC is on and a project token env is set.
 * Mock and off make no request. The token stays in the environment.
 */
export function decideClarity(env: Env): ClarityDecision {
  if (!claritySyncEnabled(env)) return { action: "skip", reason: "CLARITY_SYNC is off", skipped: [] };
  const plan = planClarityConnections(env);
  const mode = (env.MARKETING_SYNC_MODE || "auto").trim().toLowerCase();
  if (mode === "off") return { action: "skip", reason: "MARKETING_SYNC_MODE=off", skipped: plan.skipped };
  if (mode !== "auto" && mode !== "live" && mode !== "mock") {
    return { action: "skip", reason: `unknown MARKETING_SYNC_MODE ${mode}`, skipped: plan.skipped };
  }
  if (!plan.connections.length) {
    const reason = plan.skipped[0]?.reason || "CLARITY_CONNECTIONS is empty";
    return { action: "skip", reason, skipped: plan.skipped };
  }
  if (mode === "mock") return { action: "mock", skipped: plan.skipped };
  return { action: "live", connections: plan.connections, skipped: plan.skipped };
}

function clip(value: string, max = 400) {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function connectionSkips(rows: readonly ClaritySkip[]): PlannedClaritySkip[] {
  return rows.map((row) => ({ name: row.name, client: "", reason: row.reason }));
}

function utcDay(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`);
}

function toWriteRow(
  row: ParsedClarityRow,
  planned: { scope: ClarityScopeRow; connection: string; projectId: string },
  date: string,
  breakdown: ClarityBreakdown,
  campaigns: readonly AnalyticsCampaignRef[],
): ClarityWriteRow {
  return {
    ...row,
    clientId: planned.scope.clientId,
    scopeId: planned.scope.id,
    projectId: planned.projectId,
    connectionName: planned.connection,
    date,
    breakdown,
    dimensionKey: clarityDimensionKey(row),
    campaignId: matchAnalyticsCampaign(campaigns, planned.scope.clientId, { name: row.campaignName }),
  };
}

export type ClarityDailyWriteData = {
  workspaceId: string;
  clientId: string;
  scopeId: string;
  projectId: string;
  connectionName: string;
  date: Date;
  breakdown: string;
  dimensionKey: string;
  url: string;
  source: string;
  medium: string;
  campaignName: string;
  channel: string;
  device: string;
  browser: string;
  os: string;
  country: string;
  sessions: number;
  botSessions: number;
  users: number;
  pagesPerSession: number;
  engagementActive: number;
  engagementTotal: number;
  scrollDepth: number | null;
  popularPages: number;
  deadClicks: number;
  rageClicks: number;
  quickbacks: number;
  excessiveScroll: number;
  scriptErrors: number;
  errorClicks: number;
  deadClickRate: number | null;
  rageClickRate: number | null;
  quickbackRate: number | null;
  raw: ClarityWriteRow["raw"];
  campaignId: string | null;
};

export type ClarityWriteChunk = {
  clientId: string;
  projectId: string;
  breakdown: string;
  /** Set on the first chunk so that day's breakdown is replaced. Empty on a continuation chunk. */
  deleteDates: string[];
  rows: ClarityWriteRow[];
};

type ClarityDailyWriter = {
  clarityDaily: {
    deleteMany(args: { where: { workspaceId: string; clientId: string; projectId: string; breakdown: string; date: { in: Date[] } } }): Promise<unknown>;
    createMany(args: { data: ClarityDailyWriteData[] }): Promise<unknown>;
  };
};

export type ClarityDailyDatabase = {
  $transaction<T>(fn: (tx: ClarityDailyWriter) => Promise<T>, options?: { maxWait?: number; timeout?: number }): Promise<T>;
};

function dailyData(row: ClarityWriteRow): ClarityDailyWriteData {
  return {
    workspaceId: WORKSPACE_ID,
    clientId: row.clientId,
    scopeId: row.scopeId,
    projectId: row.projectId,
    connectionName: row.connectionName,
    date: utcDay(row.date),
    breakdown: row.breakdown,
    dimensionKey: row.dimensionKey,
    url: row.url,
    source: row.source,
    medium: row.medium,
    campaignName: row.campaignName,
    channel: row.channel,
    device: row.device,
    browser: row.browser,
    os: row.os,
    country: row.country,
    sessions: row.sessions,
    botSessions: row.botSessions,
    users: row.users,
    pagesPerSession: row.pagesPerSession,
    engagementActive: row.engagementActive,
    engagementTotal: row.engagementTotal,
    scrollDepth: row.scrollDepth,
    popularPages: row.popularPages,
    deadClicks: row.deadClicks,
    rageClicks: row.rageClicks,
    quickbacks: row.quickbacks,
    excessiveScroll: row.excessiveScroll,
    scriptErrors: row.scriptErrors,
    errorClicks: row.errorClicks,
    deadClickRate: row.deadClickRate,
    rageClickRate: row.rageClickRate,
    quickbackRate: row.quickbackRate,
    raw: row.raw,
    campaignId: row.campaignId,
  };
}

/**
 * One chunk is one short transaction.
 * The first chunk deletes that project, day, and breakdown, then inserts. Later chunks only insert.
 * Duplicate dimension keys collapse to the last row.
 * An empty pull still deletes that day so a re-run does not leave stale keys.
 */
export function planClarityWriteChunks(
  rows: readonly ClarityWriteRow[],
  date: string,
  scope: { clientId: string; projectId: string; breakdown: string },
  chunkSize = CLARITY_DAILY_WRITE_CHUNK,
): ClarityWriteChunk[] {
  const size = Math.max(1, Math.floor(chunkSize));
  const byKey = new Map<string, ClarityWriteRow>();
  for (const row of rows) {
    if (row.date !== date || row.clientId !== scope.clientId || row.projectId !== scope.projectId || row.breakdown !== scope.breakdown) continue;
    byKey.set(row.dimensionKey, row);
  }
  const dayRows = [...byKey.values()];
  if (!dayRows.length) return [{ clientId: scope.clientId, projectId: scope.projectId, breakdown: scope.breakdown, deleteDates: [date], rows: [] }];
  const chunks: ClarityWriteChunk[] = [];
  for (let offset = 0; offset < dayRows.length; offset += size) {
    chunks.push({
      clientId: scope.clientId,
      projectId: scope.projectId,
      breakdown: scope.breakdown,
      deleteDates: offset === 0 ? [date] : [],
      rows: dayRows.slice(offset, offset + size),
    });
  }
  return chunks;
}

/** Writes one project and breakdown. A second call for the same day replaces those rows. */
export async function writeClarityDailyRows(
  db: ClarityDailyDatabase,
  rows: readonly ClarityWriteRow[],
  date: string,
  scope: { clientId: string; projectId: string; breakdown: string },
): Promise<number> {
  const chunks = planClarityWriteChunks(rows, date, scope);
  const options = { maxWait: CLARITY_WRITE_MAX_WAIT_MS, timeout: CLARITY_WRITE_TIMEOUT_MS };
  let written = 0;
  for (const chunk of chunks) {
    await db.$transaction(async (tx) => {
      if (chunk.deleteDates.length) {
        await tx.clarityDaily.deleteMany({
          where: {
            workspaceId: WORKSPACE_ID,
            clientId: chunk.clientId,
            projectId: chunk.projectId,
            breakdown: chunk.breakdown,
            date: { in: chunk.deleteDates.map(utcDay) },
          },
        });
      }
      if (chunk.rows.length) await tx.clarityDaily.createMany({ data: chunk.rows.map(dailyData) });
    }, options);
    written += chunk.rows.length;
  }
  return written;
}

async function persistRows(rows: ClarityWriteRow[], date: string, scope: { clientId: string; projectId: string; breakdown: string }) {
  const { prisma } = await import("../../db");
  return writeClarityDailyRows(prisma as unknown as ClarityDailyDatabase, rows, date, scope);
}

export type ClarityClaim = { claimed: true } | { claimed: false; reason: string };

async function claimStoredRequest(scopeId: string, day: string, breakdown: string): Promise<ClarityClaim> {
  const { prisma } = await import("../../db");
  return prisma.$transaction(async (tx) => {
    const row = await tx.clarityClientScope.findUnique({
      where: { id: scopeId },
      select: { requestDay: true, requestCount: true, syncedBreakdowns: true },
    });
    if (!row) return { claimed: false, reason: "scope is missing" };
    const same = row.requestDay ? row.requestDay.toISOString().slice(0, 10) === day : false;
    const done = same ? row.syncedBreakdowns : [];
    const count = same ? row.requestCount : 0;
    if (done.includes(breakdown)) return { claimed: false, reason: "already synced today" };
    if (count >= CLARITY_DAILY_REQUEST_CAP) return { claimed: false, reason: "daily Clarity request cap" };
    await tx.clarityClientScope.update({
      where: { id: scopeId },
      data: { requestDay: utcDay(day), requestCount: count + 1, syncedBreakdowns: done },
    });
    return { claimed: true };
  });
}

async function completeStoredBreakdown(scopeId: string, day: string, breakdown: string) {
  const { prisma } = await import("../../db");
  const row = await prisma.clarityClientScope.findUnique({
    where: { id: scopeId },
    select: { requestDay: true, syncedBreakdowns: true },
  });
  if (!row?.requestDay || row.requestDay.toISOString().slice(0, 10) !== day) return;
  if (row.syncedBreakdowns.includes(breakdown)) return;
  await prisma.clarityClientScope.update({
    where: { id: scopeId },
    data: { syncedBreakdowns: [...row.syncedBreakdowns, breakdown] },
  });
}

async function exhaustStoredDay(scopeId: string, day: string) {
  const { prisma } = await import("../../db");
  await prisma.clarityClientScope.update({
    where: { id: scopeId },
    data: { requestDay: utcDay(day), requestCount: CLARITY_DAILY_REQUEST_CAP },
  });
}

async function loadScopes(): Promise<ClarityScopeRow[]> {
  const { prisma } = await import("../../db");
  const rows = await prisma.clarityClientScope.findMany({
    where: { workspaceId: WORKSPACE_ID },
    select: { id: true, clientId: true, projectId: true, label: true, connectionName: true, client: { select: { name: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    clientId: row.clientId,
    clientName: row.client.name,
    projectId: row.projectId,
    label: row.label,
    connectionName: row.connectionName,
  }));
}

async function loadCampaigns(): Promise<AnalyticsCampaignRef[]> {
  const { prisma } = await import("../../db");
  return prisma.campaign.findMany({
    where: { workspaceId: WORKSPACE_ID },
    select: { id: true, name: true, externalId: true, clientId: true },
  });
}

/**
 * Pull one day of Clarity metrics for each mapped project.
 * Two requests per project: URL + source + campaign, then URL alone.
 * A project already pulled today is not called again. The cap is 2, under the 10-a-day limit.
 * One client that fails does not stop the next client.
 * This function never calls a Clarity write method.
 */
export async function runClaritySync(options: {
  env?: Env;
  now?: Date;
  timezone?: string;
  fetchImpl?: FetchLike;
  scopes?: ClarityScopeRow[];
  campaigns?: AnalyticsCampaignRef[];
  writeRows?: (rows: ClarityWriteRow[], date: string, scope: { clientId: string; projectId: string; breakdown: string }) => Promise<number>;
  claimRequest?: (scopeId: string, day: string, breakdown: string) => Promise<ClarityClaim>;
  completeBreakdown?: (scopeId: string, day: string, breakdown: string) => Promise<void>;
  exhaustDay?: (scopeId: string, day: string) => Promise<void>;
} = {}): Promise<ClaritySyncResult> {
  if (demoForcesMock()) return { status: "skipped", reason: "demo workspace does not sync", skipped: [] };
  const env = options.env ?? process.env;
  const decision = decideClarity(env);
  if (decision.action === "skip") return { status: "skipped", reason: decision.reason, requests: 0, skipped: connectionSkips(decision.skipped) };
  if (decision.action === "mock") return { status: "skipped", reason: "MARKETING_SYNC_MODE=mock", requests: 0, skipped: connectionSkips(decision.skipped) };

  const scopes = options.scopes ?? (await loadScopes());
  const planned = scopesToRead(scopes, decision);
  const skipped = [...connectionSkips(decision.skipped), ...planned.skipped];
  if (!planned.ready.length) return { status: "skipped", reason: "no Clarity project is mapped", requests: 0, skipped };

  const now = options.now ?? new Date();
  const date = zonedISODate(now, options.timezone ?? "America/New_York");
  const campaigns = options.campaigns ?? (await loadCampaigns());
  const secrets = decision.connections.map((row) => row.token);
  const claim = options.claimRequest ?? claimStoredRequest;
  const complete = options.completeBreakdown ?? completeStoredBreakdown;
  const exhaust = options.exhaustDay ?? exhaustStoredDay;
  const write = options.writeRows ?? persistRows;
  const failures: string[] = [];
  let rowsWritten = 0;
  let requests = 0;
  let already = 0;
  const readyByConnection = new Map<string, typeof planned.ready>();
  for (const row of planned.ready) {
    const list = readyByConnection.get(row.connection) ?? [];
    list.push(row);
    readyByConnection.set(row.connection, list);
  }

  for (const connection of decision.connections) {
    const batch = readyByConnection.get(connection.name) ?? [];
    for (const row of batch) {
      const clientFailures: string[] = [];
      for (const pull of CLARITY_PULLS) {
        try {
          const slot = await claim(row.scope.id, date, pull.breakdown);
          if (!slot.claimed) {
            if (slot.reason === "already synced today") already += 1;
            if (slot.reason === "daily Clarity request cap") break;
            continue;
          }
          requests += 1;
          try {
            const body = await pullClarityInsights({
              token: connection.token,
              numOfDays: pull.numOfDays,
              dimensions: pull.dimensions,
              fetchImpl: options.fetchImpl,
            });
            const parsed = parseClarityExport(body);
            const writes = parsed.map((item) => toWriteRow(item, row, date, pull.breakdown, campaigns));
            const target = { clientId: row.scope.clientId, projectId: row.projectId, breakdown: pull.breakdown };
            rowsWritten += await write(writes, date, target);
            await complete(row.scope.id, date, pull.breakdown);
          } catch (error) {
            if (error instanceof ClarityApiError && error.status === 429) await exhaust(row.scope.id, date);
            throw error;
          }
        } catch (error) {
          const message = clip(redactClaritySecrets(error instanceof Error ? error.message : "Clarity export failed", secrets));
          clientFailures.push(message);
          if (error instanceof ClarityApiError && error.status === 429) break;
        }
      }
      if (clientFailures.length) {
        failures.push(`${row.scope.clientName}: ${clientFailures.join("; ")}`);
        skipped.push({ name: connection.name, client: row.scope.clientName, reason: clientFailures.join("; ") });
      }
    }
  }

  if (!requests && !failures.length) {
    return {
      status: "skipped",
      reason: already ? "already synced today" : "daily Clarity request cap",
      requests: 0,
      date,
      rowsWritten: 0,
      skipped,
    };
  }
  if (failures.length) {
    return { status: "failed", error: clip(failures.join("; ")), rowsWritten, requests, date, skipped };
  }
  return { status: "succeeded", rowsWritten, requests, date, skipped };
}

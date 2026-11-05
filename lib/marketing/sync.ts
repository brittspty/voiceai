import { demoForcesMock } from "../demo/outbound";
import { addDaysISO, zonedISODate } from "../time";
import { applySnapshot } from "./apply";
import {
  attributionWindowLabel,
  intradaySyncEnabled,
  lookbackDays,
  marketingSyncIntervalMs,
  metaSecretRef,
  planMetaReads,
  routeMetaAccounts,
  STALE_SYNC_MS,
  type Env,
  type MetaAccountPull,
  type MetaReadSkip,
} from "./config";
import { mockMetaBundle } from "./connectors/fixtures";
import { redactSecrets, type FetchLike } from "./connectors/meta-client";
import { mergeSnapshots, normalizeMetaBundle } from "./connectors/meta-map";
import { getConnector } from "./connectors/registry";
import type { MarketingStore } from "./store";
import { WORKSPACE_ID, type NormalizedSnapshot, type StoredSyncMode } from "./types";

export { marketingSyncIntervalMs };

export type SyncResult = {
  status: "skipped" | "succeeded" | "failed";
  reason?: string;
  error?: string;
  mode?: StoredSyncMode;
  accounts?: number;
  rowsWritten?: number;
  since?: string;
  until?: string;
  cadence?: "full" | "intraday";
  /** Names only. Tokens stay in the environment. */
  connections?: { name: string; accounts: number }[];
  skippedConnections?: { name: string; reason: string }[];
};

function publicSkips(skipped: MetaReadSkip[], ran: string[]) {
  const ready = new Set(ran);
  const rows = skipped.filter((row) => !ready.has(row.name));
  return rows.length ? rows.map((row) => ({ name: row.name, reason: row.reason })) : undefined;
}

function connectionSummary(pulls: MetaAccountPull[]) {
  return pulls.length ? pulls.map((pull) => ({ name: pull.name, accounts: pull.accountIds.length })) : undefined;
}

function clip(value: string, max = 500) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function insightWindow(now: Date, timeZone: string, days: number) {
  const until = zonedISODate(now, timeZone);
  const since = addDaysISO(until, -(days - 1));
  return { since, until };
}

async function defaultTimezone() {
  try {
    const { prisma } = await import("../db");
    const org = await prisma.org.findUnique({ where: { id: "org" }, select: { timezone: true } });
    return org?.timezone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}

async function withStore<T>(store: MarketingStore | undefined, run: (store: MarketingStore) => Promise<T>) {
  if (store) return run(store);
  const { prisma } = await import("../db");
  const { createPrismaMarketingStore } = await import("./prisma-store");
  return prisma.$transaction((tx) => run(createPrismaMarketingStore(tx)), { timeout: 300_000, maxWait: 15_000 });
}

async function readStore<T>(store: MarketingStore | undefined, run: (store: MarketingStore) => Promise<T>) {
  if (store) return run(store);
  const { prisma } = await import("../db");
  const { createPrismaMarketingStore } = await import("./prisma-store");
  return run(createPrismaMarketingStore(prisma));
}

export async function runMarketingSync(options: {
  env?: Env;
  now?: Date;
  timezone?: string;
  store?: MarketingStore;
  fetchImpl?: FetchLike;
  snapshot?: NormalizedSnapshot;
} = {}): Promise<SyncResult> {
  if (demoForcesMock()) return { status: "skipped", reason: "demo workspace does not sync" };
  const env = options.env ?? process.env;
  const plan = planMetaReads(env);
  if (plan.action === "skip") return { status: "skipped", reason: plan.reason, skippedConnections: publicSkips(plan.skipped, []) };

  const now = options.now ?? new Date();
  const timeZone = options.timezone ?? (await defaultTimezone());
  const running = await readStore(options.store, (store) => store.findRunningRun(WORKSPACE_ID, "meta"));
  if (running) {
    const age = now.getTime() - running.startedAt.getTime();
    if (age < STALE_SYNC_MS) return { status: "skipped", reason: "previous sync still running" };
    await readStore(options.store, (store) =>
      store.finishRun(running.id, {
        status: "failed",
        rowsRead: 0,
        rowsWritten: 0,
        error: "stopped because it ran longer than the time limit",
        note: "",
        finishedAt: now,
      }),
    );
  }
  const lastFull = await readStore(options.store, (store) => store.lastSuccessfulFull(WORKSPACE_ID, "meta"));
  const today = zonedISODate(now, timeZone);
  const intraday =
    intradaySyncEnabled(env) && Boolean(lastFull) && zonedISODate(lastFull!.finishedAt, timeZone) === today;
  const window = intraday ? { since: addDaysISO(today, -1), until: today } : insightWindow(now, timeZone, lookbackDays(env));
  const cadence = intraday ? "intraday" : "full";
  const windows = plan.attributionWindows;
  const attributionWindow = attributionWindowLabel(windows);
  const mode: StoredSyncMode = plan.action === "mock" ? "mock" : "live";

  let accountIds: string[] = [];
  let snapshot = options.snapshot;
  let pulls: MetaAccountPull[] = [];
  let routeWarnings: string[] = [];
  let skipped = plan.skipped;
  const primary = plan.connections.find((connection) => connection.name === "primary");
  const appId = plan.action === "live" ? (primary ?? plan.connections[0])?.appId ?? "" : "";

  if (!snapshot && plan.action === "live") {
    const stored = await readStore(options.store, (store) => store.enabledAccountIds("meta", WORKSPACE_ID));
    const routed = routeMetaAccounts(plan, { dbEnabledIds: stored });
    if (!routed.ok) return { status: "skipped", reason: routed.reason, cadence, skippedConnections: publicSkips(plan.skipped, []) };
    pulls = routed.pulls;
    routeWarnings = routed.warnings;
    skipped = routed.skipped;
    accountIds = pulls.flatMap((pull) => pull.accountIds);
    if (!accountIds.length) {
      return { status: "skipped", reason: "no ad accounts configured", cadence, skippedConnections: publicSkips(skipped, []) };
    }
  }

  const claimed = await readStore(options.store, async (store) => {
    const connection = await store.upsertConnection({
      workspaceId: WORKSPACE_ID,
      platform: "meta",
      authType: mode === "mock" ? "internal" : "system_user",
      secretRef: mode === "mock" ? "fixture:meta" : metaSecretRef(plan),
      appExternalId: appId,
      status: "connected",
      scopes: mode === "mock" ? ["fixture"] : ["ads_read", "read_insights"],
      lastSyncAt: null,
      lastError: null,
    });
    const run = await store.startRun({
      workspaceId: WORKSPACE_ID,
      connectionId: connection.id,
      platform: "meta",
      kind: cadence === "intraday" ? "insights" : "full",
      mode,
      windowStart: window.since,
      windowEnd: window.until,
      requestedAccounts: accountIds,
    });
    return { connectionId: connection.id, runId: run.id };
  });

  const failRun = async (message: string) => {
    await readStore(options.store, (store) =>
      store.finishRun(claimed.runId, {
        status: "failed",
        rowsRead: 0,
        rowsWritten: 0,
        error: message,
        note: "",
        finishedAt: now,
      }),
    );
  };

  const failures: string[] = [];
  try {
    if (!snapshot && plan.action === "mock") {
      snapshot = normalizeMetaBundle(mockMetaBundle(now, timeZone), { attributionWindow });
      if (intraday) {
        snapshot.metrics = snapshot.metrics.filter((metric) => metric.date >= window.since && metric.date <= window.until);
      }
      accountIds = snapshot.accounts.map((account) => account.externalId);
    }

    if (!snapshot && plan.action === "live") {
      const parts: NormalizedSnapshot[] = [];
      for (const pull of pulls) {
        try {
          const pulled = await getConnector("meta").pull({
            accountIds: pull.accountIds,
            accessToken: pull.accessToken,
            appSecret: pull.appSecret,
            graphVersion: plan.graphVersion,
            since: window.since,
            until: window.until,
            attributionWindows: windows,
            fetchImpl: options.fetchImpl,
            insightsOnly: intraday,
          });
          parts.push(pulled.snapshot);
          failures.push(...pulled.failures);
        } catch (error) {
          const message = redactSecrets(error instanceof Error ? error.message : "Meta sync failed", [pull.accessToken, pull.appSecret]);
          failures.push(`${pull.name}: ${clip(message)}`);
        }
      }
      if (!parts.length) {
        const message = clip(failures.join("; ") || "nothing to sync");
        await failRun(message);
        return {
          status: "failed",
          error: message,
          mode,
          since: window.since,
          until: window.until,
          cadence,
          connections: connectionSummary(pulls),
          skippedConnections: publicSkips(skipped, pulls.map((pull) => pull.name)),
        };
      }
      snapshot = mergeSnapshots(parts);
    }
  } catch (error) {
    const message = clip(error instanceof Error ? error.message : "Meta sync failed");
    await failRun(message);
    return { status: "failed", error: message, mode, since: window.since, until: window.until, cadence };
  }

  if (!snapshot) {
    await failRun("nothing to sync");
    return { status: "skipped", reason: "nothing to sync", cadence };
  }

  const error = failures.length ? clip(failures.join("; ")) : null;
  const skipNote = skipped
    .filter((row) => !pulls.some((pull) => pull.name === row.name))
    .map((row) => `${row.name} skipped: ${row.reason}`)
    .join("; ");
  const note = clip(
    [snapshot.warnings.filter((warning) => !warning.startsWith("Account pull failed")).join("; "), routeWarnings.join("; "), skipNote]
      .filter(Boolean)
      .join("; "),
  );
  const status = failures.length ? "failed" : "succeeded";

  try {
    const rowsWritten = await withStore(options.store, async (store) => {
      await store.markConnection(claimed.connectionId, {
        status: failures.length ? "error" : "connected",
        lastSyncAt: now,
        lastError: error,
      });
      const applied = await applySnapshot(store, snapshot, {
        workspaceId: WORKSPACE_ID,
        connectionId: claimed.connectionId,
        runId: claimed.runId,
      });
      await store.finishRun(claimed.runId, {
        status,
        rowsRead: snapshot.raw.length,
        rowsWritten: applied.rowsWritten,
        error,
        note,
        finishedAt: now,
      });
      return applied.rowsWritten;
    });
    if (!options.store) {
      try {
        const { prisma } = await import("../db");
        const { applyClientCampaignScopes } = await import("./client-campaign-scope");
        await applyClientCampaignScopes(prisma as never, WORKSPACE_ID);
      } catch {
        // Scoping is best effort. Unlinked campaigns stay staff-only.
      }
    }
    return {
      status,
      error: error ?? undefined,
      mode,
      accounts: snapshot.accounts.length,
      rowsWritten,
      since: window.since,
      until: window.until,
      cadence,
      connections: connectionSummary(pulls),
      skippedConnections: publicSkips(skipped, pulls.map((pull) => pull.name)),
    };
  } catch (caught) {
    const message = clip(caught instanceof Error ? caught.message : "Marketing sync failed");
    await failRun(message);
    return { status: "failed", error: message, mode, since: window.since, until: window.until, cadence };
  }
}

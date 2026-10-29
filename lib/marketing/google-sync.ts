import { addDaysISO, zonedISODate } from "../time";
import { applySnapshot } from "./apply";
import {
  decideGoogleAdsSync,
  intradaySyncEnabled,
  lookbackDays,
  STALE_SYNC_MS,
  type Env,
} from "./config";
import { mockGoogleAdsBundle } from "./connectors/google-fixtures";
import type { FetchLike } from "./connectors/google-ads-client";
import { normalizeGoogleAdsBundle } from "./connectors/google-ads-map";
import { getConnector } from "./connectors/registry";
import type { MarketingStore } from "./store";
import { WORKSPACE_ID, type NormalizedSnapshot, type StoredSyncMode } from "./types";

export type GoogleSyncResult = {
  status: "skipped" | "succeeded" | "failed";
  reason?: string;
  error?: string;
  mode?: StoredSyncMode;
  accounts?: number;
  rowsWritten?: number;
  searchTerms?: number;
  since?: string;
  until?: string;
  cadence?: "full" | "intraday";
};

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

/**
 * Pull Google Ads into the shared marketing tables.
 * Returns skipped, and writes nothing, when the switch is off or credentials are missing.
 */
export async function runGoogleAdsSync(options: {
  env?: Env;
  now?: Date;
  timezone?: string;
  store?: MarketingStore;
  fetchImpl?: FetchLike;
  snapshot?: NormalizedSnapshot;
} = {}): Promise<GoogleSyncResult> {
  const env = options.env ?? process.env;
  const decision = decideGoogleAdsSync(env);
  if (decision.action === "skip") return { status: "skipped", reason: decision.reason };

  const now = options.now ?? new Date();
  const timeZone = options.timezone ?? (await defaultTimezone());
  const running = await readStore(options.store, (store) => store.findRunningRun(WORKSPACE_ID, "google_ads"));
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
  const lastFull = await readStore(options.store, (store) => store.lastSuccessfulFull(WORKSPACE_ID, "google_ads"));
  const today = zonedISODate(now, timeZone);
  const intraday =
    intradaySyncEnabled(env) && Boolean(lastFull) && zonedISODate(lastFull!.finishedAt, timeZone) === today;
  const window = intraday ? { since: addDaysISO(today, -1), until: today } : insightWindow(now, timeZone, lookbackDays(env));
  const cadence = intraday ? "intraday" : "full";
  const mode: StoredSyncMode = decision.action === "mock" ? "mock" : "live";
  const accountIds = decision.action === "live" ? (decision.customerIds.length ? decision.customerIds : [decision.loginCustomerId]) : [];

  const claimed = await readStore(options.store, async (store) => {
    const connection = await store.upsertConnection({
      workspaceId: WORKSPACE_ID,
      platform: "google_ads",
      authType: mode === "mock" ? "internal" : "oauth",
      secretRef: mode === "mock" ? "fixture:google_ads" : "env:GOOGLE_ADS_REFRESH_TOKEN",
      appExternalId: decision.action === "live" ? decision.loginCustomerId : "",
      status: "connected",
      scopes: mode === "mock" ? ["fixture"] : ["https://www.googleapis.com/auth/adwords", "googleAds.search", "googleAds.searchStream"],
      lastSyncAt: null,
      lastError: null,
    });
    const run = await store.startRun({
      workspaceId: WORKSPACE_ID,
      connectionId: connection.id,
      platform: "google_ads",
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

  let snapshot = options.snapshot;
  let failures: string[] = [];
  try {
    if (!snapshot && decision.action === "mock") {
      snapshot = normalizeGoogleAdsBundle(mockGoogleAdsBundle(now, timeZone));
      if (intraday) {
        snapshot.metrics = snapshot.metrics.filter((metric) => metric.date >= window.since && metric.date <= window.until);
        snapshot.searchTerms = snapshot.searchTerms.filter((row) => row.date >= window.since && row.date <= window.until);
      }
    }
    if (!snapshot && decision.action === "live") {
      const pulled = await getConnector("google_ads").pull({
        customerIds: decision.customerIds,
        discoverCustomers: decision.customerIds.length === 0,
        loginCustomerId: decision.loginCustomerId,
        developerToken: decision.developerToken,
        clientId: decision.clientId,
        clientSecret: decision.clientSecret,
        refreshToken: decision.refreshToken,
        apiVersion: decision.apiVersion,
        since: window.since,
        until: window.until,
        fetchImpl: options.fetchImpl,
        insightsOnly: intraday,
      });
      snapshot = pulled.snapshot;
      failures = pulled.failures;
    }
  } catch (error) {
    const message = clip(error instanceof Error ? error.message : "Google Ads sync failed");
    await failRun(message);
    return { status: "failed", error: message, mode, since: window.since, until: window.until, cadence };
  }

  if (!snapshot) {
    await failRun("nothing to sync");
    return { status: "skipped", reason: "nothing to sync", cadence };
  }

  const error = failures.length ? clip(failures.join("; ")) : null;
  const note = clip(snapshot.warnings.filter((warning) => !warning.startsWith("Account pull failed")).join("; "));
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
    return {
      status,
      error: error ?? undefined,
      mode,
      accounts: snapshot.accounts.length,
      rowsWritten,
      searchTerms: snapshot.searchTerms.length,
      since: window.since,
      until: window.until,
      cadence,
    };
  } catch (caught) {
    const message = clip(caught instanceof Error ? caught.message : "Google Ads sync failed");
    await failRun(message);
    return { status: "failed", error: message, mode, since: window.since, until: window.until, cadence };
  }
}

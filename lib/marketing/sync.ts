import { addDaysISO, zonedISODate } from "../time";
import { applySnapshot } from "./apply";
import {
  attributionWindowLabel,
  attributionWindows,
  decideSync,
  lookbackDays,
  marketingSyncIntervalMs,
  resolveAccountIds,
  type Env,
} from "./config";
import { mockMetaBundle } from "./connectors/fixtures";
import type { FetchLike } from "./connectors/meta-client";
import { normalizeMetaBundle } from "./connectors/meta-map";
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

export async function runMarketingSync(options: {
  env?: Env;
  now?: Date;
  timezone?: string;
  store?: MarketingStore;
  fetchImpl?: FetchLike;
  snapshot?: NormalizedSnapshot;
} = {}): Promise<SyncResult> {
  const env = options.env ?? process.env;
  const decision = decideSync(env);
  if (decision.action === "skip") return { status: "skipped", reason: decision.reason };

  const now = options.now ?? new Date();
  const timeZone = options.timezone ?? (await defaultTimezone());
  const window = insightWindow(now, timeZone, lookbackDays(env));
  const windows = attributionWindows(env);
  const attributionWindow = attributionWindowLabel(windows);
  const mode: StoredSyncMode = decision.action === "mock" ? "mock" : "live";

  let accountIds: string[] = [];
  let snapshot = options.snapshot;
  let failures: string[] = [];

  if (!snapshot && decision.action === "mock") {
    snapshot = normalizeMetaBundle(mockMetaBundle(now, timeZone), { attributionWindow });
    accountIds = snapshot.accounts.map((account) => account.externalId);
  }

  if (!snapshot && decision.action === "live") {
    const stored = options.store
      ? await options.store.enabledAccountIds("meta", WORKSPACE_ID)
      : await withStore(undefined, (store) => store.enabledAccountIds("meta", WORKSPACE_ID));
    accountIds = resolveAccountIds(decision.accountIds, stored);
    if (!accountIds.length) return { status: "skipped", reason: "no ad accounts configured" };
    try {
      const pulled = await getConnector("meta").pull({
        accountIds,
        accessToken: decision.accessToken,
        appSecret: decision.appSecret,
        graphVersion: decision.graphVersion,
        since: window.since,
        until: window.until,
        attributionWindows: windows,
        fetchImpl: options.fetchImpl,
      });
      snapshot = pulled.snapshot;
      failures = pulled.failures;
    } catch (error) {
      const message = clip(error instanceof Error ? error.message : "Meta sync failed");
      return { status: "failed", error: message, mode, since: window.since, until: window.until };
    }
  }

  if (!snapshot) return { status: "skipped", reason: "nothing to sync" };
  if (!accountIds.length) accountIds = snapshot.accounts.map((account) => account.externalId);

  const error = failures.length ? clip(failures.join("; ")) : null;
  const note = clip(snapshot.warnings.filter((warning) => !warning.startsWith("Account pull failed")).join("; "));
  const status = failures.length ? "failed" : "succeeded";
  const appId = decision.action === "live" ? decision.appId : "";

  try {
    const rowsWritten = await withStore(options.store, async (store) => {
      const connection = await store.upsertConnection({
        workspaceId: WORKSPACE_ID,
        platform: "meta",
        authType: mode === "mock" ? "internal" : "system_user",
        secretRef: mode === "mock" ? "fixture:meta" : "env:META_ACCESS_TOKEN",
        appExternalId: appId,
        status: failures.length ? "error" : "connected",
        scopes: mode === "mock" ? ["fixture"] : ["ads_read", "read_insights"],
        lastSyncAt: now,
        lastError: error,
      });
      const run = await store.startRun({
        workspaceId: WORKSPACE_ID,
        connectionId: connection.id,
        platform: "meta",
        kind: "full",
        mode,
        windowStart: window.since,
        windowEnd: window.until,
        requestedAccounts: accountIds,
      });
      const applied = await applySnapshot(store, snapshot, {
        workspaceId: WORKSPACE_ID,
        connectionId: connection.id,
        runId: run.id,
      });
      await store.finishRun(run.id, {
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
      since: window.since,
      until: window.until,
    };
  } catch (caught) {
    const message = clip(caught instanceof Error ? caught.message : "Marketing sync failed");
    return { status: "failed", error: message, mode, since: window.since, until: window.until };
  }
}

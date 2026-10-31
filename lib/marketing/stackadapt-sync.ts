import { addDaysISO, zonedISODate } from "../time";
import { applySnapshot } from "./apply";
import { decideStackAdapt, lookbackDays, type Env } from "./config";
import { pullStackAdaptSnapshot } from "./connectors/stackadapt";
import type { FetchLike } from "./connectors/stackadapt-client";
import { recommendStackAdapt, stackAdaptToSnapshot, type StackAdaptRecommendation } from "./connectors/stackadapt-map";
import { pickAssignee } from "./ad-fatigue";
import type { MarketingStore } from "./store";
import { WORKSPACE_ID, type NormalizedSnapshot } from "./types";
import type { StackAdaptBundle } from "./connectors/stackadapt-client";

export function mockStackAdaptBundle(): StackAdaptBundle {
  return {
    warnings: [],
    campaigns: [
      {
        id: "camp_mock",
        name: "MOCK StackAdapt",
        status: "ACTIVE",
        lineItems: [
          {
            id: "line_mock",
            name: "MOCK line",
            status: "ACTIVE",
            creatives: [{ id: "cr_mock", name: "MOCK creative", status: "ACTIVE" }],
            dailyStats: [
              { date: "2026-10-20", impressions: 100, clicks: 2, conversions: 0, spend: 1 },
            ],
          },
        ],
      },
    ],
  };
}

function clip(value: string, max = 500) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

async function withStore<T>(store: MarketingStore | undefined, run: (store: MarketingStore) => Promise<T>) {
  if (store) return run(store);
  const { prisma } = await import("../db");
  const { createPrismaMarketingStore } = await import("./prisma-store");
  return prisma.$transaction((tx) => run(createPrismaMarketingStore(tx)), { timeout: 120_000, maxWait: 15_000 });
}

/**
 * Read StackAdapt into the shared metric tables and return recommendations.
 * Off, or missing STACKADAPT_API_KEY, writes nothing.
 * Campaign budget fields on the snapshot are empty. This does not call a mutation.
 */
export async function runStackAdaptSync(options: {
  env?: Env;
  now?: Date;
  timezone?: string;
  store?: MarketingStore;
  fetchImpl?: FetchLike;
  snapshot?: NormalizedSnapshot;
} = {}) {
  const env = options.env ?? process.env;
  const decision = decideStackAdapt(env);
  if (decision.action === "skip") return { status: "skipped" as const, reason: decision.reason, recommendations: [] as StackAdaptRecommendation[] };

  const now = options.now ?? new Date();
  const timeZone = options.timezone ?? "America/New_York";
  const until = zonedISODate(now, timeZone);
  const since = addDaysISO(until, -(lookbackDays(env) - 1));
  const mode = decision.action === "mock" ? "mock" : "live";

  let snapshot = options.snapshot;
  let failures: string[] = [];
  let recommendations: StackAdaptRecommendation[] = [];
  if (!snapshot && decision.action === "mock") snapshot = stackAdaptToSnapshot(mockStackAdaptBundle());
  if (!snapshot && decision.action === "live") {
    const pulled = await pullStackAdaptSnapshot({ apiKey: decision.apiKey, since, until, fetchImpl: options.fetchImpl });
    snapshot = pulled.snapshot;
    failures = pulled.failures;
    recommendations = pulled.recommendations;
  }
  if (!snapshot) return { status: "skipped" as const, reason: "nothing to sync", recommendations };
  if (!recommendations.length) recommendations = recommendStackAdapt(snapshot, until);

  const claimed = await withStore(options.store, async (store) => {
    const connection = await store.upsertConnection({
      workspaceId: WORKSPACE_ID,
      platform: "stackadapt",
      authType: mode === "mock" ? "internal" : "private_token",
      secretRef: mode === "mock" ? "fixture:stackadapt" : "env:STACKADAPT_API_KEY",
      appExternalId: "",
      status: failures.length ? "error" : "connected",
      scopes: ["read"],
      lastSyncAt: now,
      lastError: failures[0] ?? null,
    });
    const run = await store.startRun({
      workspaceId: WORKSPACE_ID,
      connectionId: connection.id,
      platform: "stackadapt",
      kind: "full",
      mode,
      windowStart: since,
      windowEnd: until,
      requestedAccounts: ["stackadapt"],
    });
    const applied = await applySnapshot(store, snapshot, { workspaceId: WORKSPACE_ID, connectionId: connection.id, runId: run.id });
    await store.finishRun(run.id, {
      status: failures.length ? "failed" : "succeeded",
      rowsRead: snapshot.raw.length,
      rowsWritten: applied.rowsWritten,
      error: failures.length ? clip(failures.join("; ")) : null,
      note: "Read only.",
      finishedAt: now,
    });
    return applied.rowsWritten;
  });

  if (!options.store && recommendations.length) await persistStackAdaptRecommendations(recommendations, now);
  return {
    status: failures.length ? ("failed" as const) : ("succeeded" as const),
    mode,
    rowsWritten: claimed,
    recommendations,
    since,
    until,
  };
}

async function persistStackAdaptRecommendations(recommendations: StackAdaptRecommendation[], now: Date) {
  const { prisma } = await import("../db");
  const assignments = await prisma.marketingAssignment.findMany({
    where: { workspaceId: WORKSPACE_ID },
    select: { userId: true, scopeKind: true, adAccountId: true, campaignId: true },
  });
  for (const recommendation of recommendations) {
    const ad = await prisma.ad.findFirst({
      where: { workspaceId: WORKSPACE_ID, platform: "stackadapt", externalId: recommendation.adId },
      select: { id: true, adGroup: { select: { campaignId: true, campaign: { select: { adAccountId: true } } } } },
    });
    if (!ad) continue;
    const campaignId = ad.adGroup.campaignId;
    const adAccountId = ad.adGroup.campaign.adAccountId;
    const existing = await prisma.recommendation.findFirst({
      where: { type: "stackadapt", adId: ad.id, createdAt: { gte: new Date(now.getTime() - 20 * 60 * 60 * 1000) } },
      select: { id: true },
    });
    if (existing) continue;
    const assigneeUserId = pickAssignee(assignments, adAccountId, campaignId);
    await prisma.recommendation.create({
      data: {
        workspaceId: WORKSPACE_ID,
        type: "stackadapt",
        status: "verified",
        adId: ad.id,
        campaignId,
        adAccountId,
        title: recommendation.title,
        summary: recommendation.summary,
        rationale: recommendation.rationale,
        metric: recommendation.metric,
        baseline: recommendation.baseline,
        observed: recommendation.observed,
        windowStart: new Date(`${recommendation.windowStart}T00:00:00.000Z`),
        windowEnd: new Date(`${recommendation.windowEnd}T00:00:00.000Z`),
        sampleSize: recommendation.sampleSize,
        sourceMetricIds: [],
        evidence: {
          action: recommendation.action,
          confidence: recommendation.confidence,
          assigneeUserId,
          changesSpend: false,
          writesAds: false,
          recommendationOnly: true,
        },
        verifiedAt: now,
        verifierNote: "Read from StackAdapt. Yes only records the answer. Nothing on the ad account changes.",
      },
    });
  }
}

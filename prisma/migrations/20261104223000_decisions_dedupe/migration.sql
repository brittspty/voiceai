-- Decisions phase 1. A stable dedupe key and a client on each recommendation.
-- Ad alerts get the same treatment: one open row per ad and code.
-- No unique index. Production already has duplicate open rows, and the
-- collapse script archives those after a person approves the dry run.

ALTER TYPE "RecommendationType" ADD VALUE IF NOT EXISTS 'ctr_drift';
ALTER TYPE "RecommendationType" ADD VALUE IF NOT EXISTS 'conversion_drift';
ALTER TYPE "RecommendationType" ADD VALUE IF NOT EXISTS 'conversion_gap';
ALTER TYPE "RecommendationType" ADD VALUE IF NOT EXISTS 'stale_campaign';
ALTER TYPE "RecommendationType" ADD VALUE IF NOT EXISTS 'ctv_frequency';
ALTER TYPE "RecommendationType" ADD VALUE IF NOT EXISTS 'ctv_outlier';
ALTER TYPE "RecommendationType" ADD VALUE IF NOT EXISTS 'ad_underperformance';

ALTER TABLE "Recommendation" ADD COLUMN IF NOT EXISTS "clientId" TEXT;
ALTER TABLE "Recommendation" ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Recommendation" ADD COLUMN IF NOT EXISTS "rule" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Recommendation" ADD COLUMN IF NOT EXISTS "severity" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Recommendation" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3);
ALTER TABLE "Recommendation" ADD COLUMN IF NOT EXISTS "snoozedUntil" TIMESTAMP(3);
ALTER TABLE "Recommendation" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

ALTER TABLE "AdAlert" ADD COLUMN IF NOT EXISTS "clientId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AdAlert" ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AdAlert" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3);
ALTER TABLE "AdAlert" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "DecisionAudit" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "recommendationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "snoozeUntil" DATE,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Recommendation_dedupeKey_idx" ON "Recommendation"("dedupeKey");
CREATE INDEX IF NOT EXISTS "Recommendation_clientId_status_idx" ON "Recommendation"("clientId", "status");
CREATE INDEX IF NOT EXISTS "Recommendation_archivedAt_idx" ON "Recommendation"("archivedAt");
CREATE INDEX IF NOT EXISTS "AdAlert_adId_code_idx" ON "AdAlert"("adId", "code");
CREATE INDEX IF NOT EXISTS "AdAlert_archivedAt_idx" ON "AdAlert"("archivedAt");
CREATE INDEX IF NOT EXISTS "DecisionAudit_recommendationId_createdAt_idx" ON "DecisionAudit"("recommendationId", "createdAt");
CREATE INDEX IF NOT EXISTS "DecisionAudit_userId_idx" ON "DecisionAudit"("userId");

DO $$ BEGIN
  ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "MarketingClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DecisionAudit" ADD CONSTRAINT "DecisionAudit_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DecisionAudit" ADD CONSTRAINT "DecisionAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

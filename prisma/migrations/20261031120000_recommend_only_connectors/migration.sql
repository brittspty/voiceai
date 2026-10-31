-- Recommend-only ad fatigue, StackAdapt platform, and Business Profile snapshots.
-- recommendationOnly is forced on. These tables do not record an ad write or a budget write.

ALTER TYPE "AdPlatform" ADD VALUE IF NOT EXISTS 'stackadapt';
ALTER TYPE "RecommendationType" ADD VALUE 'ad_fatigue';
ALTER TYPE "RecommendationType" ADD VALUE 'stackadapt';
ALTER TYPE "RecommendationType" ADD VALUE 'business_profile';

CREATE TYPE "AdFatigueAction" AS ENUM ('keep', 'rotate', 'pause');

CREATE TABLE "AdFatiguePrior" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "clientKey" TEXT NOT NULL DEFAULT '',
    "confidenceThreshold" DECIMAL(6,4) NOT NULL DEFAULT 0.8000,
    "clickDays" DECIMAL(8,4) NOT NULL DEFAULT 7,
    "viewDays" DECIMAL(8,4) NOT NULL DEFAULT 1,
    "goodChecksBeforeResume" DECIMAL(8,4) NOT NULL DEFAULT 2,
    "observations" INTEGER NOT NULL DEFAULT 0,
    "resumeEpisodes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdFatiguePrior_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdFatiguePrior_workspaceId_clientKey_key" ON "AdFatiguePrior"("workspaceId", "clientKey");
CREATE INDEX "AdFatiguePrior_workspaceId_idx" ON "AdFatiguePrior"("workspaceId");

CREATE TABLE "AdFatigueCheck" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "clientKey" TEXT NOT NULL DEFAULT '',
    "platform" "AdPlatform" NOT NULL,
    "adId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "action" "AdFatigueAction" NOT NULL,
    "confidence" DECIMAL(6,4) NOT NULL,
    "emitted" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "metric" TEXT NOT NULL DEFAULT '',
    "clickDays" DECIMAL(8,4) NOT NULL,
    "viewDays" DECIMAL(8,4) NOT NULL,
    "goodChecks" DECIMAL(8,4) NOT NULL,
    "threshold" DECIMAL(6,4) NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "signals" JSONB NOT NULL,
    "windowStart" DATE NOT NULL,
    "windowEnd" DATE NOT NULL,
    "recommendationOnly" BOOLEAN NOT NULL DEFAULT true,
    "changesSpend" BOOLEAN NOT NULL DEFAULT false,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdFatigueCheck_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AdFatigueCheck_recommendationOnly_check" CHECK ("recommendationOnly" = true),
    CONSTRAINT "AdFatigueCheck_changesSpend_check" CHECK ("changesSpend" = false)
);

CREATE UNIQUE INDEX "AdFatigueCheck_workspaceId_adId_windowEnd_key" ON "AdFatigueCheck"("workspaceId", "adId", "windowEnd");
CREATE INDEX "AdFatigueCheck_adId_detectedAt_idx" ON "AdFatigueCheck"("adId", "detectedAt");
CREATE INDEX "AdFatigueCheck_adAccountId_idx" ON "AdFatigueCheck"("adAccountId");
CREATE INDEX "AdFatigueCheck_campaignId_idx" ON "AdFatigueCheck"("campaignId");

ALTER TABLE "AdFatigueCheck" ADD CONSTRAINT "AdFatigueCheck_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdFatigueCheck" ADD CONSTRAINT "AdFatigueCheck_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdFatigueCheck" ADD CONSTRAINT "AdFatigueCheck_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BusinessProfileSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "locationId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "date" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "searches" INTEGER NOT NULL DEFAULT 0,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "directionRequests" INTEGER NOT NULL DEFAULT 0,
    "websiteClicks" INTEGER NOT NULL DEFAULT 0,
    "rating" DECIMAL(4,2),
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "unansweredReviews" INTEGER NOT NULL DEFAULT 0,
    "missingInfo" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recommendationOnly" BOOLEAN NOT NULL DEFAULT true,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessProfileSnapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BusinessProfileSnapshot_recommendationOnly_check" CHECK ("recommendationOnly" = true)
);

CREATE UNIQUE INDEX "BusinessProfileSnapshot_workspaceId_locationId_date_key" ON "BusinessProfileSnapshot"("workspaceId", "locationId", "date");
CREATE INDEX "BusinessProfileSnapshot_workspaceId_fetchedAt_idx" ON "BusinessProfileSnapshot"("workspaceId", "fetchedAt");

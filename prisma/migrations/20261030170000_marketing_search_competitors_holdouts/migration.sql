-- CreateEnum
CREATE TYPE "SearchMatchType" AS ENUM ('exact', 'phrase', 'broad');

-- CreateEnum
CREATE TYPE "NegativeLevel" AS ENUM ('campaign', 'ad_group', 'account');

-- CreateEnum
CREATE TYPE "NegativeProposalStatus" AS ENUM ('proposed', 'kept', 'exported');

-- CreateEnum
CREATE TYPE "LiftTestStatus" AS ENUM ('draft', 'running', 'paused', 'invalidated', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "LiftDesignKind" AS ENUM ('geo', 'time', 'audience');

-- CreateEnum
CREATE TYPE "LiftMetric" AS ENUM ('leads', 'bookings', 'conversions');

-- CreateEnum
CREATE TYPE "LiftCellRole" AS ENUM ('treatment', 'holdout');

-- CreateEnum
CREATE TYPE "LiftPeriod" AS ENUM ('pre', 'post');

-- CreateEnum
CREATE TYPE "LiftVerdict" AS ENUM ('too_early', 'clearly_helping', 'maybe_helping', 'no_clear_effect', 'invalidated');


-- AlterTable
ALTER TABLE "SearchTermMetric" ADD COLUMN "qualifiedConversions" DECIMAL(18,4);

-- CreateTable
CREATE TABLE "SearchWasteConfig" (
    "workspaceId" TEXT NOT NULL,
    "brandTerms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "otherLocations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchWasteConfig_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "NegativeProposal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "campaignId" TEXT,
    "adGroupId" TEXT,
    "scopeKey" TEXT NOT NULL DEFAULT '',
    "campaignName" TEXT NOT NULL DEFAULT '',
    "adGroupName" TEXT NOT NULL DEFAULT '',
    "term" TEXT NOT NULL,
    "matchType" "SearchMatchType" NOT NULL,
    "level" "NegativeLevel" NOT NULL,
    "wasteSpend" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "status" "NegativeProposalStatus" NOT NULL DEFAULT 'proposed',
    "safetyNote" TEXT NOT NULL DEFAULT '',
    "windowStart" DATE NOT NULL,
    "windowEnd" DATE NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "exportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NegativeProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pageId" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "searchTerms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastError" TEXT NOT NULL DEFAULT '',
    "lastFetchedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorAd" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'meta_ad_library',
    "pageName" TEXT NOT NULL DEFAULT '',
    "headline" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "snapshotUrl" TEXT NOT NULL DEFAULT '',
    "firstSeen" TIMESTAMP(3) NOT NULL,
    "lastSeen" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "creative" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorAd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorIdea" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "competitorAdId" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorIdea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiftTest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "designKind" "LiftDesignKind" NOT NULL,
    "metric" "LiftMetric" NOT NULL,
    "holdoutPercent" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "preStartDate" DATE,
    "minSample" INTEGER NOT NULL,
    "status" "LiftTestStatus" NOT NULL DEFAULT 'draft',
    "invalidatedReason" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "startedById" TEXT,
    "startedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiftTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiftAssignment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "unitKey" TEXT NOT NULL,
    "role" "LiftCellRole" NOT NULL,

    CONSTRAINT "LiftAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiftObservation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "unitKey" TEXT NOT NULL,
    "period" "LiftPeriod" NOT NULL,
    "outcome" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "spend" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiftObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiftResult" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ready" BOOLEAN NOT NULL,
    "verdict" "LiftVerdict" NOT NULL,
    "method" TEXT NOT NULL DEFAULT '',
    "extraLeads" DECIMAL(18,4),
    "rangeLow" DECIMAL(18,4),
    "rangeHigh" DECIMAL(18,4),
    "confidence" DECIMAL(8,4),
    "extraLeadCost" DECIMAL(18,4),
    "sentence" TEXT NOT NULL,
    "treatmentOutcome" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "holdoutOutcome" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "LiftResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex
CREATE INDEX "NegativeProposal_workspaceId_status_idx" ON "NegativeProposal"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "NegativeProposal_adAccountId_idx" ON "NegativeProposal"("adAccountId");

-- CreateIndex
CREATE INDEX "NegativeProposal_campaignId_idx" ON "NegativeProposal"("campaignId");

-- CreateIndex
CREATE INDEX "NegativeProposal_adGroupId_idx" ON "NegativeProposal"("adGroupId");

-- CreateIndex
CREATE INDEX "NegativeProposal_decidedById_idx" ON "NegativeProposal"("decidedById");

-- CreateIndex
CREATE UNIQUE INDEX "negative_proposal_window" ON "NegativeProposal"("workspaceId", "adAccountId", "scopeKey", "term", "matchType", "windowStart");

-- CreateIndex
CREATE INDEX "Competitor_workspaceId_idx" ON "Competitor"("workspaceId");

-- CreateIndex
CREATE INDEX "Competitor_createdById_idx" ON "Competitor"("createdById");

-- CreateIndex
CREATE INDEX "CompetitorAd_workspaceId_competitorId_idx" ON "CompetitorAd"("workspaceId", "competitorId");

-- CreateIndex
CREATE INDEX "CompetitorAd_competitorId_idx" ON "CompetitorAd"("competitorId");

-- CreateIndex
CREATE UNIQUE INDEX "competitor_ad_external" ON "CompetitorAd"("workspaceId", "competitorId", "externalId");

-- CreateIndex
CREATE INDEX "CompetitorIdea_workspaceId_idx" ON "CompetitorIdea"("workspaceId");

-- CreateIndex
CREATE INDEX "CompetitorIdea_competitorAdId_idx" ON "CompetitorIdea"("competitorAdId");

-- CreateIndex
CREATE INDEX "CompetitorIdea_createdById_idx" ON "CompetitorIdea"("createdById");

-- CreateIndex
CREATE INDEX "LiftTest_workspaceId_status_idx" ON "LiftTest"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "LiftTest_adAccountId_idx" ON "LiftTest"("adAccountId");

-- CreateIndex
CREATE INDEX "LiftTest_campaignId_idx" ON "LiftTest"("campaignId");

-- CreateIndex
CREATE INDEX "LiftTest_createdById_idx" ON "LiftTest"("createdById");

-- CreateIndex
CREATE INDEX "LiftTest_startedById_idx" ON "LiftTest"("startedById");

-- CreateIndex
CREATE INDEX "LiftAssignment_testId_idx" ON "LiftAssignment"("testId");

-- CreateIndex
CREATE UNIQUE INDEX "lift_assignment_unit" ON "LiftAssignment"("workspaceId", "testId", "unitKey");

-- CreateIndex
CREATE INDEX "LiftObservation_testId_idx" ON "LiftObservation"("testId");

-- CreateIndex
CREATE UNIQUE INDEX "lift_observation_unit" ON "LiftObservation"("workspaceId", "testId", "unitKey", "period");

-- CreateIndex
CREATE INDEX "LiftResult_workspaceId_testId_computedAt_idx" ON "LiftResult"("workspaceId", "testId", "computedAt");

-- CreateIndex
CREATE INDEX "LiftResult_testId_idx" ON "LiftResult"("testId");

-- AddForeignKey

-- AddForeignKey

-- AddForeignKey

-- AddForeignKey
ALTER TABLE "NegativeProposal" ADD CONSTRAINT "NegativeProposal_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegativeProposal" ADD CONSTRAINT "NegativeProposal_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegativeProposal" ADD CONSTRAINT "NegativeProposal_adGroupId_fkey" FOREIGN KEY ("adGroupId") REFERENCES "AdGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegativeProposal" ADD CONSTRAINT "NegativeProposal_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competitor" ADD CONSTRAINT "Competitor_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorAd" ADD CONSTRAINT "CompetitorAd_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorIdea" ADD CONSTRAINT "CompetitorIdea_competitorAdId_fkey" FOREIGN KEY ("competitorAdId") REFERENCES "CompetitorAd"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorIdea" ADD CONSTRAINT "CompetitorIdea_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiftTest" ADD CONSTRAINT "LiftTest_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiftTest" ADD CONSTRAINT "LiftTest_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiftTest" ADD CONSTRAINT "LiftTest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiftTest" ADD CONSTRAINT "LiftTest_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiftAssignment" ADD CONSTRAINT "LiftAssignment_testId_fkey" FOREIGN KEY ("testId") REFERENCES "LiftTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiftObservation" ADD CONSTRAINT "LiftObservation_testId_fkey" FOREIGN KEY ("testId") REFERENCES "LiftTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiftResult" ADD CONSTRAINT "LiftResult_testId_fkey" FOREIGN KEY ("testId") REFERENCES "LiftTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

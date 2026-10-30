-- Read-only pacing snapshots. recommendationOnly is forced on so this table cannot record a budget write.

ALTER TYPE "RecommendationType" ADD VALUE 'pacing';

CREATE TABLE "PacingSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "campaignId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "dayOfPeriod" INTEGER NOT NULL,
    "daysInPeriod" INTEGER NOT NULL,
    "budgetAmount" DECIMAL(18,4) NOT NULL,
    "budgetPeriod" "BudgetType" NOT NULL,
    "currency" TEXT NOT NULL,
    "spendToDate" DECIMAL(18,4) NOT NULL,
    "expectedSpend" DECIMAL(18,4) NOT NULL,
    "projectedSpend" DECIMAL(18,4) NOT NULL,
    "paceRatio" DECIMAL(18,4) NOT NULL,
    "marginalCpa" DECIMAL(18,4),
    "costPerQualifiedLead" DECIMAL(18,4),
    "qualifiedLeadBasis" TEXT NOT NULL DEFAULT 'platform_leads',
    "status" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "recommendationOnly" BOOLEAN NOT NULL DEFAULT true,
    "dedupeKey" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PacingSnapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PacingSnapshot_recommendationOnly_check" CHECK ("recommendationOnly" = true)
);

CREATE INDEX "PacingSnapshot_campaignId_detectedAt_idx" ON "PacingSnapshot"("campaignId", "detectedAt");
CREATE INDEX "PacingSnapshot_dedupeKey_detectedAt_idx" ON "PacingSnapshot"("dedupeKey", "detectedAt");
CREATE INDEX "PacingSnapshot_adAccountId_idx" ON "PacingSnapshot"("adAccountId");

ALTER TABLE "PacingSnapshot" ADD CONSTRAINT "PacingSnapshot_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PacingSnapshot" ADD CONSTRAINT "PacingSnapshot_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

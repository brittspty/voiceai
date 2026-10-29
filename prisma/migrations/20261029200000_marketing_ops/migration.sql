-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'super_admin';
ALTER TYPE "Role" ADD VALUE 'account_manager';
ALTER TYPE "Role" ADD VALUE 'client_viewer';

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('info', 'warning', 'critical');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('draft', 'verified', 'dismissed', 'accepted', 'declined');

-- CreateEnum
CREATE TYPE "RecommendationType" AS ENUM ('performance', 'traffic', 'roi', 'budget_change');

-- CreateEnum
CREATE TYPE "MarketingScopeKind" AS ENUM ('client', 'ad_account', 'campaign');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "budgetCurrency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "Campaign" ADD COLUMN "budgetSetById" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "budgetSetAt" TIMESTAMP(3);
ALTER TABLE "Campaign" ADD COLUMN "reportedBudgetType" "BudgetType" NOT NULL DEFAULT 'none';
ALTER TABLE "Campaign" ADD COLUMN "reportedBudgetAmount" DECIMAL(18,4);

-- Platform-reported numbers move off the human budget columns.
UPDATE "Campaign"
SET "reportedBudgetType" = "budgetType",
    "reportedBudgetAmount" = "budgetAmount",
    "budgetType" = 'none',
    "budgetAmount" = NULL;

-- CreateTable
CREATE TABLE "CampaignBudgetAudit" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "period" "BudgetType" NOT NULL,
    "currency" TEXT NOT NULL,
    "setById" TEXT NOT NULL,
    "setAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "recommendationId" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "CampaignBudgetAudit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "scopeKind" "MarketingScopeKind" NOT NULL,
    "adAccountId" TEXT,
    "campaignId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketingAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientViewerAccess" (
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientViewerAccess_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "ClientShareLink" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientShareLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientViewAudit" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "viewerUserId" TEXT,
    "shareLinkId" TEXT,
    "page" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientViewAudit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdAlert" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "adId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "observed" TEXT NOT NULL,
    "baseline" TEXT NOT NULL,
    "windowStart" DATE,
    "windowEnd" DATE,
    "sampleSize" INTEGER NOT NULL,
    "evidence" JSONB NOT NULL,
    "sourceMetricIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "syncRunId" TEXT,
    "dataLandedAt" TIMESTAMP(3) NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdAlert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "type" "RecommendationType" NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'draft',
    "adId" TEXT,
    "campaignId" TEXT,
    "adAccountId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "baseline" TEXT NOT NULL,
    "observed" TEXT NOT NULL,
    "windowStart" DATE,
    "windowEnd" DATE,
    "sampleSize" INTEGER NOT NULL,
    "sourceMetricIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "evidence" JSONB NOT NULL,
    "currentBudgetAmount" DECIMAL(18,4),
    "currentBudgetPeriod" "BudgetType",
    "proposedBudgetAmount" DECIMAL(18,4),
    "proposedBudgetPeriod" "BudgetType",
    "proposedCurrency" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifierNote" TEXT NOT NULL DEFAULT '',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManagerDigest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "delivery" TEXT NOT NULL DEFAULT 'not_sent',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ManagerDigest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdHourlyMetric" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "adId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "hour" INTEGER NOT NULL,
    "impressions" BIGINT NOT NULL DEFAULT 0,
    "clicks" BIGINT NOT NULL DEFAULT 0,
    "conversions" DECIMAL(18,4) NOT NULL DEFAULT 0,
    CONSTRAINT "AdHourlyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignBudgetAudit_campaignId_setAt_idx" ON "CampaignBudgetAudit"("campaignId", "setAt");
CREATE INDEX "MarketingAssignment_userId_idx" ON "MarketingAssignment"("userId");
CREATE INDEX "MarketingAssignment_adAccountId_idx" ON "MarketingAssignment"("adAccountId");
CREATE INDEX "MarketingAssignment_campaignId_idx" ON "MarketingAssignment"("campaignId");
CREATE UNIQUE INDEX "ClientShareLink_tokenHash_key" ON "ClientShareLink"("tokenHash");
CREATE INDEX "ClientShareLink_workspaceId_idx" ON "ClientShareLink"("workspaceId");
CREATE INDEX "ClientViewAudit_workspaceId_viewedAt_idx" ON "ClientViewAudit"("workspaceId", "viewedAt");
CREATE INDEX "ClientViewAudit_shareLinkId_idx" ON "ClientViewAudit"("shareLinkId");
CREATE INDEX "AdAlert_adAccountId_createdAt_idx" ON "AdAlert"("adAccountId", "createdAt");
CREATE INDEX "AdAlert_campaignId_idx" ON "AdAlert"("campaignId");
CREATE INDEX "AdAlert_detectedAt_idx" ON "AdAlert"("detectedAt");
CREATE INDEX "Recommendation_status_createdAt_idx" ON "Recommendation"("status", "createdAt");
CREATE INDEX "Recommendation_adAccountId_idx" ON "Recommendation"("adAccountId");
CREATE INDEX "Recommendation_campaignId_idx" ON "Recommendation"("campaignId");
CREATE INDEX "ManagerDigest_userId_createdAt_idx" ON "ManagerDigest"("userId", "createdAt");
CREATE UNIQUE INDEX "AdHourlyMetric_adId_date_hour_key" ON "AdHourlyMetric"("adId", "date", "hour");
CREATE INDEX "AdHourlyMetric_date_idx" ON "AdHourlyMetric"("date");
CREATE INDEX "Campaign_budgetSetById_idx" ON "Campaign"("budgetSetById");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_budgetSetById_fkey" FOREIGN KEY ("budgetSetById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CampaignBudgetAudit" ADD CONSTRAINT "CampaignBudgetAudit_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignBudgetAudit" ADD CONSTRAINT "CampaignBudgetAudit_setById_fkey" FOREIGN KEY ("setById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingAssignment" ADD CONSTRAINT "MarketingAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingAssignment" ADD CONSTRAINT "MarketingAssignment_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientViewerAccess" ADD CONSTRAINT "ClientViewerAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientShareLink" ADD CONSTRAINT "ClientShareLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientViewAudit" ADD CONSTRAINT "ClientViewAudit_viewerUserId_fkey" FOREIGN KEY ("viewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClientViewAudit" ADD CONSTRAINT "ClientViewAudit_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "ClientShareLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdAlert" ADD CONSTRAINT "AdAlert_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdAlert" ADD CONSTRAINT "AdAlert_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdAlert" ADD CONSTRAINT "AdAlert_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ManagerDigest" ADD CONSTRAINT "ManagerDigest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdHourlyMetric" ADD CONSTRAINT "AdHourlyMetric_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

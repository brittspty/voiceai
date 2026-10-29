-- CreateEnum
CREATE TYPE "AdPlatform" AS ENUM ('meta', 'google_ads', 'tiktok', 'linkedin');

-- CreateEnum
CREATE TYPE "MarketingAuthType" AS ENUM ('oauth', 'system_user', 'private_token', 'internal');

-- CreateEnum
CREATE TYPE "MarketingConnectionStatus" AS ENUM ('connected', 'expired', 'error', 'disconnected', 'unconfigured');

-- CreateEnum
CREATE TYPE "MarketingEntityStatus" AS ENUM ('active', 'paused', 'archived', 'deleted', 'unknown');

-- CreateEnum
CREATE TYPE "CampaignObjective" AS ENUM ('leads', 'traffic', 'conversions', 'awareness', 'calls', 'other');

-- CreateEnum
CREATE TYPE "BudgetType" AS ENUM ('daily', 'lifetime', 'none');

-- CreateEnum
CREATE TYPE "CreativeFormat" AS ENUM ('image', 'video', 'carousel', 'text', 'lead_form', 'unknown');

-- CreateEnum
CREATE TYPE "AudienceType" AS ENUM ('custom_list', 'lookalike', 'interest', 'keyword', 'retargeting', 'broad', 'verified_human', 'unknown');

-- CreateEnum
CREATE TYPE "AudienceSegmentKind" AS ENUM ('targeting', 'breakdown');

-- CreateEnum
CREATE TYPE "AudienceLinkRole" AS ENUM ('include', 'exclude');

-- CreateEnum
CREATE TYPE "MarketingSyncKind" AS ENUM ('structure', 'insights', 'full');

-- CreateEnum
CREATE TYPE "MarketingSyncStatus" AS ENUM ('running', 'succeeded', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "MarketingSyncMode" AS ENUM ('mock', 'live');

-- CreateTable
CREATE TABLE "PlatformConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "platform" "AdPlatform" NOT NULL,
    "authType" "MarketingAuthType" NOT NULL,
    "secretRef" TEXT NOT NULL,
    "appExternalId" TEXT NOT NULL DEFAULT '',
    "status" "MarketingConnectionStatus" NOT NULL DEFAULT 'unconfigured',
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "connectionId" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "status" "MarketingEntityStatus" NOT NULL DEFAULT 'unknown',
    "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "adAccountId" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" "CampaignObjective" NOT NULL DEFAULT 'other',
    "objectiveRaw" TEXT NOT NULL DEFAULT '',
    "status" "MarketingEntityStatus" NOT NULL DEFAULT 'unknown',
    "statusRaw" TEXT NOT NULL DEFAULT '',
    "budgetType" "BudgetType" NOT NULL DEFAULT 'none',
    "budgetAmount" DECIMAL(18,4),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "namingParsed" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdGroup" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "campaignId" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "MarketingEntityStatus" NOT NULL DEFAULT 'unknown',
    "statusRaw" TEXT NOT NULL DEFAULT '',
    "optimizationGoal" TEXT NOT NULL DEFAULT '',
    "bidStrategy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Creative" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "name" TEXT NOT NULL,
    "conceptKey" TEXT NOT NULL,
    "conceptTag" TEXT NOT NULL DEFAULT '',
    "format" "CreativeFormat" NOT NULL DEFAULT 'unknown',
    "angle" TEXT NOT NULL DEFAULT '',
    "offer" TEXT NOT NULL DEFAULT '',
    "hook" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Creative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeVersion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "creativeId" TEXT NOT NULL,
    "versionLabel" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "headline" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "cta" TEXT NOT NULL DEFAULT '',
    "mediaRef" TEXT NOT NULL DEFAULT '',
    "landingUrl" TEXT NOT NULL DEFAULT '',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "platformCreativeIds" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreativeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ad" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "adGroupId" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "MarketingEntityStatus" NOT NULL DEFAULT 'unknown',
    "statusRaw" TEXT NOT NULL DEFAULT '',
    "creativeVersionId" TEXT,
    "destinationUrl" TEXT NOT NULL DEFAULT '',
    "urlTags" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Audience" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "adAccountId" TEXT,
    "platform" "AdPlatform" NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AudienceType" NOT NULL DEFAULT 'unknown',
    "sourceDescription" TEXT NOT NULL DEFAULT '',
    "sizeEstimate" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Audience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdGroupAudience" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "adGroupId" TEXT NOT NULL,
    "audienceId" TEXT NOT NULL,
    "role" "AudienceLinkRole" NOT NULL,

    CONSTRAINT "AdGroupAudience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudienceSegment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "segmentKey" TEXT NOT NULL,
    "kind" "AudienceSegmentKind" NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudienceSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingSyncRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "connectionId" TEXT,
    "platform" "AdPlatform" NOT NULL,
    "kind" "MarketingSyncKind" NOT NULL,
    "status" "MarketingSyncStatus" NOT NULL,
    "mode" "MarketingSyncMode" NOT NULL,
    "windowStart" DATE,
    "windowEnd" DATE,
    "requestedAccounts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rowsRead" INTEGER NOT NULL DEFAULT 0,
    "rowsWritten" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "MarketingSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyMetric" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "date" DATE NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "campaignId" TEXT,
    "adGroupId" TEXT,
    "adId" TEXT NOT NULL,
    "creativeVersionId" TEXT,
    "audienceSegmentId" TEXT NOT NULL,
    "attributionWindow" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "spend" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "impressions" BIGINT NOT NULL DEFAULT 0,
    "clicks" BIGINT NOT NULL DEFAULT 0,
    "linkClicks" BIGINT NOT NULL DEFAULT 0,
    "reach" BIGINT NOT NULL DEFAULT 0,
    "platformLeads" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "platformConversions" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "conversionValue" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "videoViews3s" BIGINT,
    "thruplays" BIGINT,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourcePullId" TEXT,

    CONSTRAINT "DailyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingRawRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "platform" "AdPlatform" NOT NULL,
    "objectType" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncRunId" TEXT,

    CONSTRAINT "MarketingRawRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformConnection_workspaceId_idx" ON "PlatformConnection"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformConnection_workspaceId_platform_key" ON "PlatformConnection"("workspaceId", "platform");

-- CreateIndex
CREATE INDEX "AdAccount_connectionId_idx" ON "AdAccount"("connectionId");

-- CreateIndex
CREATE INDEX "AdAccount_workspaceId_platform_syncEnabled_idx" ON "AdAccount"("workspaceId", "platform", "syncEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "AdAccount_workspaceId_platform_externalId_key" ON "AdAccount"("workspaceId", "platform", "externalId");

-- CreateIndex
CREATE INDEX "Campaign_adAccountId_idx" ON "Campaign"("adAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_workspaceId_platform_externalId_key" ON "Campaign"("workspaceId", "platform", "externalId");

-- CreateIndex
CREATE INDEX "AdGroup_campaignId_idx" ON "AdGroup"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "AdGroup_workspaceId_platform_externalId_key" ON "AdGroup"("workspaceId", "platform", "externalId");

-- CreateIndex
CREATE INDEX "Creative_workspaceId_idx" ON "Creative"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Creative_workspaceId_conceptKey_key" ON "Creative"("workspaceId", "conceptKey");

-- CreateIndex
CREATE INDEX "CreativeVersion_creativeId_idx" ON "CreativeVersion"("creativeId");

-- CreateIndex
CREATE UNIQUE INDEX "CreativeVersion_workspaceId_fingerprint_key" ON "CreativeVersion"("workspaceId", "fingerprint");

-- CreateIndex
CREATE INDEX "Ad_adGroupId_idx" ON "Ad"("adGroupId");

-- CreateIndex
CREATE INDEX "Ad_creativeVersionId_idx" ON "Ad"("creativeVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "Ad_workspaceId_platform_externalId_key" ON "Ad"("workspaceId", "platform", "externalId");

-- CreateIndex
CREATE INDEX "Audience_adAccountId_idx" ON "Audience"("adAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Audience_workspaceId_platform_externalId_key" ON "Audience"("workspaceId", "platform", "externalId");

-- CreateIndex
CREATE INDEX "AdGroupAudience_audienceId_idx" ON "AdGroupAudience"("audienceId");

-- CreateIndex
CREATE UNIQUE INDEX "AdGroupAudience_adGroupId_audienceId_role_key" ON "AdGroupAudience"("adGroupId", "audienceId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "AudienceSegment_workspaceId_kind_segmentKey_key" ON "AudienceSegment"("workspaceId", "kind", "segmentKey");

-- CreateIndex
CREATE INDEX "MarketingSyncRun_platform_startedAt_idx" ON "MarketingSyncRun"("platform", "startedAt");

-- CreateIndex
CREATE INDEX "MarketingSyncRun_connectionId_idx" ON "MarketingSyncRun"("connectionId");

-- CreateIndex
CREATE INDEX "DailyMetric_date_idx" ON "DailyMetric"("date");

-- CreateIndex
CREATE INDEX "DailyMetric_campaignId_idx" ON "DailyMetric"("campaignId");

-- CreateIndex
CREATE INDEX "DailyMetric_sourcePullId_idx" ON "DailyMetric"("sourcePullId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyMetric_workspaceId_date_platform_adId_audienceSegmentI_key" ON "DailyMetric"("workspaceId", "date", "platform", "adId", "audienceSegmentId", "attributionWindow");

-- CreateIndex
CREATE INDEX "MarketingRawRecord_syncRunId_idx" ON "MarketingRawRecord"("syncRunId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingRawRecord_workspaceId_platform_objectType_external_key" ON "MarketingRawRecord"("workspaceId", "platform", "objectType", "externalId");

-- AddForeignKey
ALTER TABLE "AdAccount" ADD CONSTRAINT "AdAccount_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "PlatformConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdGroup" ADD CONSTRAINT "AdGroup_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeVersion" ADD CONSTRAINT "CreativeVersion_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "Creative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_adGroupId_fkey" FOREIGN KEY ("adGroupId") REFERENCES "AdGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_creativeVersionId_fkey" FOREIGN KEY ("creativeVersionId") REFERENCES "CreativeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audience" ADD CONSTRAINT "Audience_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdGroupAudience" ADD CONSTRAINT "AdGroupAudience_adGroupId_fkey" FOREIGN KEY ("adGroupId") REFERENCES "AdGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdGroupAudience" ADD CONSTRAINT "AdGroupAudience_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "Audience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingSyncRun" ADD CONSTRAINT "MarketingSyncRun_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "PlatformConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyMetric" ADD CONSTRAINT "DailyMetric_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyMetric" ADD CONSTRAINT "DailyMetric_adGroupId_fkey" FOREIGN KEY ("adGroupId") REFERENCES "AdGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyMetric" ADD CONSTRAINT "DailyMetric_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyMetric" ADD CONSTRAINT "DailyMetric_creativeVersionId_fkey" FOREIGN KEY ("creativeVersionId") REFERENCES "CreativeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyMetric" ADD CONSTRAINT "DailyMetric_audienceSegmentId_fkey" FOREIGN KEY ("audienceSegmentId") REFERENCES "AudienceSegment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyMetric" ADD CONSTRAINT "DailyMetric_sourcePullId_fkey" FOREIGN KEY ("sourcePullId") REFERENCES "MarketingSyncRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

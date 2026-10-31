-- Channel-agnostic daily facts for sources that do not already have a table.
-- Meta and Google Ads stay in DailyMetric. Search terms stay in SearchTermMetric.

CREATE TYPE "ChannelDailyKind" AS ENUM ('stackadapt', 'google_business_profile', 'landing_page', 'lead', 'ais2l');

CREATE TABLE "ChannelDailyMetric" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "clientKey" TEXT NOT NULL DEFAULT '',
    "date" DATE NOT NULL,
    "channel" "ChannelDailyKind" NOT NULL,
    "entityKey" TEXT NOT NULL DEFAULT '',
    "entityName" TEXT NOT NULL DEFAULT '',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "impressions" BIGINT,
    "clicks" BIGINT,
    "reach" BIGINT,
    "spend" DECIMAL(18,4),
    "leads" DECIMAL(18,4),
    "qualifiedLeads" DECIMAL(18,4),
    "booked" DECIMAL(18,4),
    "conversions" DECIMAL(18,4),
    "conversionValue" DECIMAL(18,4),
    "profileViews" INTEGER,
    "searches" INTEGER,
    "calls" INTEGER,
    "directionRequests" INTEGER,
    "websiteClicks" INTEGER,
    "reviewCount" INTEGER,
    "rating" DECIMAL(4,2),
    "failedChecks" INTEGER,
    "uptimeRate" DECIMAL(8,4),
    "medianSpeedSec" INTEGER,
    "voiceCalls" INTEGER,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelDailyMetric_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChannelDailyMetric_identity_key" ON "ChannelDailyMetric"("workspaceId", "date", "channel", "entityKey");
CREATE INDEX "ChannelDailyMetric_workspaceId_clientKey_date_idx" ON "ChannelDailyMetric"("workspaceId", "clientKey", "date");

CREATE TABLE "ClientMetricPolicy" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "clientKey" TEXT NOT NULL,
    "clickCreditDays" INTEGER NOT NULL DEFAULT 7,
    "viewCreditDays" INTEGER NOT NULL DEFAULT 1,
    "learnedClickDays" INTEGER,
    "learnedViewDays" INTEGER,
    "creativeApprovalsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "thresholds" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientMetricPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientMetricPolicy_workspaceId_clientKey_key" ON "ClientMetricPolicy"("workspaceId", "clientKey");
CREATE INDEX "ClientMetricPolicy_workspaceId_idx" ON "ClientMetricPolicy"("workspaceId");

CREATE TYPE "InboxDecisionKind" AS ENUM ('budget_recommendation', 'pacing_recommendation', 'fatigue_pause', 'fatigue_rotation', 'creative_approval', 'lead_check', 'page_alert', 'negative_keyword', 'holdout', 'learning');
CREATE TYPE "InboxDecisionStatus" AS ENUM ('waiting', 'accepted', 'declined', 'later', 'done');
CREATE TYPE "ServeRecommendation" AS ENUM ('serve', 'pause', 'rotate');

CREATE TABLE "InboxDecision" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "clientKey" TEXT NOT NULL DEFAULT '',
    "clientName" TEXT NOT NULL DEFAULT '',
    "campaignId" TEXT,
    "adAccountId" TEXT,
    "assigneeId" TEXT,
    "kind" "InboxDecisionKind" NOT NULL,
    "status" "InboxDecisionStatus" NOT NULL DEFAULT 'waiting',
    "tier" TEXT NOT NULL DEFAULT 'staff',
    "title" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "serve" "ServeRecommendation",
    "creditWindowLabel" TEXT NOT NULL DEFAULT '',
    "automatic" BOOLEAN NOT NULL DEFAULT false,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboxDecision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InboxDecision_not_automatic" CHECK ("automatic" = false)
);

CREATE INDEX "InboxDecision_workspaceId_status_createdAt_idx" ON "InboxDecision"("workspaceId", "status", "createdAt");
CREATE INDEX "InboxDecision_assigneeId_status_idx" ON "InboxDecision"("assigneeId", "status");
CREATE INDEX "InboxDecision_campaignId_idx" ON "InboxDecision"("campaignId");
CREATE INDEX "InboxDecision_decidedById_idx" ON "InboxDecision"("decidedById");

ALTER TABLE "InboxDecision" ADD CONSTRAINT "InboxDecision_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InboxDecision" ADD CONSTRAINT "InboxDecision_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Read-only Google Analytics 4 daily traffic. Does not write to Google.
-- googleAnalyticsConnectionName empty uses the primary ads@ refresh token.

ALTER TYPE "RecommendationType" ADD VALUE IF NOT EXISTS 'ga_spend_without_traffic';
ALTER TYPE "RecommendationType" ADD VALUE IF NOT EXISTS 'ga_traffic_no_conversions';
ALTER TYPE "RecommendationType" ADD VALUE IF NOT EXISTS 'ga_landing_drop';

ALTER TABLE "MarketingClient" ADD COLUMN "googleAnalyticsConnectionName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MarketingClient" ADD COLUMN "googleAnalyticsPropertyId" TEXT NOT NULL DEFAULT '';

CREATE TABLE "GoogleAnalyticsDaily" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "clientId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "connectionName" TEXT NOT NULL DEFAULT '',
    "date" DATE NOT NULL,
    "dimensionKey" VARCHAR(40) NOT NULL,
    "sessionCampaignName" VARCHAR(500) NOT NULL DEFAULT '',
    "sessionSource" VARCHAR(200) NOT NULL DEFAULT '',
    "sessionMedium" VARCHAR(200) NOT NULL DEFAULT '',
    "landingPage" VARCHAR(1000) NOT NULL DEFAULT '',
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "engagedSessions" INTEGER NOT NULL DEFAULT 0,
    "conversions" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "campaignId" TEXT,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleAnalyticsDaily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GoogleAnalyticsDaily_identity_key" ON "GoogleAnalyticsDaily"("workspaceId", "clientId", "propertyId", "date", "dimensionKey");
CREATE INDEX "GoogleAnalyticsDaily_workspaceId_clientId_date_idx" ON "GoogleAnalyticsDaily"("workspaceId", "clientId", "date");
CREATE INDEX "GoogleAnalyticsDaily_campaignId_idx" ON "GoogleAnalyticsDaily"("campaignId");

ALTER TABLE "GoogleAnalyticsDaily" ADD CONSTRAINT "GoogleAnalyticsDaily_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "MarketingClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoogleAnalyticsDaily" ADD CONSTRAINT "GoogleAnalyticsDaily_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

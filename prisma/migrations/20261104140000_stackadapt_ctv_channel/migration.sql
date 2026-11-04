-- Connected TV delivery from StackAdapt. Safe to re-run.
-- Prod may be missing the event tables. Create them when they are absent.
-- Campaign.channelType selects CTV. Cost stays on the delivery row for staff.

CREATE TABLE IF NOT EXISTS "CtvExposure" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'stackadapt',
    "campaignId" TEXT NOT NULL DEFAULT '',
    "campaignName" TEXT NOT NULL DEFAULT '',
    "lineItemId" TEXT NOT NULL DEFAULT '',
    "lineItemName" TEXT NOT NULL DEFAULT '',
    "creativeId" TEXT NOT NULL DEFAULT '',
    "creativeName" TEXT NOT NULL DEFAULT '',
    "audienceId" TEXT NOT NULL DEFAULT '',
    "maidListId" TEXT NOT NULL DEFAULT '',
    "vendorId" TEXT NOT NULL DEFAULT '',
    "subSegmentKey" TEXT NOT NULL DEFAULT '',
    "householdId" TEXT NOT NULL DEFAULT '',
    "ipHash" TEXT NOT NULL DEFAULT '',
    "deviceType" TEXT NOT NULL DEFAULT '',
    "publisher" TEXT NOT NULL DEFAULT '',
    "appBundle" TEXT NOT NULL DEFAULT '',
    "completionPct" INTEGER NOT NULL DEFAULT 0,
    "interaction" TEXT NOT NULL DEFAULT 'view',
    "maid" TEXT NOT NULL DEFAULT '',
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "excludeReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CtvExposure_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CtvConversion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "conversionId" TEXT NOT NULL,
    "pixelEvent" TEXT NOT NULL DEFAULT '',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "value" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "verificationStatus" TEXT NOT NULL,
    "crmOutcome" TEXT NOT NULL DEFAULT '',
    "maidListId" TEXT NOT NULL DEFAULT '',
    "vendorId" TEXT NOT NULL DEFAULT '',
    "subSegmentKey" TEXT NOT NULL DEFAULT '',
    "audienceId" TEXT NOT NULL DEFAULT '',
    "householdId" TEXT NOT NULL DEFAULT '',
    "ipHash" TEXT NOT NULL DEFAULT '',
    "deviceType" TEXT NOT NULL DEFAULT '',
    "maid" TEXT NOT NULL DEFAULT '',
    "cookie" TEXT NOT NULL DEFAULT '',
    "passesDedupe" BOOLEAN NOT NULL DEFAULT false,
    "leadInvolved" BOOLEAN NOT NULL DEFAULT false,
    "contactValid" BOOLEAN,
    "crmOrPixelEngaged" BOOLEAN NOT NULL DEFAULT false,
    "siteVisit" BOOLEAN NOT NULL DEFAULT false,
    "creditedChannel" TEXT NOT NULL DEFAULT 'stackadapt',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CtvConversion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CtvPlatformLift" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'stackadapt',
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "maidListId" TEXT NOT NULL DEFAULT '',
    "vendorId" TEXT NOT NULL DEFAULT '',
    "subSegmentKey" TEXT NOT NULL DEFAULT '',
    "exposedCvr" DOUBLE PRECISION,
    "controlCvr" DOUBLE PRECISION,
    "exposedTrials" INTEGER NOT NULL DEFAULT 0,
    "controlTrials" INTEGER NOT NULL DEFAULT 0,
    "pulledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CtvPlatformLift_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CtvExposure_workspace_event_key" ON "CtvExposure"("workspaceId", "eventId");
CREATE INDEX IF NOT EXISTS "CtvExposure_workspaceId_occurredAt_idx" ON "CtvExposure"("workspaceId", "occurredAt");
CREATE INDEX IF NOT EXISTS "CtvExposure_workspaceId_maidListId_idx" ON "CtvExposure"("workspaceId", "maidListId");
CREATE INDEX IF NOT EXISTS "CtvExposure_workspaceId_householdId_idx" ON "CtvExposure"("workspaceId", "householdId");

CREATE UNIQUE INDEX IF NOT EXISTS "CtvConversion_workspace_conversion_key" ON "CtvConversion"("workspaceId", "conversionId");
CREATE INDEX IF NOT EXISTS "CtvConversion_workspaceId_occurredAt_idx" ON "CtvConversion"("workspaceId", "occurredAt");
CREATE INDEX IF NOT EXISTS "CtvConversion_workspaceId_maidListId_idx" ON "CtvConversion"("workspaceId", "maidListId");

CREATE INDEX IF NOT EXISTS "CtvPlatformLift_workspaceId_pulledAt_idx" ON "CtvPlatformLift"("workspaceId", "pulledAt");

ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "channelType" TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS "CtvDeliveryDay" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'stackadapt',
    "identityKey" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL DEFAULT '',
    "campaignName" TEXT NOT NULL DEFAULT '',
    "lineItemId" TEXT NOT NULL DEFAULT '',
    "lineItemName" TEXT NOT NULL DEFAULT '',
    "creativeId" TEXT NOT NULL DEFAULT '',
    "creativeName" TEXT NOT NULL DEFAULT '',
    "audienceId" TEXT NOT NULL DEFAULT '',
    "audienceName" TEXT NOT NULL DEFAULT '',
    "maidListId" TEXT NOT NULL DEFAULT '',
    "vendorId" TEXT NOT NULL DEFAULT '',
    "subSegmentKey" TEXT NOT NULL DEFAULT '',
    "deviceType" TEXT NOT NULL DEFAULT '',
    "publisher" TEXT NOT NULL DEFAULT '',
    "impressions" BIGINT NOT NULL DEFAULT 0,
    "uniqueImpressions" BIGINT NOT NULL DEFAULT 0,
    "frequency" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "completion25" BIGINT NOT NULL DEFAULT 0,
    "completion50" BIGINT NOT NULL DEFAULT 0,
    "completion75" BIGINT NOT NULL DEFAULT 0,
    "completion100" BIGINT NOT NULL DEFAULT 0,
    "spend" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "clickConversions" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "viewConversions" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "conversionValue" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "ipConversions" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "cookieConversions" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "siteVisits" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "exampleData" BOOLEAN NOT NULL DEFAULT false,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CtvDeliveryDay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CtvDeliveryDay_workspace_identity_key" ON "CtvDeliveryDay"("workspaceId", "identityKey");
CREATE INDEX IF NOT EXISTS "CtvDeliveryDay_workspaceId_date_idx" ON "CtvDeliveryDay"("workspaceId", "date");

ALTER TABLE "CtvDeliveryDay" ADD COLUMN IF NOT EXISTS "videoStarts" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "CtvDeliveryDay" ADD COLUMN IF NOT EXISTS "clientId" TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS "CtvDeliveryDay_workspaceId_clientId_date_idx" ON "CtvDeliveryDay"("workspaceId", "clientId", "date");

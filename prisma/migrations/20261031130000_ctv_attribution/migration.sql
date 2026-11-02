-- CTV attribution. Read-only tables. Holdout rows cannot be uploaded.
-- Segment reads cannot change spend or ads.

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

CREATE TABLE IF NOT EXISTS "CtvHousehold" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL DEFAULT '',
    "linkedMaids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "linkedCookies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "matchMethod" TEXT NOT NULL,
    "matchConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CtvHousehold_pkey" PRIMARY KEY ("id")
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

CREATE TABLE IF NOT EXISTS "CtvTouchpointLink" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "exposureEventId" TEXT NOT NULL,
    "conversionId" TEXT NOT NULL,
    "linkType" TEXT NOT NULL,
    "matchMethod" TEXT NOT NULL,
    "matchConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lagHours" DOUBLE PRECISION NOT NULL,
    "counted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CtvTouchpointLink_pkey" PRIMARY KEY ("id")
);

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

CREATE TABLE IF NOT EXISTS "CtvHoldoutDraft" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "maidListId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "percent" INTEGER NOT NULL DEFAULT 10,
    "uploaded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CtvHoldoutDraft_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CtvHoldoutDraft_dry_run" CHECK ("uploaded" = false)
);

CREATE TABLE IF NOT EXISTS "CtvSegmentRead" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'stackadapt',
    "maidListId" TEXT NOT NULL DEFAULT '',
    "vendorId" TEXT NOT NULL DEFAULT '',
    "subSegmentKey" TEXT NOT NULL DEFAULT '',
    "householdsReached" INTEGER NOT NULL DEFAULT 0,
    "deterministicMatchRate" DOUBLE PRECISION,
    "verifiedClickConversions" INTEGER NOT NULL DEFAULT 0,
    "verifiedViewConversions" INTEGER NOT NULL DEFAULT 0,
    "deterministicClick" INTEGER NOT NULL DEFAULT 0,
    "deterministicView" INTEGER NOT NULL DEFAULT 0,
    "lift" DOUBLE PRECISION,
    "liftCiLow" DOUBLE PRECISION,
    "liftCiHigh" DOUBLE PRECISION,
    "liftLabel" TEXT NOT NULL DEFAULT '',
    "spend" DECIMAL(18,4),
    "costPerIncremental" DECIMAL(18,4),
    "cpm" DECIMAL(18,4),
    "cpa" DECIMAL(18,4),
    "cpl" DECIMAL(18,4),
    "roas" DECIMAL(18,4),
    "recommendation" TEXT NOT NULL DEFAULT '',
    "recommendationOnly" BOOLEAN NOT NULL DEFAULT true,
    "changesSpend" BOOLEAN NOT NULL DEFAULT false,
    "writesAds" BOOLEAN NOT NULL DEFAULT false,
    "windowLabel" TEXT NOT NULL DEFAULT '',
    "nativeWindowLabel" TEXT NOT NULL DEFAULT '',
    "exampleData" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CtvSegmentRead_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CtvSegmentRead_recommend_only" CHECK ("changesSpend" = false AND "writesAds" = false AND "recommendationOnly" = true)
);

CREATE TABLE IF NOT EXISTS "CtvWindowSetting" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'stackadapt',
    "clickDays" INTEGER,
    "viewDays" INTEGER,
    "label" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '',
    "exampleData" BOOLEAN NOT NULL DEFAULT false,
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pulledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CtvWindowSetting_pkey" PRIMARY KEY ("id")
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

CREATE UNIQUE INDEX IF NOT EXISTS "CtvHousehold_workspace_household_key" ON "CtvHousehold"("workspaceId", "householdId");
CREATE INDEX IF NOT EXISTS "CtvHousehold_workspaceId_ipHash_idx" ON "CtvHousehold"("workspaceId", "ipHash");

CREATE UNIQUE INDEX IF NOT EXISTS "CtvConversion_workspace_conversion_key" ON "CtvConversion"("workspaceId", "conversionId");
CREATE INDEX IF NOT EXISTS "CtvConversion_workspaceId_occurredAt_idx" ON "CtvConversion"("workspaceId", "occurredAt");
CREATE INDEX IF NOT EXISTS "CtvConversion_workspaceId_maidListId_idx" ON "CtvConversion"("workspaceId", "maidListId");

CREATE UNIQUE INDEX IF NOT EXISTS "CtvTouchpointLink_workspace_link_key" ON "CtvTouchpointLink"("workspaceId", "exposureEventId", "conversionId", "linkType");
CREATE INDEX IF NOT EXISTS "CtvTouchpointLink_workspaceId_conversionId_idx" ON "CtvTouchpointLink"("workspaceId", "conversionId");

CREATE UNIQUE INDEX IF NOT EXISTS "CtvDeliveryDay_workspace_identity_key" ON "CtvDeliveryDay"("workspaceId", "identityKey");
CREATE INDEX IF NOT EXISTS "CtvDeliveryDay_workspaceId_date_idx" ON "CtvDeliveryDay"("workspaceId", "date");

CREATE UNIQUE INDEX IF NOT EXISTS "CtvHoldoutDraft_workspace_household_key" ON "CtvHoldoutDraft"("workspaceId", "maidListId", "householdId");
CREATE INDEX IF NOT EXISTS "CtvHoldoutDraft_workspaceId_maidListId_idx" ON "CtvHoldoutDraft"("workspaceId", "maidListId");

CREATE INDEX IF NOT EXISTS "CtvSegmentRead_workspaceId_readAt_idx" ON "CtvSegmentRead"("workspaceId", "readAt");
CREATE INDEX IF NOT EXISTS "CtvWindowSetting_workspaceId_pulledAt_idx" ON "CtvWindowSetting"("workspaceId", "pulledAt");
CREATE INDEX IF NOT EXISTS "CtvPlatformLift_workspaceId_pulledAt_idx" ON "CtvPlatformLift"("workspaceId", "pulledAt");

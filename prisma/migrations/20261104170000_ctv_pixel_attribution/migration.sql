-- StackAdapt CTV conversion attribution. Safe to re-run.
-- Campaign rows hold view-through and click-through counts.
-- Pixel rows hold the conversion pixel or event name.
-- Breakdown rows are best-effort and are not added into the totals.
-- Spend stays on the row for staff. Other surfaces strip it.

CREATE TABLE IF NOT EXISTS "CtvAttributionDay" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL DEFAULT '',
    "date" DATE NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'stackadapt',
    "identityKey" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL DEFAULT '',
    "campaignName" TEXT NOT NULL DEFAULT '',
    "grain" TEXT NOT NULL DEFAULT 'campaign',
    "pixelId" TEXT NOT NULL DEFAULT '',
    "pixelName" TEXT NOT NULL DEFAULT '',
    "breakdown" TEXT NOT NULL DEFAULT '',
    "breakdownName" TEXT NOT NULL DEFAULT '',
    "impressions" BIGINT NOT NULL DEFAULT 0,
    "clickConversions" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "viewConversions" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "ipConversions" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "cookieConversions" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "spend" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "exampleData" BOOLEAN NOT NULL DEFAULT false,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CtvAttributionDay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CtvAttributionDay_workspace_identity_key" ON "CtvAttributionDay"("workspaceId", "identityKey");
CREATE INDEX IF NOT EXISTS "CtvAttributionDay_workspaceId_clientId_date_idx" ON "CtvAttributionDay"("workspaceId", "clientId", "date");

CREATE TABLE IF NOT EXISTS "CtvAttributionMeta" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "ipSplitAvailable" BOOLEAN NOT NULL DEFAULT false,
    "pixelAvailable" BOOLEAN NOT NULL DEFAULT false,
    "pixelNote" TEXT NOT NULL DEFAULT '',
    "breakdownNote" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CtvAttributionMeta_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CtvAttributionMeta_workspace_client_key" ON "CtvAttributionMeta"("workspaceId", "clientId");

-- CTV breakdown rows are totals for the queried window. They have no day.
-- Each read replaces one client's rows. Spend stays here for staff.

CREATE TABLE IF NOT EXISTS "CtvAttributionBreakdown" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL DEFAULT '',
    "campaignId" TEXT NOT NULL DEFAULT '',
    "campaignName" TEXT NOT NULL DEFAULT '',
    "dimension" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "rangeStart" DATE NOT NULL,
    "rangeEnd" DATE NOT NULL,
    "impressions" BIGINT NOT NULL DEFAULT 0,
    "clickConversions" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "viewConversions" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "spend" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "exampleData" BOOLEAN NOT NULL DEFAULT false,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CtvAttributionBreakdown_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CtvAttributionBreakdown_workspaceId_clientId_dimension_idx" ON "CtvAttributionBreakdown"("workspaceId", "clientId", "dimension");

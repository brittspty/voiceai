-- Read-only Microsoft Clarity daily metrics. Does not write to Clarity.
-- Tokens stay in the environment. One project per client site.

ALTER TYPE "RecommendationType" ADD VALUE IF NOT EXISTS 'clarity_paid_frustration';
ALTER TYPE "RecommendationType" ADD VALUE IF NOT EXISTS 'clarity_low_scroll';
ALTER TYPE "RecommendationType" ADD VALUE IF NOT EXISTS 'clarity_quickback';

CREATE TABLE "ClarityClientScope" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "clientId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "connectionName" TEXT NOT NULL,
    "requestDay" DATE,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "syncedBreakdowns" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClarityClientScope_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClarityDaily" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "clientId" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "connectionName" TEXT NOT NULL DEFAULT '',
    "date" DATE NOT NULL,
    "breakdown" VARCHAR(40) NOT NULL,
    "dimensionKey" VARCHAR(40) NOT NULL,
    "url" VARCHAR(1000) NOT NULL DEFAULT '',
    "source" VARCHAR(200) NOT NULL DEFAULT '',
    "medium" VARCHAR(200) NOT NULL DEFAULT '',
    "campaignName" VARCHAR(500) NOT NULL DEFAULT '',
    "channel" VARCHAR(200) NOT NULL DEFAULT '',
    "device" VARCHAR(100) NOT NULL DEFAULT '',
    "browser" VARCHAR(100) NOT NULL DEFAULT '',
    "os" VARCHAR(100) NOT NULL DEFAULT '',
    "country" VARCHAR(100) NOT NULL DEFAULT '',
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "botSessions" INTEGER NOT NULL DEFAULT 0,
    "users" INTEGER NOT NULL DEFAULT 0,
    "pagesPerSession" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "engagementActive" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "engagementTotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "scrollDepth" DECIMAL(18,4),
    "popularPages" INTEGER NOT NULL DEFAULT 0,
    "deadClicks" INTEGER NOT NULL DEFAULT 0,
    "rageClicks" INTEGER NOT NULL DEFAULT 0,
    "quickbacks" INTEGER NOT NULL DEFAULT 0,
    "excessiveScroll" INTEGER NOT NULL DEFAULT 0,
    "scriptErrors" INTEGER NOT NULL DEFAULT 0,
    "errorClicks" INTEGER NOT NULL DEFAULT 0,
    "deadClickRate" DECIMAL(18,4),
    "rageClickRate" DECIMAL(18,4),
    "quickbackRate" DECIMAL(18,4),
    "raw" JSONB NOT NULL DEFAULT '{}',
    "campaignId" TEXT,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClarityDaily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClarityClientScope_clientId_key" ON "ClarityClientScope"("clientId");
CREATE UNIQUE INDEX "ClarityClientScope_workspaceId_projectId_key" ON "ClarityClientScope"("workspaceId", "projectId");
CREATE INDEX "ClarityClientScope_workspaceId_idx" ON "ClarityClientScope"("workspaceId");

CREATE UNIQUE INDEX "ClarityDaily_identity_key" ON "ClarityDaily"("workspaceId", "clientId", "projectId", "date", "breakdown", "dimensionKey");
CREATE INDEX "ClarityDaily_workspaceId_clientId_date_idx" ON "ClarityDaily"("workspaceId", "clientId", "date");
CREATE INDEX "ClarityDaily_campaignId_idx" ON "ClarityDaily"("campaignId");

ALTER TABLE "ClarityClientScope" ADD CONSTRAINT "ClarityClientScope_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "MarketingClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClarityDaily" ADD CONSTRAINT "ClarityDaily_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "MarketingClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClarityDaily" ADD CONSTRAINT "ClarityDaily_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "ClarityClientScope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClarityDaily" ADD CONSTRAINT "ClarityDaily_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Campaign-source people from Traxy and Apollo. Separate from speed-to-lead.
-- audienceId is a nullable hook. This migration does not upload an audience.

CREATE TYPE "MarketingProspectSource" AS ENUM ('traxy', 'apollo');

ALTER TABLE "MarketingClient" ADD COLUMN "traxyLiveRead" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MarketingClient" ADD COLUMN "traxyConnectionName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MarketingClient" ADD COLUMN "traxyMonitoredProfileIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "MarketingClient" ADD COLUMN "traxyLeadTiers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "MarketingClient" ADD COLUMN "traxyMinIcpMatchPercent" INTEGER;
ALTER TABLE "MarketingClient" ADD COLUMN "apolloLiveRead" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MarketingClient" ADD COLUMN "apolloConnectionName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MarketingClient" ADD COLUMN "apolloListIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "MarketingClient" ADD COLUMN "apolloSavedSearchIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "MarketingProspect" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "clientId" TEXT NOT NULL,
    "source" "MarketingProspectSource" NOT NULL,
    "externalId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '',
    "headline" TEXT NOT NULL DEFAULT '',
    "company" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "emails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "phones" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "profileUrl" TEXT NOT NULL DEFAULT '',
    "icpMatchPercent" INTEGER,
    "intentScore" DOUBLE PRECISION,
    "tier" TEXT NOT NULL DEFAULT '',
    "signal" TEXT NOT NULL DEFAULT '',
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "raw" JSONB NOT NULL DEFAULT '{}',
    "audienceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingProspect_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketingProspect_workspaceId_source_externalId_key" ON "MarketingProspect"("workspaceId", "source", "externalId");
CREATE INDEX "MarketingProspect_workspaceId_clientId_source_idx" ON "MarketingProspect"("workspaceId", "clientId", "source");
CREATE INDEX "MarketingProspect_workspaceId_lastSeenAt_idx" ON "MarketingProspect"("workspaceId", "lastSeenAt");
CREATE INDEX "MarketingProspect_audienceId_idx" ON "MarketingProspect"("audienceId");

ALTER TABLE "MarketingProspect" ADD CONSTRAINT "MarketingProspect_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "MarketingClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingProspect" ADD CONSTRAINT "MarketingProspect_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "MaidAudience"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Offline conversion feedback. Additive only: new columns and new tables.

ALTER TABLE "Contact" ADD COLUMN "fbclid" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contact" ADD COLUMN "fbc" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contact" ADD COLUMN "fbp" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contact" ADD COLUMN "gclid" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contact" ADD COLUMN "gbraid" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contact" ADD COLUMN "wbraid" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contact" ADD COLUMN "utmSource" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contact" ADD COLUMN "utmMedium" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contact" ADD COLUMN "utmCampaign" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contact" ADD COLUMN "utmTerm" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contact" ADD COLUMN "utmContent" TEXT NOT NULL DEFAULT '';

CREATE INDEX "Contact_gclid_idx" ON "Contact"("gclid");
CREATE INDEX "Contact_fbclid_idx" ON "Contact"("fbclid");

CREATE TYPE "ConversionStageKind" AS ENUM ('qualified', 'booked', 'sold');
CREATE TYPE "ConversionPlatform" AS ENUM ('meta', 'google_ads');
CREATE TYPE "ConversionUploadStatus" AS ENUM ('dry_run', 'sent', 'failed', 'skipped');
CREATE TYPE "ConversionDecisionStatus" AS ENUM ('pending', 'accepted', 'declined', 'later');

CREATE TABLE "ConversionClient" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "name" TEXT NOT NULL,
    "ghlLocationId" TEXT NOT NULL DEFAULT '',
    "enabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConversionClient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversionStageMap" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "ghlStageId" TEXT NOT NULL DEFAULT '',
    "ghlStageName" TEXT NOT NULL,
    "kind" "ConversionStageKind" NOT NULL,
    "valueCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "metaEventName" TEXT NOT NULL,
    "googleAction" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConversionStageMap_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversionEvent" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contactId" TEXT,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "kind" "ConversionStageKind" NOT NULL,
    "stageName" TEXT NOT NULL,
    "valueCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "fbclid" TEXT NOT NULL DEFAULT '',
    "fbc" TEXT NOT NULL DEFAULT '',
    "fbp" TEXT NOT NULL DEFAULT '',
    "gclid" TEXT NOT NULL DEFAULT '',
    "gbraid" TEXT NOT NULL DEFAULT '',
    "wbraid" TEXT NOT NULL DEFAULT '',
    "utmSource" TEXT NOT NULL DEFAULT '',
    "utmMedium" TEXT NOT NULL DEFAULT '',
    "utmCampaign" TEXT NOT NULL DEFAULT '',
    "utmTerm" TEXT NOT NULL DEFAULT '',
    "utmContent" TEXT NOT NULL DEFAULT '',
    "emailHashMeta" TEXT NOT NULL DEFAULT '',
    "emailHashGoogle" TEXT NOT NULL DEFAULT '',
    "phoneHashMeta" TEXT NOT NULL DEFAULT '',
    "phoneHashGoogle" TEXT NOT NULL DEFAULT '',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversionEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversionUpload" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "platform" "ConversionPlatform" NOT NULL,
    "status" "ConversionUploadStatus" NOT NULL,
    "payload" JSONB NOT NULL,
    "response" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT NOT NULL DEFAULT '',
    "errorMessage" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    CONSTRAINT "ConversionUpload_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversionDecision" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "ConversionDecisionStatus" NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "undoUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversionDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversionIssue" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT '',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversionIssue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversionAlert" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "platform" "ConversionPlatform" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "code" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "firedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "mutedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversionAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConversionClient_workspaceId_name_key" ON "ConversionClient"("workspaceId", "name");
CREATE INDEX "ConversionClient_workspaceId_idx" ON "ConversionClient"("workspaceId");
CREATE INDEX "ConversionClient_ghlLocationId_idx" ON "ConversionClient"("ghlLocationId");

CREATE UNIQUE INDEX "ConversionStageMap_clientId_ghlStageId_ghlStageName_key" ON "ConversionStageMap"("clientId", "ghlStageId", "ghlStageName");
CREATE INDEX "ConversionStageMap_clientId_idx" ON "ConversionStageMap"("clientId");

CREATE UNIQUE INDEX "ConversionEvent_clientId_externalId_kind_key" ON "ConversionEvent"("clientId", "externalId", "kind");
CREATE INDEX "ConversionEvent_clientId_occurredAt_idx" ON "ConversionEvent"("clientId", "occurredAt");
CREATE INDEX "ConversionEvent_contactId_idx" ON "ConversionEvent"("contactId");

CREATE UNIQUE INDEX "ConversionUpload_eventId_platform_key" ON "ConversionUpload"("eventId", "platform");
CREATE INDEX "ConversionUpload_platform_status_createdAt_idx" ON "ConversionUpload"("platform", "status", "createdAt");

CREATE INDEX "ConversionDecision_clientId_createdAt_idx" ON "ConversionDecision"("clientId", "createdAt");
CREATE INDEX "ConversionIssue_clientId_occurredAt_idx" ON "ConversionIssue"("clientId", "occurredAt");
CREATE INDEX "ConversionAlert_dedupeKey_firedAt_idx" ON "ConversionAlert"("dedupeKey", "firedAt");
CREATE INDEX "ConversionAlert_clientId_idx" ON "ConversionAlert"("clientId");

ALTER TABLE "ConversionStageMap" ADD CONSTRAINT "ConversionStageMap_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ConversionClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversionEvent" ADD CONSTRAINT "ConversionEvent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ConversionClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversionEvent" ADD CONSTRAINT "ConversionEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConversionUpload" ADD CONSTRAINT "ConversionUpload_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ConversionEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversionDecision" ADD CONSTRAINT "ConversionDecision_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ConversionClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversionIssue" ADD CONSTRAINT "ConversionIssue_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ConversionClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversionAlert" ADD CONSTRAINT "ConversionAlert_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ConversionClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

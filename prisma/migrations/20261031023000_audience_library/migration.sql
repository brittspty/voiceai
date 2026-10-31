-- CreateEnum
CREATE TYPE "AudienceSourceKind" AS ENUM ('data_market_maid', 'pixel_retargeting', 'crm_first_party', 'platform_native');

-- CreateEnum
CREATE TYPE "AudiencePlatformKind" AS ENUM ('meta', 'google_customer_match', 'tiktok', 'stackadapt', 'generic_dsp');

-- CreateEnum
CREATE TYPE "MaidIdentifierType" AS ENUM ('idfa', 'gaid', 'email_sha256', 'phone_sha256');

-- CreateEnum
CREATE TYPE "AudienceRefreshCadence" AS ENUM ('daily', 'weekly', 'monthly', 'quarterly');

-- CreateEnum
CREATE TYPE "SegmentDimensionKind" AS ENUM ('intent', 'geo', 'demographics', 'behavior');

-- CreateEnum
CREATE TYPE "AudiencePushStatus" AS ENUM ('pending', 'approved', 'declined');

-- CreateEnum
CREATE TYPE "AudienceConversionStatus" AS ENUM ('verified', 'unverified');

-- CreateTable
CREATE TABLE "MaidAudience" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" "AudienceSourceKind" NOT NULL DEFAULT 'data_market_maid',
    "vendor" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "acquisitionDate" DATE,
    "costAmount" DECIMAL(18,4),
    "costCurrency" TEXT NOT NULL DEFAULT 'USD',
    "consentBasis" TEXT NOT NULL,
    "dataLabel" TEXT NOT NULL DEFAULT '',
    "gppString" TEXT NOT NULL DEFAULT '',
    "consentOrigin" TEXT NOT NULL DEFAULT '',
    "refreshCadence" "AudienceRefreshCadence" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaidAudience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaidIdentifier" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "audienceId" TEXT NOT NULL,
    "idType" "MaidIdentifierType" NOT NULL,
    "hash" TEXT NOT NULL,
    "rawEncrypted" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaidIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaidAudienceTag" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "audienceId" TEXT NOT NULL,
    "dimension" "SegmentDimensionKind" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "MaidAudienceTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudiencePlatformStat" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "audienceId" TEXT NOT NULL,
    "platform" "AudiencePlatformKind" NOT NULL,
    "uploaded" INTEGER NOT NULL DEFAULT 0,
    "matched" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "spend" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudiencePlatformStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudiencePush" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "audienceId" TEXT NOT NULL,
    "platform" "AudiencePlatformKind" NOT NULL,
    "status" "AudiencePushStatus" NOT NULL DEFAULT 'pending',
    "payload" JSONB NOT NULL,
    "manualSteps" TEXT NOT NULL DEFAULT '',
    "logLine" TEXT NOT NULL DEFAULT '',
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "undoUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudiencePush_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudiencePixelEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "audienceId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "pageUrl" TEXT NOT NULL DEFAULT '',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudiencePixelEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudienceConversion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "audienceId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'lead',
    "status" "AudienceConversionStatus" NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "qualified" BOOLEAN NOT NULL DEFAULT false,
    "contactHash" TEXT NOT NULL DEFAULT '',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudienceConversion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaidAudience_workspaceId_idx" ON "MaidAudience"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "MaidAudience_workspaceId_vendor_listId_key" ON "MaidAudience"("workspaceId", "vendor", "listId");

-- CreateIndex
CREATE INDEX "MaidIdentifier_workspaceId_idx" ON "MaidIdentifier"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "MaidIdentifier_audienceId_idType_hash_key" ON "MaidIdentifier"("audienceId", "idType", "hash");

-- CreateIndex
CREATE INDEX "MaidAudienceTag_workspaceId_idx" ON "MaidAudienceTag"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "MaidAudienceTag_audienceId_dimension_key_key" ON "MaidAudienceTag"("audienceId", "dimension", "key");

-- CreateIndex
CREATE INDEX "AudiencePlatformStat_workspaceId_idx" ON "AudiencePlatformStat"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "AudiencePlatformStat_audienceId_platform_key" ON "AudiencePlatformStat"("audienceId", "platform");

-- CreateIndex
CREATE INDEX "AudiencePush_workspaceId_status_idx" ON "AudiencePush"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "AudiencePush_audienceId_idx" ON "AudiencePush"("audienceId");

-- CreateIndex
CREATE INDEX "AudiencePixelEvent_workspaceId_audienceId_idx" ON "AudiencePixelEvent"("workspaceId", "audienceId");

-- CreateIndex
CREATE INDEX "AudiencePixelEvent_visitorId_idx" ON "AudiencePixelEvent"("visitorId");

-- CreateIndex
CREATE INDEX "AudienceConversion_workspaceId_status_idx" ON "AudienceConversion"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "AudienceConversion_audienceId_idx" ON "AudienceConversion"("audienceId");

-- CreateIndex
CREATE UNIQUE INDEX "AudienceConversion_workspaceId_audienceId_dedupeKey_key" ON "AudienceConversion"("workspaceId", "audienceId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "MaidIdentifier" ADD CONSTRAINT "MaidIdentifier_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "MaidAudience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaidAudienceTag" ADD CONSTRAINT "MaidAudienceTag_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "MaidAudience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudiencePlatformStat" ADD CONSTRAINT "AudiencePlatformStat_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "MaidAudience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudiencePush" ADD CONSTRAINT "AudiencePush_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "MaidAudience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudiencePixelEvent" ADD CONSTRAINT "AudiencePixelEvent_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "MaidAudience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudienceConversion" ADD CONSTRAINT "AudienceConversion_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "MaidAudience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

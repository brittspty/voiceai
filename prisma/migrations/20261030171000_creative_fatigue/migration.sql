-- Creative fatigue flags. Draft variations stay off the live ad until a person uploads them.

CREATE TYPE "CreativeVersionStatus" AS ENUM ('live', 'draft', 'queued');

ALTER TYPE "RecommendationType" ADD VALUE 'creative_fatigue';

ALTER TABLE "CreativeVersion" ADD COLUMN "status" "CreativeVersionStatus" NOT NULL DEFAULT 'live';

CREATE TABLE "FatigueSignal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "platform" "AdPlatform" NOT NULL,
    "adId" TEXT NOT NULL,
    "creativeVersionId" TEXT,
    "campaignId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "frequency" DECIMAL(18,4),
    "ctrRecent" DECIMAL(18,6),
    "ctrPrior" DECIMAL(18,6),
    "ctrSlope" DECIMAL(18,6),
    "cpaRecent" DECIMAL(18,4),
    "cpaPrior" DECIMAL(18,4),
    "fatigued" BOOLEAN NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "windowStart" DATE NOT NULL,
    "windowEnd" DATE NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FatigueSignal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FatigueSignal_adId_detectedAt_idx" ON "FatigueSignal"("adId", "detectedAt");
CREATE INDEX "FatigueSignal_dedupeKey_detectedAt_idx" ON "FatigueSignal"("dedupeKey", "detectedAt");
CREATE INDEX "FatigueSignal_campaignId_idx" ON "FatigueSignal"("campaignId");
CREATE INDEX "FatigueSignal_adAccountId_idx" ON "FatigueSignal"("adAccountId");

ALTER TABLE "FatigueSignal" ADD CONSTRAINT "FatigueSignal_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FatigueSignal" ADD CONSTRAINT "FatigueSignal_creativeVersionId_fkey" FOREIGN KEY ("creativeVersionId") REFERENCES "CreativeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FatigueSignal" ADD CONSTRAINT "FatigueSignal_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FatigueSignal" ADD CONSTRAINT "FatigueSignal_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

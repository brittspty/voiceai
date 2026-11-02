-- Per-client campaign scoping inside a shared ad account. Additive only.
ALTER TABLE "MarketingClient" ADD COLUMN "metaCampaignIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "MarketingClient" ADD COLUMN "metaCampaignNameContains" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MarketingClient" ADD COLUMN "metaLiveRead" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Campaign" ADD COLUMN "clientId" TEXT;
CREATE INDEX "Campaign_clientId_idx" ON "Campaign"("clientId");
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "MarketingClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

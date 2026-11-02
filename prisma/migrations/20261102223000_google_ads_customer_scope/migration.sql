-- Per-client Google Ads customer scope. Additive only. Campaign.clientId already exists.
ALTER TABLE "MarketingClient" ADD COLUMN "googleAdsCustomerIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "MarketingClient" ADD COLUMN "googleAdsLiveRead" BOOLEAN NOT NULL DEFAULT false;

-- Per-client StackAdapt advertiser scope. Additive only. Campaign.clientId already exists.
ALTER TABLE "MarketingClient" ADD COLUMN "stackadaptAdvertiserIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "MarketingClient" ADD COLUMN "stackadaptLiveRead" BOOLEAN NOT NULL DEFAULT false;

-- Per-client StackAdapt campaign-name filter and whole Meta ad-account links. Additive only.
ALTER TABLE "MarketingClient" ADD COLUMN "metaAdAccountIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "MarketingClient" ADD COLUMN "stackadaptCampaignNameContains" TEXT NOT NULL DEFAULT '';

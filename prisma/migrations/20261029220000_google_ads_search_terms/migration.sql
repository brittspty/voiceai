-- Google Ads search terms. Additive. Existing marketing rows are unchanged.
CREATE TABLE "SearchTermMetric" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "platform" "AdPlatform" NOT NULL,
    "date" DATE NOT NULL,
    "campaignExternalId" VARCHAR(64) NOT NULL,
    "adGroupExternalId" VARCHAR(64) NOT NULL,
    "campaignId" TEXT,
    "adGroupId" TEXT,
    "term" VARCHAR(500) NOT NULL,
    "matchType" VARCHAR(64) NOT NULL DEFAULT '',
    "status" VARCHAR(64) NOT NULL DEFAULT '',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "spend" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "impressions" BIGINT NOT NULL DEFAULT 0,
    "clicks" BIGINT NOT NULL DEFAULT 0,
    "conversions" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourcePullId" TEXT,

    CONSTRAINT "SearchTermMetric_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SearchTermMetric_identity_key" ON "SearchTermMetric"("workspaceId", "date", "platform", "campaignExternalId", "adGroupExternalId", "term", "matchType");
CREATE INDEX "SearchTermMetric_date_idx" ON "SearchTermMetric"("date");
CREATE INDEX "SearchTermMetric_campaignId_idx" ON "SearchTermMetric"("campaignId");
CREATE INDEX "SearchTermMetric_adGroupId_idx" ON "SearchTermMetric"("adGroupId");
CREATE INDEX "SearchTermMetric_sourcePullId_idx" ON "SearchTermMetric"("sourcePullId");

ALTER TABLE "SearchTermMetric" ADD CONSTRAINT "SearchTermMetric_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SearchTermMetric" ADD CONSTRAINT "SearchTermMetric_adGroupId_fkey" FOREIGN KEY ("adGroupId") REFERENCES "AdGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SearchTermMetric" ADD CONSTRAINT "SearchTermMetric_sourcePullId_fkey" FOREIGN KEY ("sourcePullId") REFERENCES "MarketingSyncRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

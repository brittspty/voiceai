-- Google Business Profile phase 1. Read-only location mapping, keywords, reviews, media, posts, and audit scores.
-- Reviewer names are stored as hashes. This migration does not add a write path.

ALTER TABLE "BusinessProfileSnapshot" ADD COLUMN "marketingClientId" TEXT;
ALTER TABLE "BusinessProfileSnapshot" ADD COLUMN "searchDesktop" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BusinessProfileSnapshot" ADD COLUMN "searchMobile" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BusinessProfileSnapshot" ADD COLUMN "mapsDesktop" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BusinessProfileSnapshot" ADD COLUMN "mapsMobile" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BusinessProfileSnapshot" ADD COLUMN "bookings" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BusinessProfileSnapshot" ADD COLUMN "conversations" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BusinessProfileSnapshot" ADD COLUMN "foodOrders" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "BusinessProfileSnapshot_marketingClientId_idx" ON "BusinessProfileSnapshot"("marketingClientId");

ALTER TABLE "BusinessProfileSnapshot" ADD CONSTRAINT "BusinessProfileSnapshot_marketingClientId_fkey" FOREIGN KEY ("marketingClientId") REFERENCES "MarketingClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "GbpLocation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "marketingClientId" TEXT,
    "accountId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "primaryCategory" TEXT NOT NULL DEFAULT '',
    "additionalCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "phone" TEXT NOT NULL DEFAULT '',
    "websiteUri" TEXT NOT NULL DEFAULT '',
    "address" JSONB NOT NULL DEFAULT '{}',
    "hours" JSONB NOT NULL DEFAULT '{}',
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "services" JSONB NOT NULL DEFAULT '[]',
    "description" TEXT NOT NULL DEFAULT '',
    "verificationState" TEXT NOT NULL DEFAULT '',
    "fieldsHash" TEXT NOT NULL DEFAULT '',
    "photoCount" INTEGER NOT NULL DEFAULT 0,
    "lastPhotoAt" TIMESTAMP(3),
    "hasLogo" BOOLEAN NOT NULL DEFAULT false,
    "hasCover" BOOLEAN NOT NULL DEFAULT false,
    "postCount" INTEGER NOT NULL DEFAULT 0,
    "lastPostAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GbpLocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GbpLocation_workspaceId_locationId_key" ON "GbpLocation"("workspaceId", "locationId");
CREATE INDEX "GbpLocation_workspaceId_marketingClientId_idx" ON "GbpLocation"("workspaceId", "marketingClientId");

ALTER TABLE "GbpLocation" ADD CONSTRAINT "GbpLocation_marketingClientId_fkey" FOREIGN KEY ("marketingClientId") REFERENCES "MarketingClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "GbpKeywordMonthly" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "locationRef" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "impressions" INTEGER,
    "threshold" TEXT NOT NULL DEFAULT '',
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GbpKeywordMonthly_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GbpKeywordMonthly_locationRef_month_keyword_key" ON "GbpKeywordMonthly"("locationRef", "month", "keyword");
CREATE INDEX "GbpKeywordMonthly_workspaceId_locationId_month_idx" ON "GbpKeywordMonthly"("workspaceId", "locationId", "month");

ALTER TABLE "GbpKeywordMonthly" ADD CONSTRAINT "GbpKeywordMonthly_locationRef_fkey" FOREIGN KEY ("locationRef") REFERENCES "GbpLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GbpReview" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "reviewId" TEXT NOT NULL,
    "locationRef" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "starRating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "createTime" TIMESTAMP(3) NOT NULL,
    "updateTime" TIMESTAMP(3),
    "reviewerNameHash" TEXT NOT NULL DEFAULT '',
    "hasOwnerReply" BOOLEAN NOT NULL DEFAULT false,
    "replyTime" TIMESTAMP(3),
    "replyText" TEXT NOT NULL DEFAULT '',
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GbpReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GbpReview_workspaceId_reviewId_key" ON "GbpReview"("workspaceId", "reviewId");
CREATE INDEX "GbpReview_locationId_createTime_idx" ON "GbpReview"("locationId", "createTime");

ALTER TABLE "GbpReview" ADD CONSTRAINT "GbpReview_locationRef_fkey" FOREIGN KEY ("locationRef") REFERENCES "GbpLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GbpMediaStat" (
    "id" TEXT NOT NULL,
    "locationRef" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "createTime" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GbpMediaStat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GbpMediaStat_locationRef_mediaId_key" ON "GbpMediaStat"("locationRef", "mediaId");

ALTER TABLE "GbpMediaStat" ADD CONSTRAINT "GbpMediaStat_locationRef_fkey" FOREIGN KEY ("locationRef") REFERENCES "GbpLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GbpPost" (
    "id" TEXT NOT NULL,
    "locationRef" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "createTime" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GbpPost_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GbpPost_locationRef_postId_key" ON "GbpPost"("locationRef", "postId");

ALTER TABLE "GbpPost" ADD CONSTRAINT "GbpPost_locationRef_fkey" FOREIGN KEY ("locationRef") REFERENCES "GbpLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GbpAudit" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "locationRef" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "checks" JSONB NOT NULL,
    "version" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GbpAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GbpAudit_locationId_createdAt_idx" ON "GbpAudit"("locationId", "createdAt");

ALTER TABLE "GbpAudit" ADD CONSTRAINT "GbpAudit_locationRef_fkey" FOREIGN KEY ("locationRef") REFERENCES "GbpLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Book a demo sync status. The lead row is still saved when GoHighLevel or the alert email fails.

ALTER TABLE "HomepageContact" ADD COLUMN "ghlContactId" TEXT;
ALTER TABLE "HomepageContact" ADD COLUMN "ghlSyncedAt" TIMESTAMP(3);
ALTER TABLE "HomepageContact" ADD COLUMN "ghlError" TEXT;
ALTER TABLE "HomepageContact" ADD COLUMN "alertSentAt" TIMESTAMP(3);

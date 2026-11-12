-- Agency waitlist sync status. The signup row is still saved when GoHighLevel or the alert email fails.

ALTER TABLE "AgencyWaitlist" ADD COLUMN "ghlContactId" TEXT;
ALTER TABLE "AgencyWaitlist" ADD COLUMN "ghlSyncedAt" TIMESTAMP(3);
ALTER TABLE "AgencyWaitlist" ADD COLUMN "ghlError" TEXT;
ALTER TABLE "AgencyWaitlist" ADD COLUMN "alertSentAt" TIMESTAMP(3);

-- Agency waitlist signups from the public homepage.
-- Not scoped to a workspace. Demo reseed does not touch this table.
CREATE TABLE "AgencyWaitlist" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "agencyName" TEXT NOT NULL,
    "website" TEXT NOT NULL DEFAULT '',
    "clientCount" TEXT NOT NULL DEFAULT '',
    "monthlySpend" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencyWaitlist_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgencyWaitlist_email_idx" ON "AgencyWaitlist"("email");
CREATE INDEX "AgencyWaitlist_createdAt_idx" ON "AgencyWaitlist"("createdAt");

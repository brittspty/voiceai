-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "consentRevoked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Contact" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
DROP INDEX "Call_twilioCallSid_idx";
CREATE UNIQUE INDEX "Call_twilioCallSid_key" ON "Call"("twilioCallSid");

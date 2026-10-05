-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "consentTier" TEXT;
ALTER TABLE "Contact" ADD COLUMN "consentScope" TEXT;
ALTER TABLE "Contact" ADD COLUMN "consentHoldReason" TEXT;
ALTER TABLE "Contact" ADD COLUMN "consentVersion" TEXT;
ALTER TABLE "Contact" ADD COLUMN "consentTimestamp" TEXT;
ALTER TABLE "Contact" ADD COLUMN "consentCheckedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Call" ADD COLUMN "consentScope" TEXT;

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN "detail" JSONB;

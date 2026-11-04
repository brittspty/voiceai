-- How many breakdown weeks were requested, and how many actually came back.
-- Gaps names the weeks that failed or were still processing.

ALTER TABLE "CtvAttributionMeta" ADD COLUMN IF NOT EXISTS "breakdownCovered" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CtvAttributionMeta" ADD COLUMN IF NOT EXISTS "breakdownTotal" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CtvAttributionMeta" ADD COLUMN IF NOT EXISTS "breakdownGaps" TEXT NOT NULL DEFAULT '';

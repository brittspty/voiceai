-- Per-client ad accounts for offline conversions. Additive only.
-- A global dataset id or Google customer id must not receive another client's events.

ALTER TABLE "ConversionClient" ADD COLUMN "metaDatasetId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ConversionClient" ADD COLUMN "googleCustomerId" TEXT NOT NULL DEFAULT '';

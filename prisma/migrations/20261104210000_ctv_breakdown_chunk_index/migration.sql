-- Breakdown rows are stored per weekly chunk. rangeStart and rangeEnd are that chunk.
-- A wider existing row is an older combined total. This migration does not rewrite it.
-- A read deletes only the client, dimension, and chunk it finished reading.

CREATE INDEX IF NOT EXISTS "CtvAttributionBreakdown_client_chunk_idx"
ON "CtvAttributionBreakdown"("workspaceId", "clientId", "dimension", "rangeStart", "rangeEnd");

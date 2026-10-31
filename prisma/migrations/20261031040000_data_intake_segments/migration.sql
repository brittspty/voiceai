-- Proprietary intake, metric dictionary overrides, coverage, and segment tests.
-- Channel daily facts, StackAdapt, and Business Profile tables are owned elsewhere.

CREATE TABLE "MetricDefinition" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "definition" TEXT NOT NULL DEFAULT '',
    "formula" TEXT NOT NULL DEFAULT '',
    "benchmarks" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MetricDefinition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MetricDefinition_workspaceId_metricKey_key" ON "MetricDefinition"("workspaceId", "metricKey");
CREATE INDEX "MetricDefinition_workspaceId_idx" ON "MetricDefinition"("workspaceId");

CREATE TABLE "IntakeSource" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "audienceSource" TEXT NOT NULL,
    "vendor" TEXT NOT NULL DEFAULT '',
    "listId" TEXT NOT NULL DEFAULT '',
    "trustTier" TEXT NOT NULL,
    "truthRole" TEXT NOT NULL,
    "mapping" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntakeSource_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IntakeSource_workspaceId_idx" ON "IntakeSource"("workspaceId");

CREATE TABLE "IntakeKey" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "secretSealed" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntakeKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntakeKey_workspaceId_keyId_key" ON "IntakeKey"("workspaceId", "keyId");
CREATE INDEX "IntakeKey_workspaceId_idx" ON "IntakeKey"("workspaceId");

CREATE TABLE "IntakeBatch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "accepted" INTEGER NOT NULL DEFAULT 0,
    "rejected" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntakeBatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntakeBatch_workspaceId_sourceId_idempotencyKey_key" ON "IntakeBatch"("workspaceId", "sourceId", "idempotencyKey");
CREATE INDEX "IntakeBatch_workspaceId_idx" ON "IntakeBatch"("workspaceId");

CREATE TABLE "IntakeRow" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "audienceSource" TEXT NOT NULL,
    "vendor" TEXT NOT NULL DEFAULT '',
    "listId" TEXT NOT NULL DEFAULT '',
    "trustTier" TEXT NOT NULL,
    "truthRole" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "fields" JSONB NOT NULL DEFAULT '{}',
    "segmentKey" TEXT NOT NULL DEFAULT '',
    "subSegmentKey" TEXT NOT NULL DEFAULT '',
    "audienceKey" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntakeRow_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntakeRow_workspaceId_sourceId_externalId_key" ON "IntakeRow"("workspaceId", "sourceId", "externalId");
CREATE INDEX "IntakeRow_workspaceId_batchId_idx" ON "IntakeRow"("workspaceId", "batchId");

CREATE TABLE "RecommendationDriver" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL DEFAULT '',
    "metricKey" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "trustTier" TEXT NOT NULL,
    "truthRole" TEXT NOT NULL,
    "vendor" TEXT NOT NULL DEFAULT '',
    "listId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecommendationDriver_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RecommendationDriver_workspaceId_recommendationId_idx" ON "RecommendationDriver"("workspaceId", "recommendationId");

CREATE TABLE "CoverageSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL DEFAULT '',
    "campaignId" TEXT NOT NULL DEFAULT '',
    "score" INTEGER NOT NULL,
    "explanation" TEXT NOT NULL,
    "freshness" JSONB NOT NULL,
    "metricsCovered" INTEGER NOT NULL,
    "metricsTotal" INTEGER NOT NULL,
    "qualityPassRate" DOUBLE PRECISION NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoverageSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CoverageSnapshot_workspaceId_campaignId_computedAt_idx" ON "CoverageSnapshot"("workspaceId", "campaignId", "computedAt");

CREATE TABLE "LearningConsent" (
    "workspaceId" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL DEFAULT '',
    "crossClientConsent" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LearningConsent_pkey" PRIMARY KEY ("workspaceId", "clientKey")
);

CREATE TABLE "SegmentEngineConfig" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL DEFAULT '',
    "settings" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SegmentEngineConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SegmentEngineConfig_workspaceId_clientKey_key" ON "SegmentEngineConfig"("workspaceId", "clientKey");

CREATE TABLE "Segment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL DEFAULT '',
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "audienceSource" TEXT NOT NULL,
    "vendor" TEXT NOT NULL DEFAULT '',
    "listId" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL DEFAULT 'test',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Segment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Segment_workspaceId_clientKey_key_key" ON "Segment"("workspaceId", "clientKey", "key");
CREATE INDEX "Segment_workspaceId_idx" ON "Segment"("workspaceId");

CREATE TABLE "SubSegment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL DEFAULT '',
    "segmentKey" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "attribute" TEXT NOT NULL,
    "attributeValue" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'test',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubSegment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SubSegment_workspaceId_clientKey_segmentKey_key_key" ON "SubSegment"("workspaceId", "clientKey", "segmentKey", "key");
CREATE INDEX "SubSegment_workspaceId_segmentKey_idx" ON "SubSegment"("workspaceId", "segmentKey");

CREATE TABLE "SegmentLineage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "intakeRowId" TEXT NOT NULL DEFAULT '',
    "contactId" TEXT NOT NULL DEFAULT '',
    "conversionEventId" TEXT NOT NULL DEFAULT '',
    "audienceSource" TEXT NOT NULL,
    "vendor" TEXT NOT NULL DEFAULT '',
    "listId" TEXT NOT NULL DEFAULT '',
    "intent" TEXT NOT NULL DEFAULT '',
    "geo" TEXT NOT NULL DEFAULT '',
    "demographics" TEXT NOT NULL DEFAULT '',
    "behavior" TEXT NOT NULL DEFAULT '',
    "segmentKey" TEXT NOT NULL DEFAULT '',
    "subSegmentKey" TEXT NOT NULL DEFAULT '',
    "audienceKey" TEXT NOT NULL DEFAULT '',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "taggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SegmentLineage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SegmentLineage_workspaceId_audienceKey_idx" ON "SegmentLineage"("workspaceId", "audienceKey");
CREATE INDEX "SegmentLineage_workspaceId_listId_idx" ON "SegmentLineage"("workspaceId", "listId");

CREATE TABLE "SegmentTest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "controlKind" TEXT NOT NULL,
    "controlListId" TEXT NOT NULL,
    "controlVendor" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'still_learning',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SegmentTest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SegmentTest_workspaceId_idx" ON "SegmentTest"("workspaceId");

CREATE TABLE "SegmentTestArm" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "armKey" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "subSegmentKey" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL,
    "successes" INTEGER NOT NULL DEFAULT 0,
    "trials" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "SegmentTestArm_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SegmentTestArm_workspaceId_testId_armKey_key" ON "SegmentTestArm"("workspaceId", "testId", "armKey");
CREATE INDEX "SegmentTestArm_testId_idx" ON "SegmentTestArm"("testId");
ALTER TABLE "SegmentTestArm" ADD CONSTRAINT "SegmentTestArm_testId_fkey" FOREIGN KEY ("testId") REFERENCES "SegmentTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SegmentDecision" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'verified',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "vendor" TEXT NOT NULL DEFAULT '',
    "listId" TEXT NOT NULL DEFAULT '',
    "basedOn" TEXT NOT NULL DEFAULT '',
    "decisionNote" TEXT NOT NULL DEFAULT '',
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SegmentDecision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SegmentDecision_workspaceId_createdAt_idx" ON "SegmentDecision"("workspaceId", "createdAt");

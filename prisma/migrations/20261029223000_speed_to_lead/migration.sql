-- Speed-to-lead. Adds tables and one recommendation type. No existing rows are updated or deleted.

ALTER TYPE "RecommendationType" ADD VALUE 'speed_to_lead';

CREATE TYPE "LeadClockSource" AS ENUM ('landing', 'form_submit', 'call_start');

CREATE TYPE "LeadTouchChannel" AS ENUM ('human', 'voice_ai', 'sms');

CREATE TYPE "LeadAlertState" AS ENUM ('open', 'resolved', 'muted');

CREATE TABLE "ClientSla" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "targetSeconds" INTEGER NOT NULL DEFAULT 30,
    "criticalSeconds" INTEGER NOT NULL DEFAULT 900,
    "openTime" TEXT NOT NULL DEFAULT '08:00',
    "closeTime" TEXT NOT NULL DEFAULT '21:00',
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClientSla_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeadLanding" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "sessionKey" TEXT NOT NULL,
    "landedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadLanding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeadResponse" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "contactId" TEXT,
    "callId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "sessionKey" TEXT NOT NULL DEFAULT '',
    "leadSource" TEXT NOT NULL DEFAULT 'Form',
    "landedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "callStartedAt" TIMESTAMP(3),
    "clockStartAt" TIMESTAMP(3) NOT NULL,
    "clockSource" "LeadClockSource" NOT NULL,
    "slaStartAt" TIMESTAMP(3) NOT NULL,
    "afterHours" BOOLEAN NOT NULL DEFAULT false,
    "firstTouchAt" TIMESTAMP(3),
    "channel" "LeadTouchChannel",
    "seconds" INTEGER,
    "touchedById" TEXT,
    "mutedUntil" TIMESTAMP(3),
    "recommendationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LeadResponse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeadAlert" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "leadResponseId" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "state" "LeadAlertState" NOT NULL DEFAULT 'open',
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolveNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadAlert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SpeedNotify" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "userId" TEXT NOT NULL,
    "pushedAt" TIMESTAMP(3) NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    CONSTRAINT "SpeedNotify_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientSla_workspaceId_key" ON "ClientSla"("workspaceId");

CREATE INDEX "LeadLanding_workspaceId_sessionKey_landedAt_idx" ON "LeadLanding"("workspaceId", "sessionKey", "landedAt");

CREATE INDEX "LeadResponse_workspaceId_slaStartAt_idx" ON "LeadResponse"("workspaceId", "slaStartAt");

CREATE INDEX "LeadResponse_workspaceId_firstTouchAt_idx" ON "LeadResponse"("workspaceId", "firstTouchAt");

CREATE INDEX "LeadResponse_contactId_idx" ON "LeadResponse"("contactId");

CREATE INDEX "LeadResponse_sessionKey_idx" ON "LeadResponse"("sessionKey");

CREATE UNIQUE INDEX "LeadAlert_dedupeKey_severity_key" ON "LeadAlert"("dedupeKey", "severity");

CREATE INDEX "LeadAlert_workspaceId_detectedAt_idx" ON "LeadAlert"("workspaceId", "detectedAt");

CREATE INDEX "LeadAlert_state_idx" ON "LeadAlert"("state");

CREATE INDEX "SpeedNotify_workspaceId_userId_pushedAt_idx" ON "SpeedNotify"("workspaceId", "userId", "pushedAt");

ALTER TABLE "LeadResponse" ADD CONSTRAINT "LeadResponse_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LeadAlert" ADD CONSTRAINT "LeadAlert_leadResponseId_fkey" FOREIGN KEY ("leadResponseId") REFERENCES "LeadResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

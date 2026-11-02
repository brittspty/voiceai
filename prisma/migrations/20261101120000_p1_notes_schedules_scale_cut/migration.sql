-- Reports P1 chart notes, report schedules, and Audience Data P1 scale/cut logs.
-- EXAMPLE DATA seed schedules. Client copies stay NO. Delivery only logs "would send".
-- New tables only. No existing table is altered.

CREATE TABLE "ReportChartNote" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "seriesId" TEXT NOT NULL,
    "noteDate" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "clientBody" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportChartNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReportChartNote_workspaceId_loggedAt_idx" ON "ReportChartNote"("workspaceId", "loggedAt");

CREATE TABLE "ReportSchedule" (
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cadence" TEXT NOT NULL DEFAULT 'Weekly',
    "audience" TEXT NOT NULL,
    "moneyInCopy" TEXT NOT NULL,
    "exampleData" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportSchedule_pkey" PRIMARY KEY ("workspaceId", "id")
);

CREATE INDEX "ReportSchedule_workspaceId_createdAt_idx" ON "ReportSchedule"("workspaceId", "createdAt");

INSERT INTO "ReportSchedule" ("workspaceId", "id", "name", "cadence", "audience", "moneyInCopy", "exampleData", "createdAt")
VALUES
    ('org', 'ex-client-week', 'Example client weekly', 'Weekly', 'client', 'NO', true, TIMESTAMP '2026-10-01 00:00:00'),
    ('org', 'ex-staff-week', 'Example staff weekly', 'Weekly', 'staff', 'YES', true, TIMESTAMP '2026-10-01 00:00:01');

CREATE TABLE "ReportScheduleDelivery" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "scheduleId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "audience" TEXT NOT NULL,
    "moneyInCopy" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT 'would send',
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "email" BOOLEAN NOT NULL DEFAULT false,
    "sms" BOOLEAN NOT NULL DEFAULT false,
    "push" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportScheduleDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReportScheduleDelivery_workspaceId_at_idx" ON "ReportScheduleDelivery"("workspaceId", "at");

CREATE TABLE "AudienceScaleCutLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "at" TIMESTAMP(3) NOT NULL,
    "who" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "campaignWrite" BOOLEAN NOT NULL DEFAULT false,
    "adAccountWrite" BOOLEAN NOT NULL DEFAULT false,
    "manualSteps" JSONB NOT NULL,
    "message" TEXT NOT NULL DEFAULT 'logged only',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudienceScaleCutLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AudienceScaleCutLog_workspaceId_at_idx" ON "AudienceScaleCutLog"("workspaceId", "at");

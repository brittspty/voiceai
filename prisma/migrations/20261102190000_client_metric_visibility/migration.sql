-- Per-client metric visibility. Null metricVisibility means the current client view.
-- Spend, budget, bid, CPx, ROAS, margin, and internal cost are not stored here.

ALTER TABLE "ClientSettings" ADD COLUMN "metricVisibility" JSONB;

CREATE TABLE "ClientMetricAudit" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "metricId" TEXT NOT NULL,
    "oldValue" BOOLEAN NOT NULL,
    "newValue" BOOLEAN NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientMetricAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClientMetricAudit_workspaceId_createdAt_idx" ON "ClientMetricAudit"("workspaceId", "createdAt");

ALTER TABLE "ClientMetricAudit" ADD CONSTRAINT "ClientMetricAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

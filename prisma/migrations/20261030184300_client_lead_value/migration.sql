-- Per-workspace lead and call values used only to estimate ROAS.
-- Null lead value means estimated ROAS stays hidden.

CREATE TABLE "ClientSettings" (
    "workspaceId" TEXT NOT NULL,
    "leadValueCents" INTEGER,
    "callValueCents" INTEGER,
    "leadValueSetById" TEXT,
    "leadValueSetAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientSettings_pkey" PRIMARY KEY ("workspaceId")
);

CREATE TABLE "LeadValueAudit" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "oldLeadCents" INTEGER,
    "newLeadCents" INTEGER,
    "oldCallCents" INTEGER,
    "newCallCents" INTEGER,
    "userId" TEXT NOT NULL,
    "setAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadValueAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeadValueAudit_workspaceId_setAt_idx" ON "LeadValueAudit"("workspaceId", "setAt");

ALTER TABLE "ClientSettings" ADD CONSTRAINT "ClientSettings_leadValueSetById_fkey" FOREIGN KEY ("leadValueSetById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LeadValueAudit" ADD CONSTRAINT "LeadValueAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

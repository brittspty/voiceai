-- CreateEnum
CREATE TYPE "LeadLabel" AS ENUM ('qualified', 'unqualified', 'spam');

-- CreateTable
CREATE TABLE "LeadScore" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "contactId" TEXT,
    "callId" TEXT,
    "label" "LeadLabel" NOT NULL,
    "score" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'rules',
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "overrideLabel" "LeadLabel",
    "overrideReason" TEXT NOT NULL DEFAULT '',
    "overriddenById" TEXT,
    "overriddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadScore_contactId_key" ON "LeadScore"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadScore_callId_key" ON "LeadScore"("callId");

-- CreateIndex
CREATE INDEX "LeadScore_workspaceId_createdAt_idx" ON "LeadScore"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "LeadScore_overriddenById_idx" ON "LeadScore"("overriddenById");

-- AddForeignKey
ALTER TABLE "LeadScore" ADD CONSTRAINT "LeadScore_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadScore" ADD CONSTRAINT "LeadScore_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadScore" ADD CONSTRAINT "LeadScore_overriddenById_fkey" FOREIGN KEY ("overriddenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LeadScore" ADD CONSTRAINT "LeadScore_subject_check" CHECK (("contactId" IS NOT NULL) OR ("callId" IS NOT NULL));

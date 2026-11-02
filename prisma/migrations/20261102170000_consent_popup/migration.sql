-- AlterTable
ALTER TABLE "ClientSettings" ADD COLUMN "voiceConsentMinLevel" "Consent";

-- CreateEnum
CREATE TYPE "ConsentChoiceLevel" AS ENUM ('reject', 'low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "ConsentChoiceAction" AS ENUM ('grant', 'change', 'withdraw');

-- CreateTable
CREATE TABLE "ConsentWordingVersion" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "text" TEXT NOT NULL,
    "textHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentWordingVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL DEFAULT '',
    "visitorId" TEXT NOT NULL DEFAULT '',
    "deviceId" TEXT NOT NULL DEFAULT '',
    "contactMatchKey" TEXT NOT NULL DEFAULT '',
    "matchKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "level" "ConsentChoiceLevel" NOT NULL,
    "action" "ConsentChoiceAction" NOT NULL,
    "wordingVersionId" TEXT NOT NULL,
    "wordingHash" TEXT NOT NULL,
    "pageUrl" TEXT NOT NULL DEFAULT '',
    "userAgentSummary" TEXT NOT NULL DEFAULT '',
    "ipHash" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentInstall" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL DEFAULT '',
    "pageUrl" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentInstall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsentWordingVersion_version_key" ON "ConsentWordingVersion"("version");

-- CreateIndex
CREATE INDEX "ConsentRecord_workspaceId_visitorId_createdAt_idx" ON "ConsentRecord"("workspaceId", "visitorId", "createdAt");

-- CreateIndex
CREATE INDEX "ConsentRecord_workspaceId_deviceId_createdAt_idx" ON "ConsentRecord"("workspaceId", "deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "ConsentRecord_workspaceId_createdAt_idx" ON "ConsentRecord"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ConsentRecord_matchKeys_idx" ON "ConsentRecord" USING GIN ("matchKeys");

-- CreateIndex
CREATE INDEX "ConsentInstall_workspaceId_clientKey_seenAt_idx" ON "ConsentInstall"("workspaceId", "clientKey", "seenAt");

-- CreateIndex
CREATE INDEX "ConsentInstall_workspaceId_pageUrl_idx" ON "ConsentInstall"("workspaceId", "pageUrl");

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_wordingVersionId_fkey" FOREIGN KEY ("wordingVersionId") REFERENCES "ConsentWordingVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

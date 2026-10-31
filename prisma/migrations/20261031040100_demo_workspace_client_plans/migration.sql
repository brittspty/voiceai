-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'demo_viewer';
ALTER TYPE "AdPlatform" ADD VALUE IF NOT EXISTS 'stackadapt';
ALTER TYPE "AdPlatform" ADD VALUE 'ais2l';

-- CreateEnum
CREATE TYPE "ClientPlanStatus" AS ENUM ('draft', 'preview', 'approved');

-- CreateEnum
CREATE TYPE "ClientPlanDashboard" AS ENUM ('demo', 'baseline');

CREATE TABLE "DemoExhibit" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoExhibit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DemoGrant" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoGrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DemoReseed" (
    "id" TEXT NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "DemoReseed_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientPlan" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "logoMime" TEXT NOT NULL DEFAULT '',
    "logoData" BYTEA,
    "goals" TEXT NOT NULL DEFAULT '',
    "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "audiences" JSONB NOT NULL DEFAULT '[]',
    "segments" JSONB NOT NULL DEFAULT '[]',
    "dashboardSource" "ClientPlanDashboard" NOT NULL DEFAULT 'demo',
    "baselineWorkspaceId" TEXT NOT NULL DEFAULT '',
    "timeline" TEXT NOT NULL DEFAULT '',
    "weekly" TEXT NOT NULL DEFAULT '',
    "ctaLabel" TEXT NOT NULL DEFAULT 'Let''s start',
    "ctaHref" TEXT NOT NULL DEFAULT '/contact',
    "showCost" BOOLEAN NOT NULL DEFAULT false,
    "linkDays" INTEGER NOT NULL DEFAULT 30,
    "status" "ClientPlanStatus" NOT NULL DEFAULT 'draft',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "tokenHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientPlanView" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgentCoarse" TEXT NOT NULL,

    CONSTRAINT "ClientPlanView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DemoGrant_tokenHash_key" ON "DemoGrant"("tokenHash");
CREATE INDEX "DemoExhibit_workspaceId_kind_idx" ON "DemoExhibit"("workspaceId", "kind");
CREATE UNIQUE INDEX "ClientPlan_tokenHash_key" ON "ClientPlan"("tokenHash");
CREATE INDEX "ClientPlan_slug_idx" ON "ClientPlan"("slug");
CREATE INDEX "ClientPlan_status_idx" ON "ClientPlan"("status");
CREATE INDEX "ClientPlanView_planId_viewedAt_idx" ON "ClientPlanView"("planId", "viewedAt");

ALTER TABLE "ClientPlan" ADD CONSTRAINT "ClientPlan_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClientPlan" ADD CONSTRAINT "ClientPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientPlanView" ADD CONSTRAINT "ClientPlanView_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ClientPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

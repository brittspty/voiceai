-- Landing page checks and the pause audit. Timestamp 20261030162000 is unique
-- (other drafts used 20261029223000). Tokens are not stored.

CREATE TABLE "MarketingClient" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingClient_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AdAccount" ADD COLUMN "clientId" TEXT;

CREATE TABLE "LandingPage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "clientKey" TEXT NOT NULL,
    "clientLabel" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "formTestUrl" TEXT NOT NULL DEFAULT '',
    "expectForm" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mutedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandingPage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PageCheck" (
    "id" TEXT NOT NULL,
    "landingPageId" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "ttfbMs" INTEGER,
    "loadMs" INTEGER,
    "formPresent" BOOLEAN NOT NULL DEFAULT false,
    "formSubmitOk" BOOLEAN,
    "pixels" JSONB NOT NULL DEFAULT '{}',
    "detail" TEXT NOT NULL DEFAULT '',
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageCheck_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PageIncident" (
    "id" TEXT NOT NULL,
    "landingPageId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "pauseHeld" BOOLEAN NOT NULL DEFAULT false,
    "summary" TEXT NOT NULL DEFAULT '',
    "openedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "PageIncident_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PageMonitorAlert" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "landingPageId" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "code" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "clientSummary" TEXT NOT NULL DEFAULT '',
    "audience" TEXT NOT NULL DEFAULT 'staff',
    "channels" JSONB NOT NULL DEFAULT '{}',
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "firedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageMonitorAlert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientPageSetting" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "clientKey" TEXT NOT NULL,
    "clientLabel" TEXT NOT NULL DEFAULT '',
    "autoPauseOptIn" BOOLEAN NOT NULL DEFAULT false,
    "clientAlertOptIn" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientPageSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PageWriteCredential" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "clientKey" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "secretRef" TEXT NOT NULL,
    "appSecretRef" TEXT NOT NULL DEFAULT '',
    "extraSecretRef" TEXT NOT NULL DEFAULT '',
    "accountExternalId" TEXT NOT NULL DEFAULT '',
    "loginCustomerId" TEXT NOT NULL DEFAULT '',
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageWriteCredential_pkey" PRIMARY KEY ("id")
);

-- Pause rows survive deletion of the page or the ad so a resume can still be sent.
CREATE TABLE "SystemPausedAd" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "adId" TEXT,
    "landingPageId" TEXT,
    "clientKey" TEXT NOT NULL DEFAULT '',
    "pageUrl" TEXT NOT NULL DEFAULT '',
    "pageName" TEXT NOT NULL DEFAULT '',
    "platform" "AdPlatform" NOT NULL,
    "externalId" TEXT NOT NULL,
    "adGroupExternalId" TEXT NOT NULL DEFAULT '',
    "customerId" TEXT NOT NULL DEFAULT '',
    "accountExternalId" TEXT NOT NULL DEFAULT '',
    "adName" TEXT NOT NULL DEFAULT '',
    "mode" TEXT NOT NULL DEFAULT 'live',
    "pausedAt" TIMESTAMP(3) NOT NULL,
    "resumedAt" TIMESTAMP(3),

    CONSTRAINT "SystemPausedAd_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdPauseAudit" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "adId" TEXT,
    "landingPageId" TEXT,
    "platform" "AdPlatform" NOT NULL,
    "externalId" TEXT NOT NULL,
    "adName" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdPauseAudit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketingClient_workspaceId_name_key" ON "MarketingClient"("workspaceId", "name");
CREATE INDEX "MarketingClient_workspaceId_idx" ON "MarketingClient"("workspaceId");
CREATE INDEX "AdAccount_clientId_idx" ON "AdAccount"("clientId");
CREATE UNIQUE INDEX "LandingPage_workspaceId_url_key" ON "LandingPage"("workspaceId", "url");
CREATE INDEX "LandingPage_workspaceId_clientKey_active_idx" ON "LandingPage"("workspaceId", "clientKey", "active");
CREATE INDEX "PageCheck_landingPageId_checkedAt_idx" ON "PageCheck"("landingPageId", "checkedAt");
CREATE INDEX "PageIncident_landingPageId_status_idx" ON "PageIncident"("landingPageId", "status");
CREATE INDEX "PageMonitorAlert_dedupeKey_firedAt_idx" ON "PageMonitorAlert"("dedupeKey", "firedAt");
CREATE INDEX "PageMonitorAlert_landingPageId_firedAt_idx" ON "PageMonitorAlert"("landingPageId", "firedAt");
CREATE UNIQUE INDEX "ClientPageSetting_workspaceId_clientKey_key" ON "ClientPageSetting"("workspaceId", "clientKey");
CREATE UNIQUE INDEX "PageWriteCredential_workspaceId_clientKey_platform_key" ON "PageWriteCredential"("workspaceId", "clientKey", "platform");
CREATE INDEX "SystemPausedAd_landingPageId_resumedAt_idx" ON "SystemPausedAd"("landingPageId", "resumedAt");
CREATE INDEX "SystemPausedAd_adId_resumedAt_idx" ON "SystemPausedAd"("adId", "resumedAt");
CREATE INDEX "SystemPausedAd_clientKey_resumedAt_idx" ON "SystemPausedAd"("clientKey", "resumedAt");
CREATE INDEX "AdPauseAudit_landingPageId_createdAt_idx" ON "AdPauseAudit"("landingPageId", "createdAt");
CREATE INDEX "AdPauseAudit_createdAt_idx" ON "AdPauseAudit"("createdAt");

ALTER TABLE "AdAccount" ADD CONSTRAINT "AdAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "MarketingClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LandingPage" ADD CONSTRAINT "LandingPage_clientKey_fkey" FOREIGN KEY ("clientKey") REFERENCES "MarketingClient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PageCheck" ADD CONSTRAINT "PageCheck_landingPageId_fkey" FOREIGN KEY ("landingPageId") REFERENCES "LandingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PageIncident" ADD CONSTRAINT "PageIncident_landingPageId_fkey" FOREIGN KEY ("landingPageId") REFERENCES "LandingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PageMonitorAlert" ADD CONSTRAINT "PageMonitorAlert_landingPageId_fkey" FOREIGN KEY ("landingPageId") REFERENCES "LandingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientPageSetting" ADD CONSTRAINT "ClientPageSetting_clientKey_fkey" FOREIGN KEY ("clientKey") REFERENCES "MarketingClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PageWriteCredential" ADD CONSTRAINT "PageWriteCredential_clientKey_fkey" FOREIGN KEY ("clientKey") REFERENCES "MarketingClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SystemPausedAd" ADD CONSTRAINT "SystemPausedAd_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SystemPausedAd" ADD CONSTRAINT "SystemPausedAd_landingPageId_fkey" FOREIGN KEY ("landingPageId") REFERENCES "LandingPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdPauseAudit" ADD CONSTRAINT "AdPauseAudit_landingPageId_fkey" FOREIGN KEY ("landingPageId") REFERENCES "LandingPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

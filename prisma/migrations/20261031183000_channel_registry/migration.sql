-- Config-driven channel and ad platform registry. Off in the app until CHANNEL_REGISTRY=on.

CREATE TABLE "PlatformRegistry" (
    "key" TEXT NOT NULL,
    "staffLabel" TEXT NOT NULL,
    "clientLabel" TEXT NOT NULL,
    "channelType" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "parentKey" TEXT,
    "auth" TEXT NOT NULL,
    "scopesRead" JSONB NOT NULL,
    "writeCapable" BOOLEAN NOT NULL DEFAULT false,
    "writesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "idUpload" JSONB NOT NULL,
    "matchRateSource" TEXT,
    "metrics" JSONB NOT NULL,
    "hierarchy" TEXT NOT NULL DEFAULT '',
    "colourToken" TEXT NOT NULL DEFAULT '#231F20',
    "status" TEXT NOT NULL DEFAULT 'available',
    "aliases" JSONB NOT NULL DEFAULT '[]',
    "contracted" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformRegistry_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "ClientConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "clientId" TEXT NOT NULL,
    "platformKey" TEXT NOT NULL,
    "accountId" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL,
    "lastTestAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "tokenRef" TEXT,
    "writesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientConnection_workspaceId_clientId_platformKey_key" ON "ClientConnection"("workspaceId", "clientId", "platformKey");
CREATE INDEX "ClientConnection_workspaceId_clientId_idx" ON "ClientConnection"("workspaceId", "clientId");

ALTER TABLE "ClientConnection" ADD CONSTRAINT "ClientConnection_platformKey_fkey" FOREIGN KEY ("platformKey") REFERENCES "PlatformRegistry"("key") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PlatformRequest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "docsLink" TEXT NOT NULL DEFAULT '',
    "clientId" TEXT NOT NULL,
    "why" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "decidedBy" TEXT NOT NULL DEFAULT '',
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformRequest_workspaceId_status_idx" ON "PlatformRequest"("workspaceId", "status");

CREATE TABLE "PlatformWriteApproval" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'org',
    "platformKey" TEXT NOT NULL,
    "approver" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformWriteApproval_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformWriteApproval_workspaceId_platformKey_idx" ON "PlatformWriteApproval"("workspaceId", "platformKey");

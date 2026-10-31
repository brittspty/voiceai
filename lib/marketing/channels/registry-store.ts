import type { Prisma, PrismaClient } from "@prisma/client";
import { isolatedWhere } from "../workspace";
import {
  SEED_CONNECTIONS,
  SEED_MATCH_RATES,
  SEED_REGISTRY,
  exampleRegistryState,
  type ClientConnectionRow,
  type PlatformRegistryRow,
  type RegistryState,
} from "./registry";

function registryCreate(row: PlatformRegistryRow): Prisma.PlatformRegistryCreateInput {
  return {
    key: row.key,
    staffLabel: row.staffLabel,
    clientLabel: row.clientLabel,
    channelType: row.channelType,
    vendor: row.vendor,
    parentKey: row.parentKey,
    auth: row.auth,
    scopesRead: row.scopesRead,
    writeCapable: row.writeCapable,
    writesEnabled: row.writesEnabled,
    idUpload: row.idUpload,
    matchRateSource: row.matchRateSource,
    metrics: row.metrics,
    hierarchy: row.hierarchy,
    colourToken: row.colourToken,
    status: row.status,
    aliases: row.aliases,
    contracted: row.contracted,
  };
}

function connectionCreate(row: ClientConnectionRow): Prisma.ClientConnectionCreateInput {
  return {
    workspaceId: "org",
    clientId: row.clientId,
    platform: { connect: { key: row.platformKey } },
    accountId: row.accountId,
    state: row.state,
    lastTestAt: row.lastTestAt ? new Date(row.lastTestAt) : null,
    lastSyncAt: row.lastSyncAt ? new Date(row.lastSyncAt) : null,
    tokenRef: row.tokenRef,
    writesEnabled: false,
    disconnectedAt: row.disconnectedAt ? new Date(row.disconnectedAt) : null,
  };
}

/** Writes the seeded registry. Existing rows are left in place. */
export async function ensureChannelRegistry(db: PrismaClient) {
  for (const row of SEED_REGISTRY) {
    await db.platformRegistry.upsert({
      where: { key: row.key },
      create: registryCreate(row),
      update: {},
    });
  }
  for (const row of SEED_CONNECTIONS) {
    await db.clientConnection.upsert({
      where: {
        workspaceId_clientId_platformKey: { workspaceId: "org", clientId: row.clientId, platformKey: row.platformKey },
      },
      create: connectionCreate(row),
      update: {},
    });
  }
}

export async function readRegistryTables(workspaceId: string): Promise<RegistryState> {
  const { prisma } = await import("../../db");
  const where = isolatedWhere(workspaceId);
  const [registry, connections] = await Promise.all([
    prisma.platformRegistry.findMany({ orderBy: { key: "asc" } }),
    prisma.clientConnection.findMany({ where }),
  ]);
  if (!registry.length) return exampleRegistryState();
  const requests = await prisma.platformRequest.findMany({ where: isolatedWhere(workspaceId) });
  const approvals = await prisma.platformWriteApproval.findMany({ where: isolatedWhere(workspaceId) });
  return {
    registry: registry.map((row) => ({
      key: row.key,
      staffLabel: row.staffLabel,
      clientLabel: row.clientLabel,
      channelType: row.channelType as PlatformRegistryRow["channelType"],
      vendor: row.vendor,
      parentKey: row.parentKey,
      auth: row.auth as PlatformRegistryRow["auth"],
      scopesRead: Array.isArray(row.scopesRead) ? row.scopesRead.map(String) : [],
      writeCapable: row.writeCapable,
      writesEnabled: row.writesEnabled,
      idUpload: row.idUpload as PlatformRegistryRow["idUpload"],
      matchRateSource: row.matchRateSource,
      metrics: Array.isArray(row.metrics) ? row.metrics.map(String) : [],
      hierarchy: row.hierarchy,
      colourToken: row.colourToken,
      status: row.status as PlatformRegistryRow["status"],
      aliases: Array.isArray(row.aliases) ? row.aliases.map(String) : [],
      contracted: row.contracted,
    })),
    connections: connections.map((row) => ({
      clientId: row.clientId,
      platformKey: row.platformKey,
      accountId: row.accountId,
      state: row.state as ClientConnectionRow["state"],
      lastTestAt: row.lastTestAt?.toISOString() ?? null,
      lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
      tokenRef: row.tokenRef,
      writesEnabled: row.writesEnabled,
      disconnectedAt: row.disconnectedAt ? row.disconnectedAt.toISOString().slice(0, 10) : null,
    })),
    requests: requests.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category as RegistryState["requests"][number]["category"],
      docsLink: row.docsLink,
      clientId: row.clientId,
      why: row.why,
      status: row.status as RegistryState["requests"][number]["status"],
      decidedBy: row.decidedBy,
      createdAt: row.createdAt.toISOString(),
    })),
    approvals: approvals.map((row) => ({ platformKey: row.platformKey, approver: row.approver, at: row.createdAt.toISOString() })),
    matchRates: { ...SEED_MATCH_RATES },
  };
}

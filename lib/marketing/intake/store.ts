import { prisma } from "../../db";
import { isolatedWhere } from "../workspace";

export async function listIntakeSources(workspaceId: string) {
  return prisma.intakeSource.findMany({ where: isolatedWhere(workspaceId), orderBy: { createdAt: "desc" } });
}

export async function findIntakeKey(workspaceId: string, keyId: string) {
  return prisma.intakeKey.findFirst({ where: isolatedWhere(workspaceId, { keyId, revokedAt: null }) });
}

export async function findIntakeBatch(workspaceId: string, sourceId: string, idempotencyKey: string) {
  return prisma.intakeBatch.findFirst({ where: isolatedWhere(workspaceId, { sourceId, idempotencyKey }) });
}

export async function listIntakeRows(workspaceId: string, batchId: string) {
  return prisma.intakeRow.findMany({ where: isolatedWhere(workspaceId, { batchId }) });
}

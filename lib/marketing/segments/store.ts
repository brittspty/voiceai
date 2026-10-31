import { prisma } from "../../db";
import { isolatedWhere } from "../workspace";

export async function listSegments(workspaceId: string, clientKey = "") {
  return prisma.segment.findMany({ where: isolatedWhere(workspaceId, { clientKey }), orderBy: { name: "asc" } });
}

export async function listSubSegments(workspaceId: string, segmentKey: string) {
  return prisma.subSegment.findMany({ where: isolatedWhere(workspaceId, { segmentKey }) });
}

export async function listLineage(workspaceId: string, audienceKey: string) {
  return prisma.segmentLineage.findMany({ where: isolatedWhere(workspaceId, { audienceKey }) });
}

export async function listSegmentTests(workspaceId: string) {
  return prisma.segmentTest.findMany({ where: isolatedWhere(workspaceId), include: { arms: true } });
}

export async function listSegmentDecisions(workspaceId: string) {
  return prisma.segmentDecision.findMany({ where: isolatedWhere(workspaceId), orderBy: { createdAt: "desc" } });
}

export async function getSegmentSettings(workspaceId: string, clientKey = "") {
  return prisma.segmentEngineConfig.findFirst({ where: isolatedWhere(workspaceId, { clientKey }) });
}

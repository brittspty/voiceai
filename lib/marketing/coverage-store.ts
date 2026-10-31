import { prisma } from "../db";
import { isolatedWhere } from "./workspace";

export async function latestCoverage(workspaceId: string, campaignId = "") {
  return prisma.coverageSnapshot.findFirst({
    where: isolatedWhere(workspaceId, { campaignId }),
    orderBy: { computedAt: "desc" },
  });
}

export async function listRecommendationDrivers(workspaceId: string, recommendationId: string) {
  return prisma.recommendationDriver.findMany({ where: isolatedWhere(workspaceId, { recommendationId }) });
}

export async function learningConsent(workspaceId: string, clientKey = "") {
  return prisma.learningConsent.findFirst({ where: isolatedWhere(workspaceId, { clientKey }) });
}

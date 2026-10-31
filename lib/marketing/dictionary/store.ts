import { prisma } from "../../db";
import { isolatedWhere } from "../workspace";
import type { MetricBenchmarks } from "./catalog";

export async function listMetricDefinitions(workspaceId: string) {
  return prisma.metricDefinition.findMany({ where: isolatedWhere(workspaceId), orderBy: { metricKey: "asc" } });
}

export async function saveMetricBenchmark(workspaceId: string, metricKey: string, benchmarks: MetricBenchmarks) {
  const scope = isolatedWhere(workspaceId);
  return prisma.metricDefinition.upsert({
    where: { workspaceId_metricKey: { workspaceId: scope.workspaceId, metricKey } },
    create: { ...scope, metricKey, benchmarks },
    update: { benchmarks },
  });
}

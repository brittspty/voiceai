/**
 * Fold ad_alert:* recommendations into the matching metric row.
 * One item per ad, metric, and window.
 * Dry run is the default. Pass --apply to archive the duplicate alerts.
 * Rows a person already decided are kept. Nothing is deleted.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { planDuplicatePairs, type PairRow } from "../lib/marketing/decisions/fold";

const apply = process.argv.includes("--apply");

function day(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function evidenceOf(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

async function main() {
  const recommendations = await prisma.recommendation.findMany({
    where: { archivedAt: null },
    select: {
      id: true,
      rule: true,
      metric: true,
      adId: true,
      status: true,
      evidence: true,
      windowStart: true,
      windowEnd: true,
      createdAt: true,
      decidedById: true,
      decidedAt: true,
      snoozedUntil: true,
    },
  });
  const rows: PairRow[] = recommendations.map((row) => ({
    id: row.id,
    rule: row.rule,
    metric: row.metric,
    adId: row.adId,
    windowStart: day(row.windowStart),
    windowEnd: day(row.windowEnd),
    status: row.status,
    decidedById: row.decidedById,
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    snoozedUntil: row.snoozedUntil ? row.snoozedUntil.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    evidence: evidenceOf(row.evidence),
  }));
  const plan = planDuplicatePairs(rows, { apply });
  console.log(JSON.stringify({
    dryRun: plan.dryRun,
    deletes: plan.deletes,
    archive: plan.archive.length,
    update: plan.updates.length,
  }, null, 2));
  if (!apply) {
    console.log("Dry run. Nothing was written. Pass --apply to archive duplicate pairs.");
    return;
  }
  const now = new Date();
  for (const update of plan.updates) {
    await prisma.recommendation.update({
      where: { id: update.id },
      data: { evidence: update.evidence as Prisma.InputJsonValue },
    });
  }
  if (plan.archive.length) {
    await prisma.recommendation.updateMany({
      where: { id: { in: plan.archive } },
      data: { archivedAt: now },
    });
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Archive failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

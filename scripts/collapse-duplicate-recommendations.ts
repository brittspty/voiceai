/**
 * One-off cleanup for duplicate Recommendation and AdAlert rows.
 * Dry run is the default. Pass --apply to archive duplicates.
 * Keeps the newest row per key. Rows with a human decision are kept.
 * Nothing is deleted. Do not pass --apply without Jason's OK.
 */
import { prisma } from "../lib/db";
import { planCollapse, type CollapseRow } from "../lib/marketing/decisions/collapse";
import { alertDedupeKey, recommendationDedupeKey, ruleFromEvidence } from "../lib/marketing/decisions/key";

const apply = process.argv.includes("--apply");

function iso(value: Date) {
  return value.toISOString();
}

async function main() {
  const recommendations = await prisma.recommendation.findMany({
    where: { archivedAt: null },
    select: {
      id: true,
      type: true,
      status: true,
      metric: true,
      rule: true,
      dedupeKey: true,
      clientId: true,
      campaignId: true,
      adId: true,
      evidence: true,
      createdAt: true,
      decidedById: true,
      decidedAt: true,
      snoozedUntil: true,
      campaign: { select: { clientId: true, adAccount: { select: { clientId: true } } } },
      adAccount: { select: { clientId: true } },
    },
  });
  const recommendationRows: CollapseRow[] = recommendations.map((row) => {
    const clientId = row.clientId || row.campaign?.clientId || row.campaign?.adAccount.clientId || row.adAccount?.clientId || "";
    const rule = row.rule || ruleFromEvidence(row.evidence, row.metric || row.type);
    const dedupeKey = row.dedupeKey || recommendationDedupeKey({
      type: row.type,
      clientId,
      campaignId: row.campaignId || "",
      adId: row.adId || "",
      rule,
    });
    return {
      id: row.id,
      dedupeKey,
      createdAt: iso(row.createdAt),
      status: row.status,
      decidedById: row.decidedById,
      decidedAt: row.decidedAt ? iso(row.decidedAt) : null,
      snoozedUntil: row.snoozedUntil ? iso(row.snoozedUntil) : null,
    };
  });
  const recommendationPlan = planCollapse(recommendationRows, { apply });

  const alerts = await prisma.adAlert.findMany({
    where: { archivedAt: null },
    select: { id: true, adId: true, code: true, dedupeKey: true, createdAt: true },
  });
  const alertRows: CollapseRow[] = alerts.map((row) => ({
    id: row.id,
    dedupeKey: row.dedupeKey || alertDedupeKey(row.adId, row.code),
    createdAt: iso(row.createdAt),
    status: "verified",
    decidedById: null,
    decidedAt: null,
  }));
  const alertPlan = planCollapse(alertRows, { apply });

  const summary = {
    dryRun: !apply,
    deletes: 0,
    recommendations: { keep: recommendationPlan.keep.length, archive: recommendationPlan.archive.length },
    alerts: { keep: alertPlan.keep.length, archive: alertPlan.archive.length },
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!apply) {
    console.log("Dry run. Nothing was written. Pass --apply only after Jason's OK.");
    return;
  }
  const now = new Date();
  const keyById = new Map(recommendationRows.map((row) => [row.id, row.dedupeKey]));
  for (const row of recommendations) {
    const dedupeKey = keyById.get(row.id) || "";
    const clientId = row.clientId || row.campaign?.clientId || row.campaign?.adAccount.clientId || row.adAccount?.clientId || null;
    const rule = row.rule || ruleFromEvidence(row.evidence, row.metric || row.type);
    if (!row.dedupeKey || !row.clientId || !row.rule) {
      await prisma.recommendation.update({
        where: { id: row.id },
        data: { dedupeKey, clientId, rule },
      });
    }
  }
  if (recommendationPlan.archive.length) {
    await prisma.recommendation.updateMany({
      where: { id: { in: recommendationPlan.archive } },
      data: { archivedAt: now },
    });
  }
  const alertKey = new Map(alertRows.map((row) => [row.id, row.dedupeKey]));
  for (const row of alerts) {
    if (row.dedupeKey) continue;
    await prisma.adAlert.update({ where: { id: row.id }, data: { dedupeKey: alertKey.get(row.id) || alertDedupeKey(row.adId, row.code) } });
  }
  if (alertPlan.archive.length) {
    await prisma.adAlert.updateMany({
      where: { id: { in: alertPlan.archive } },
      data: { archivedAt: now },
    });
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Collapse failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

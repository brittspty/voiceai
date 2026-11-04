/**
 * Re-check open monitor recommendations against the current thresholds.
 * Reads stored daily metrics only. Does not call an ad platform.
 * Dry run is the default.
 * --apply also needs --guard <file>. The guard runs the write once:
 * after a successful apply its first line is "applied".
 * Rows a person decided are not touched. Nothing is deleted.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { verticalBenchmarks } from "../lib/marketing/config";
import { appliedGuardText, guardState, planRecheck, RECHECK_REASON, type RecheckRecommendation } from "../lib/marketing/decisions/recheck";
import { WORKSPACE_ID } from "../lib/marketing/types";
import type { MetricPoint } from "../lib/marketing/monitor";
import { addDaysISO, zonedISODate } from "../lib/time";

const apply = process.argv.includes("--apply");
const guardFlag = process.argv.indexOf("--guard");
const guardPath = guardFlag >= 0 ? process.argv[guardFlag + 1] || "" : "";

function dayString(value: Date) {
  return value.toISOString().slice(0, 10);
}

function num(value: { toString(): string } | number | bigint | null | undefined) {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

function evidenceOf(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readGuard(path: string) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

async function main() {
  const org = await prisma.org.findUnique({ where: { id: "org" }, select: { timezone: true } });
  const today = zonedISODate(new Date(), org?.timezone || "America/New_York");
  const since = new Date(`${addDaysISO(today, -120)}T00:00:00.000Z`);
  const [recommendations, metrics] = await Promise.all([
    prisma.recommendation.findMany({
      where: { workspaceId: WORKSPACE_ID, archivedAt: null, status: { in: ["draft", "verified"] } },
      select: {
        id: true,
        type: true,
        rule: true,
        metric: true,
        status: true,
        severity: true,
        adId: true,
        clientId: true,
        evidence: true,
        decidedById: true,
        decidedAt: true,
        snoozedUntil: true,
        archivedAt: true,
        client: { select: { name: true } },
        campaign: { select: { clientId: true, client: { select: { name: true } } } },
      },
    }),
    prisma.dailyMetric.findMany({
      where: { workspaceId: WORKSPACE_ID, date: { gte: since } },
      select: {
        id: true,
        date: true,
        adId: true,
        adGroupId: true,
        campaignId: true,
        impressions: true,
        clicks: true,
        linkClicks: true,
        reach: true,
        spend: true,
        platformLeads: true,
        platformConversions: true,
        conversionValue: true,
        ingestedAt: true,
        ad: { select: { name: true } },
        campaign: { select: { name: true, objective: true, adAccountId: true } },
      },
    }),
  ]);
  const rows: RecheckRecommendation[] = recommendations.map((row) => {
    const evidence = evidenceOf(row.evidence);
    const fromEvidence = typeof evidence.code === "string" ? evidence.code : typeof evidence.rule === "string" ? evidence.rule : "";
    return {
      id: row.id,
      clientId: row.clientId || row.campaign?.clientId || "",
      clientName: row.client?.name || row.campaign?.client?.name || "Unassigned",
      type: row.type,
      rule: row.rule || fromEvidence || row.metric,
      status: row.status,
      severity: row.severity,
      adId: row.adId,
      decidedById: row.decidedById,
      decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
      snoozedUntil: row.snoozedUntil ? row.snoozedUntil.toISOString() : null,
      archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    };
  });
  const points: MetricPoint[] = metrics.flatMap((row) => {
    if (!row.campaign) return [];
    return [{
      id: row.id,
      adId: row.adId,
      adName: row.ad.name,
      adGroupId: row.adGroupId || "",
      campaignId: row.campaignId || "",
      adAccountId: row.campaign.adAccountId,
      objective: row.campaign.objective,
      campaignName: row.campaign.name,
      date: dayString(row.date),
      ingestedAt: row.ingestedAt.toISOString(),
      spend: num(row.spend),
      impressions: num(row.impressions),
      clicks: num(row.clicks),
      linkClicks: num(row.linkClicks),
      reach: num(row.reach),
      leads: num(row.platformLeads),
      conversions: num(row.platformConversions),
      conversionValue: num(row.conversionValue),
    }];
  });
  const plan = planRecheck({ rows, metrics: points, today, benchmarks: verticalBenchmarks(), apply });
  console.log(JSON.stringify({
    dryRun: !apply,
    windowDays: 7,
    clients: plan.clients,
    rules: plan.rules,
  }, null, 2));
  if (!apply) {
    console.log("Dry run. Nothing was written. Pass --apply --guard <file> to archive rows that no longer qualify.");
    return;
  }
  if (!guardPath) {
    console.error("Pass --guard <file> with --apply. Nothing was written.");
    process.exitCode = 1;
    return;
  }
  const guard = guardState(readGuard(guardPath));
  if (guard === "missing") {
    console.error("Guard file is missing. Nothing was written.");
    process.exitCode = 1;
    return;
  }
  if (guard === "used") {
    console.log("This recheck already ran. Nothing was written.");
    return;
  }
  const now = new Date();
  const evidenceById = new Map(recommendations.map((row) => [row.id, evidenceOf(row.evidence)]));
  for (const item of plan.archive) {
    const evidence = { ...evidenceById.get(item.id), archiveReason: RECHECK_REASON } as Prisma.InputJsonValue;
    await prisma.recommendation.updateMany({
      where: {
        id: item.id,
        archivedAt: null,
        decidedById: null,
        decidedAt: null,
        snoozedUntil: null,
        status: { in: ["draft", "verified"] },
      },
      data: { archivedAt: now, evidence },
    });
  }
  for (const item of plan.severity) {
    await prisma.recommendation.updateMany({
      where: {
        id: item.id,
        archivedAt: null,
        decidedById: null,
        decidedAt: null,
        snoozedUntil: null,
        status: { in: ["draft", "verified"] },
      },
      data: { severity: item.severity },
    });
  }
  writeFileSync(guardPath, appliedGuardText(now.toISOString()));
  console.log(`Applied. Archived ${plan.archive.length} with reason ${RECHECK_REASON}. Updated severity on ${plan.severity.length}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Recheck failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

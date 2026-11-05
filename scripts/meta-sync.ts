import { parseMetaSyncArgs, metaSyncHelp } from "../lib/marketing/cli-args";
import { lookbackDays, planMetaReads, routeMetaAccounts } from "../lib/marketing/config";
import { ASYNC_INSIGHTS_AFTER_DAYS, inclusiveDays, pullMetaSnapshot } from "../lib/marketing/connectors/meta";
import { redactSecrets } from "../lib/marketing/connectors/meta-client";
import { mergeSnapshots } from "../lib/marketing/connectors/meta-map";
import type { NormalizedSnapshot } from "../lib/marketing/types";
import { addDaysISO, zonedISODate } from "../lib/time";

type Counts = Record<string, number>;

function pulledCounts(snapshot: {
  accounts: unknown[];
  campaigns: unknown[];
  adGroups: unknown[];
  ads: unknown[];
  creatives: { conceptKey: string }[];
  audiences: unknown[];
  adGroupAudiences: unknown[];
  segments: unknown[];
  metrics: unknown[];
  raw: unknown[];
}): Counts {
  return {
    AdAccount: snapshot.accounts.length,
    Campaign: snapshot.campaigns.length,
    AdGroup: snapshot.adGroups.length,
    Ad: snapshot.ads.length,
    Creative: new Set(snapshot.creatives.map((row) => row.conceptKey)).size,
    CreativeVersion: snapshot.creatives.length,
    Audience: snapshot.audiences.length,
    AdGroupAudience: snapshot.adGroupAudiences.length,
    AudienceSegment: snapshot.segments.length,
    DailyMetric: snapshot.metrics.length,
    MarketingRawRecord: snapshot.raw.length,
  };
}

async function databaseCounts(): Promise<Counts> {
  const { prisma } = await import("../lib/db");
  const [
    PlatformConnection,
    AdAccount,
    Campaign,
    AdGroup,
    Ad,
    Creative,
    CreativeVersion,
    Audience,
    AdGroupAudience,
    AudienceSegment,
    DailyMetric,
    MarketingRawRecord,
    MarketingSyncRun,
  ] = await Promise.all([
    prisma.platformConnection.count(),
    prisma.adAccount.count(),
    prisma.campaign.count(),
    prisma.adGroup.count(),
    prisma.ad.count(),
    prisma.creative.count(),
    prisma.creativeVersion.count(),
    prisma.audience.count(),
    prisma.adGroupAudience.count(),
    prisma.audienceSegment.count(),
    prisma.dailyMetric.count(),
    prisma.marketingRawRecord.count(),
    prisma.marketingSyncRun.count(),
  ]);
  return {
    PlatformConnection,
    AdAccount,
    Campaign,
    AdGroup,
    Ad,
    Creative,
    CreativeVersion,
    Audience,
    AdGroupAudience,
    AudienceSegment,
    DailyMetric,
    MarketingRawRecord,
    MarketingSyncRun,
  };
}

async function main() {
  const args = parseMetaSyncArgs(process.argv.slice(2));
  if (args.help) {
    console.log(metaSyncHelp());
    return;
  }
  if (args.error) {
    console.error(args.error);
    console.error(metaSyncHelp());
    process.exitCode = 1;
    return;
  }

  const env = { ...process.env };
  if (args.days) env.MARKETING_LOOKBACK_DAYS = String(args.days);
  env.MARKETING_SYNC_MODE = "live";

  const plan = planMetaReads(env);
  if (plan.action !== "live") {
    console.error(plan.reason || "Meta sync did not start");
    process.exitCode = 1;
    return;
  }
  const routed = routeMetaAccounts(plan, { accounts: args.accounts, connection: args.connection });
  if (!routed.ok) {
    console.error(routed.reason);
    process.exitCode = 1;
    return;
  }
  if (!routed.pulls.length) {
    console.error("No ad accounts. Pass --account act_... or set META_AD_ACCOUNT_IDS.");
    process.exitCode = 1;
    return;
  }
  if (!args.dryRun && !env.DATABASE_URL?.trim()) {
    console.error("DATABASE_URL is required unless you pass --dry-run.");
    process.exitCode = 1;
    return;
  }

  const days = lookbackDays(env);
  const timeZone = "America/New_York";
  const until = zonedISODate(new Date(), timeZone);
  const since = addDaysISO(until, -(days - 1));
  const insights = inclusiveDays(since, until) > ASYNC_INSIGHTS_AFTER_DAYS ? "async" : "sync";
  for (const row of routed.skipped) console.error(`Meta connection ${row.name} skipped: ${row.reason}`);
  for (const warning of routed.warnings) console.error(warning);

  const parts: NormalizedSnapshot[] = [];
  const failures: string[] = [];
  for (const pull of routed.pulls) {
    console.error(
      `Meta read ${pull.name} ${pull.accountIds.join(", ")} ${since}..${until} insights=${insights}${args.dryRun ? " dry-run" : ""}`,
    );
    try {
      const pulled = await pullMetaSnapshot({
        accountIds: pull.accountIds,
        accessToken: pull.accessToken,
        appSecret: pull.appSecret,
        graphVersion: plan.graphVersion,
        since,
        until,
        attributionWindows: plan.attributionWindows,
      });
      parts.push(pulled.snapshot);
      failures.push(...pulled.failures);
    } catch (error) {
      const message = redactSecrets(error instanceof Error ? error.message : "Meta sync failed", [pull.accessToken, pull.appSecret]);
      failures.push(`${pull.name}: ${message}`);
    }
  }
  const snapshot = mergeSnapshots(parts);
  const accountIds = routed.pulls.flatMap((pull) => pull.accountIds);

  const report: Record<string, unknown> = {
    dryRun: args.dryRun,
    since,
    until,
    insights,
    accountsRequested: accountIds,
    connections: routed.pulls.map((pull) => ({ name: pull.name, accountIds: pull.accountIds })),
    skipped: routed.skipped.map((row) => ({ name: row.name, reason: row.reason })),
    errors: failures,
    warnings: [...routed.warnings, ...snapshot.warnings.filter((warning) => !warning.startsWith("Account pull failed"))],
    pulled: pulledCounts(snapshot),
  };

  if (!args.dryRun && snapshot.accounts.length) {
    const { runMarketingSync } = await import("../lib/marketing/sync");
    const written = await runMarketingSync({
      env,
      timezone: timeZone,
      snapshot,
    });
    report.status = written.status;
    if (written.error) report.errors = [...failures, written.error];
    report.database = await databaseCounts();
    const { prisma } = await import("../lib/db");
    await prisma.$disconnect();
  } else if (!args.dryRun) {
    report.status = "failed";
    report.database = await databaseCounts();
    const { prisma } = await import("../lib/db");
    await prisma.$disconnect();
  }

  console.log(JSON.stringify(report, null, 2));
  if (failures.length || report.status === "failed") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

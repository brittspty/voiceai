import { parseMetaSyncArgs, metaSyncHelp } from "../lib/marketing/cli-args";
import { attributionWindows, decideSync, lookbackDays } from "../lib/marketing/config";
import { ASYNC_INSIGHTS_AFTER_DAYS, inclusiveDays, pullMetaSnapshot } from "../lib/marketing/connectors/meta";
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
  if (args.accounts.length) env.META_AD_ACCOUNT_IDS = args.accounts.join(",");
  if (args.days) env.MARKETING_LOOKBACK_DAYS = String(args.days);
  env.MARKETING_SYNC_MODE = "live";

  const decision = decideSync(env);
  if (decision.action !== "live") {
    console.error(decision.action === "skip" ? decision.reason : "Meta sync did not start");
    process.exitCode = 1;
    return;
  }
  const accountIds = args.accounts.length ? args.accounts : decision.accountIds;
  if (!accountIds.length) {
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
  console.error(`Meta read ${accountIds.join(", ")} ${since}..${until} insights=${insights}${args.dryRun ? " dry-run" : ""}`);

  const pulled = await pullMetaSnapshot({
    accountIds,
    accessToken: decision.accessToken,
    appSecret: decision.appSecret,
    graphVersion: decision.graphVersion,
    since,
    until,
    attributionWindows: attributionWindows(env),
  });

  const report: Record<string, unknown> = {
    dryRun: args.dryRun,
    since,
    until,
    insights,
    accountsRequested: accountIds,
    errors: pulled.failures,
    warnings: pulled.snapshot.warnings.filter((warning) => !warning.startsWith("Account pull failed")),
    pulled: pulledCounts(pulled.snapshot),
  };

  if (!args.dryRun && pulled.snapshot.accounts.length) {
    const { runMarketingSync } = await import("../lib/marketing/sync");
    const written = await runMarketingSync({
      env,
      timezone: timeZone,
      snapshot: pulled.snapshot,
    });
    report.status = written.status;
    if (written.error) report.errors = [...pulled.failures, written.error];
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
  if (pulled.failures.length || report.status === "failed") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

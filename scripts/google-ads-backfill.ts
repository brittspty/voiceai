/**
 * Read-only Google Ads backfill. Pulls only customer ids mapped to a client with live read on.
 * A request needs MARKETING_GOOGLE_ADS=on and MARKETING_SYNC_MODE=live, or auto with OAuth credentials.
 * INTEGRATIONS_MODE is not consulted. A developer token is optional. --days is required and cannot be above 90.
 * Secrets are never printed.
 *   tsx scripts/google-ads-backfill.ts --days 30
 */
import { prisma } from "../lib/db";
import { parseLookbackArg, MAX_LOOKBACK_DAYS, googleAdsLiveRead } from "../lib/marketing/config";
import { redactGoogleSecrets } from "../lib/marketing/connectors/google-ads-client";
import { runGoogleAdsSync } from "../lib/marketing/google-sync";

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? "" : "";
}

function secrets() {
  return [process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "", process.env.GOOGLE_ADS_CLIENT_SECRET || "", process.env.GOOGLE_ADS_REFRESH_TOKEN || ""];
}

async function main() {
  const days = parseLookbackArg(arg("days"));
  if (!days) throw new Error(`--days must be a whole number from 1 to ${MAX_LOOKBACK_DAYS}`);
  const gate = googleAdsLiveRead(process.env);
  if (!gate.ok) throw new Error(gate.reason);
  const result = await runGoogleAdsSync({
    env: { ...process.env, MARKETING_LOOKBACK_DAYS: String(days) },
    lookbackDays: days,
  });
  if (result.status === "skipped") throw new Error(result.reason || "Google Ads sync skipped");
  const line = JSON.stringify({
    status: result.status,
    reason: result.reason,
    error: result.error,
    mode: result.mode,
    rowsWritten: result.rowsWritten,
    since: result.since,
    until: result.until,
    days,
  });
  const hidden = redactGoogleSecrets(line, secrets());
  if (hidden !== line) throw new Error("Refusing to print a result that contained a Google Ads secret.");
  console.log(line);
}

main()
  .catch((error) => {
    console.error(redactGoogleSecrets(error instanceof Error ? error.message : "Google Ads backfill failed", secrets()));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

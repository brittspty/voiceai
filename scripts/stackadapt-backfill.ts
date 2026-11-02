/**
 * Read-only StackAdapt backfill. Pulls only advertisers mapped to a client with live read on.
 * A request needs STACKADAPT_SYNC=on and MARKETING_SYNC_MODE=live, or auto with STACKADAPT_API_KEY.
 * INTEGRATIONS_MODE is not consulted. --days is required and cannot be above 90. The API key is never printed.
 *   tsx scripts/stackadapt-backfill.ts --days 30
 */
import { prisma } from "../lib/db";
import { parseLookbackArg, MAX_LOOKBACK_DAYS, stackAdaptLiveRead } from "../lib/marketing/config";
import { redactStackAdaptSecrets } from "../lib/marketing/connectors/stackadapt-client";
import { runStackAdaptSync } from "../lib/marketing/stackadapt-sync";

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? "" : "";
}

async function main() {
  const days = parseLookbackArg(arg("days"));
  if (!days) throw new Error(`--days must be a whole number from 1 to ${MAX_LOOKBACK_DAYS}`);
  const gate = stackAdaptLiveRead(process.env);
  if (!gate.ok) throw new Error(gate.reason);
  const result = await runStackAdaptSync({ env: { ...process.env, MARKETING_LOOKBACK_DAYS: String(days) } });
  if (result.status === "skipped") throw new Error("reason" in result ? result.reason : "StackAdapt sync skipped");
  const line = JSON.stringify({
    status: result.status,
    reason: "reason" in result ? result.reason : undefined,
    mode: "mode" in result ? result.mode : undefined,
    rowsWritten: "rowsWritten" in result ? result.rowsWritten : undefined,
    since: "since" in result ? result.since : undefined,
    until: "until" in result ? result.until : undefined,
    days,
  });
  const key = process.env.STACKADAPT_API_KEY || "";
  if (key && line.includes(key)) throw new Error("Refusing to print a result that contained the API key.");
  console.log(line);
}

main()
  .catch((error) => {
    console.error(redactStackAdaptSecrets(error instanceof Error ? error.message : "StackAdapt backfill failed", [process.env.STACKADAPT_API_KEY || ""]));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

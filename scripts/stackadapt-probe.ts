/**
 * Read-only StackAdapt probe. Prints campaign count, the date range, and impression, click, and conversion totals.
 * A request needs STACKADAPT_SYNC=on, MARKETING_SYNC_MODE=live or auto with a key, and that advertiser on a client
 * with stackadaptLiveRead on. INTEGRATIONS_MODE is not consulted. Nothing is written. The API key is never printed.
 *   tsx scripts/stackadapt-probe.ts --advertiser 1001 [--days 7]
 */
import { prisma } from "../lib/db";
import { liveStackAdaptAdvertiserIds } from "../lib/marketing/client-campaign-scope";
import { parseLookbackArg, MAX_LOOKBACK_DAYS, stackAdaptLiveRead } from "../lib/marketing/config";
import { pullStackAdaptBundle, redactStackAdaptSecrets, stackAdaptProbeSummary } from "../lib/marketing/connectors/stackadapt-client";
import { WORKSPACE_ID } from "../lib/marketing/types";
import { addDaysISO, zonedISODate } from "../lib/time";

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? "" : "";
}

async function main() {
  const advertiserId = arg("advertiser").trim();
  if (!/^\d+$/.test(advertiserId)) throw new Error("--advertiser must be a numeric id");
  const days = parseLookbackArg(arg("days") || "7");
  if (!days) throw new Error(`--days must be a whole number from 1 to ${MAX_LOOKBACK_DAYS}`);
  const gate = stackAdaptLiveRead(process.env);
  if (!gate.ok) throw new Error(gate.reason);
  const rules = await prisma.marketingClient.findMany({
    where: { workspaceId: WORKSPACE_ID },
    select: { id: true, stackadaptAdvertiserIds: true, stackadaptLiveRead: true },
  });
  if (!liveStackAdaptAdvertiserIds(rules).includes(advertiserId)) {
    throw new Error("That advertiser is not mapped to a client with StackAdapt live read on.");
  }
  const to = zonedISODate(new Date(), "America/New_York");
  const from = addDaysISO(to, -(days - 1));
  const bundle = await pullStackAdaptBundle({ apiKey: gate.apiKey, from, to, advertiserId });
  const summary = stackAdaptProbeSummary(bundle, { advertiserId, from, to });
  const line = JSON.stringify({ ...summary, warnings: bundle.warnings });
  if (line.includes(gate.apiKey)) throw new Error("Refusing to print a response that contained the API key.");
  console.log(line);
}

main()
  .catch((error) => {
    console.error(redactStackAdaptSecrets(error instanceof Error ? error.message : "StackAdapt probe failed", [process.env.STACKADAPT_API_KEY || ""]));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

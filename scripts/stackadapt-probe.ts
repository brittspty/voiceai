/**
 * Read-only StackAdapt probe. Prints campaign count, the date range, and impression, click, and conversion totals.
 * Nothing is written. The API key is never printed.
 *   tsx scripts/stackadapt-probe.ts --advertiser 1001 [--days 7]
 */
import { parseLookbackArg, MAX_LOOKBACK_DAYS } from "../lib/marketing/config";
import { pullStackAdaptBundle, redactStackAdaptSecrets, stackAdaptProbeSummary } from "../lib/marketing/connectors/stackadapt-client";
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
  const apiKey = (process.env.STACKADAPT_API_KEY || "").trim();
  if (!apiKey) throw new Error("STACKADAPT_API_KEY is empty");
  const to = zonedISODate(new Date(), "America/New_York");
  const from = addDaysISO(to, -(days - 1));
  const bundle = await pullStackAdaptBundle({ apiKey, from, to, advertiserId });
  const summary = stackAdaptProbeSummary(bundle, { advertiserId, from, to });
  const line = JSON.stringify({ ...summary, warnings: bundle.warnings });
  if (line.includes(apiKey)) throw new Error("Refusing to print a response that contained the API key.");
  console.log(line);
}

main().catch((error) => {
  console.error(redactStackAdaptSecrets(error instanceof Error ? error.message : "StackAdapt probe failed", [process.env.STACKADAPT_API_KEY || ""]));
  process.exit(1);
});

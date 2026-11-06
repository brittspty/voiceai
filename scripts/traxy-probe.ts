/**
 * Read-only Traxy probe. Prints a lead count and the date range seen on the first pages.
 * A request needs TRAXY_SYNC=on and MARKETING_SYNC_MODE=live or auto with a key.
 * INTEGRATIONS_MODE is not consulted. Nothing is written. The API key is never printed.
 *   tsx scripts/traxy-probe.ts [--connection primary]
 */
import { probeKey, probeTraxy, publicProbeLine } from "../lib/marketing/prospects/probe";
import { redactProspectSecrets } from "../lib/marketing/prospects/guard";

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? "" : "";
}

async function main() {
  const connection = arg("connection") || "primary";
  const gate = probeKey(process.env, "traxy", connection);
  if (!gate.ok) throw new Error(gate.reason);
  const summary = await probeTraxy({ apiKey: gate.apiKey, connection: gate.name });
  console.log(publicProbeLine(summary, [gate.apiKey]));
}

main().catch((error) => {
  console.error(redactProspectSecrets(error instanceof Error ? error.message : "Traxy probe failed", [process.env.TRAXY_API_KEY || ""]));
  process.exitCode = 1;
});

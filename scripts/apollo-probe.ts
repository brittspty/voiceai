/**
 * Read-only Apollo probe. Prints a contact count and the created-at range.
 * Uses the credit-free contacts search. A request needs APOLLO_SYNC=on and MARKETING_SYNC_MODE=live or auto with a key.
 * INTEGRATIONS_MODE is not consulted. Nothing is written. The API key is never printed.
 *   tsx scripts/apollo-probe.ts [--connection primary] [--lists id,id]
 */
import { redactProspectSecrets } from "../lib/marketing/prospects/guard";
import { probeApollo, probeKey, publicProbeLine } from "../lib/marketing/prospects/probe";

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? "" : "";
}

async function main() {
  const connection = arg("connection") || "primary";
  const lists = process.argv.includes("--lists") ? arg("lists").split(",").map((item) => item.trim()).filter(Boolean) : [];
  const gate = probeKey(process.env, "apollo", connection);
  if (!gate.ok) throw new Error(gate.reason);
  const summary = await probeApollo({ apiKey: gate.apiKey, connection: gate.name, listIds: lists });
  console.log(publicProbeLine(summary, [gate.apiKey]));
}

main().catch((error) => {
  console.error(redactProspectSecrets(error instanceof Error ? error.message : "Apollo probe failed", [process.env.APOLLO_API_KEY || ""]));
  process.exitCode = 1;
});

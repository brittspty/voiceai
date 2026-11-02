/**
 * Read-only Google Ads probe. Prints campaign count plus impression, click, and cost totals.
 * A request needs MARKETING_GOOGLE_ADS=on, MARKETING_SYNC_MODE=live or auto with OAuth credentials,
 * and that customer id on a client with googleAdsLiveRead on. INTEGRATIONS_MODE is not consulted.
 * A developer token is optional. Nothing is written. Secrets are never printed.
 *   tsx scripts/google-ads-probe.ts --customer 1234567890 [--days 7]
 */
import { prisma } from "../lib/db";
import { googleAdsCustomersToRead } from "../lib/marketing/client-campaign-scope";
import { parseLookbackArg, MAX_LOOKBACK_DAYS, googleAdsLiveRead, normalizeCustomerId } from "../lib/marketing/config";
import { pullGoogleAdsSnapshot } from "../lib/marketing/connectors/google-ads";
import { redactGoogleSecrets } from "../lib/marketing/connectors/google-ads-client";
import { googleAdsProbeSummary } from "../lib/marketing/connectors/google-ads-map";
import { WORKSPACE_ID } from "../lib/marketing/types";
import { addDaysISO, zonedISODate } from "../lib/time";

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? "" : "";
}

function secrets(extra: string[] = []) {
  return [process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "", process.env.GOOGLE_ADS_CLIENT_SECRET || "", process.env.GOOGLE_ADS_REFRESH_TOKEN || "", ...extra];
}

async function main() {
  const customerId = normalizeCustomerId(arg("customer"));
  if (!customerId) throw new Error("--customer must be a 10-digit id");
  const days = parseLookbackArg(arg("days") || "7");
  if (!days) throw new Error(`--days must be a whole number from 1 to ${MAX_LOOKBACK_DAYS}`);
  const gate = googleAdsLiveRead(process.env);
  if (!gate.ok) throw new Error(gate.reason);
  const rules = await prisma.marketingClient.findMany({
    where: { workspaceId: WORKSPACE_ID },
    select: { id: true, googleAdsCustomerIds: true, googleAdsLiveRead: true },
  });
  if (!googleAdsCustomersToRead(rules, gate.customerIds).includes(customerId)) {
    throw new Error("That customer is not mapped to a client with Google Ads live read on.");
  }
  const to = zonedISODate(new Date(), "America/New_York");
  const from = addDaysISO(to, -(days - 1));
  const pulled = await pullGoogleAdsSnapshot({
    customerIds: [customerId],
    discoverCustomers: false,
    loginCustomerId: gate.loginCustomerId,
    developerToken: gate.developerToken,
    clientId: gate.clientId,
    clientSecret: gate.clientSecret,
    refreshToken: gate.refreshToken,
    apiVersion: gate.apiVersion,
    since: from,
    until: to,
  });
  if (pulled.failures.length) throw new Error(pulled.failures.join("; "));
  const summary = googleAdsProbeSummary(pulled.snapshot, { customerId, from, to });
  const line = JSON.stringify({ ...summary, warnings: pulled.snapshot.warnings });
  const hidden = redactGoogleSecrets(line, secrets());
  if (hidden !== line) throw new Error("Refusing to print a response that contained a Google Ads secret.");
  console.log(line);
}

main()
  .catch((error) => {
    console.error(redactGoogleSecrets(error instanceof Error ? error.message : "Google Ads probe failed", secrets()));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

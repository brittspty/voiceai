/**
 * Staff setup: set a client's Google Analytics connection and GA4 property id.
 * Updates only those two fields. Does not change metaLiveRead or any other live-read flag.
 * Does not call Google. Does not create a client.
 *
 *   tsx scripts/google-analytics-client-scope.ts --name "Be Found AI" --property 553292453
 *   tsx scripts/google-analytics-client-scope.ts --name "Angelo Marketing" --property 123456789 --connection angelo
 *   tsx scripts/google-analytics-client-scope.ts --print-locked
 *   tsx scripts/google-analytics-client-scope.ts --apply-locked
 *   tsx scripts/google-analytics-client-scope.ts --apply-locked --write
 *
 * --connection empty (the default) uses the primary ads@ token.
 * --apply-locked prints the locked ads@ list. It writes only when --write is present,
 * and only for clients that already exist in this workspace.
 * Angelo Marketing and Capital Financial USA are not in that list.
 */
import { prisma } from "../lib/db";
import { LOCKED_ANALYTICS_MAPPINGS } from "../lib/marketing/google-analytics/locked-mappings";
import { analyticsScopeData } from "../lib/marketing/google-analytics/scope";
import { WORKSPACE_ID } from "../lib/marketing/types";

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? "" : "";
}

async function applyOne(name: string, propertyId: string, connection: string, write: boolean) {
  const data = analyticsScopeData({ connection, propertyId });
  if (!data.ok) throw new Error(data.reason);
  const client = await prisma.marketingClient.findFirst({
    where: { workspaceId: WORKSPACE_ID, name },
    select: { id: true, name: true },
  });
  if (!client) {
    console.log(JSON.stringify({ name, status: "skipped", reason: "client is not in this workspace" }));
    return;
  }
  if (!write) {
    console.log(JSON.stringify({ clientId: client.id, name: client.name, write: false, ...data.data }));
    return;
  }
  const updated = await prisma.marketingClient.update({
    where: { id: client.id },
    data: data.data,
    select: { id: true, name: true, googleAnalyticsConnectionName: true, googleAnalyticsPropertyId: true },
  });
  console.log(JSON.stringify({ clientId: updated.id, name: updated.name, write: true, googleAnalyticsConnectionName: updated.googleAnalyticsConnectionName, googleAnalyticsPropertyId: updated.googleAnalyticsPropertyId }));
}

async function main() {
  if (process.argv.includes("--print-locked") || process.argv.includes("--apply-locked")) {
    const write = process.argv.includes("--write") && process.argv.includes("--apply-locked");
    for (const row of LOCKED_ANALYTICS_MAPPINGS) {
      if (process.argv.includes("--print-locked") && !process.argv.includes("--apply-locked")) {
        console.log(JSON.stringify({ client: row.client, property: row.property, propertyId: row.propertyId, connectionName: row.connectionName }));
        continue;
      }
      await applyOne(row.client, row.propertyId, row.connectionName, write);
    }
    return;
  }
  const name = arg("name").trim();
  if (!name) throw new Error("--name is required");
  const propertyId = arg("property").trim();
  if (!propertyId) throw new Error("--property is required");
  await applyOne(name, propertyId, arg("connection"), true);
}

main().finally(() => prisma.$disconnect());

/**
 * Staff setup: link a client to Google Ads customer ids, then set Campaign.clientId and AdAccount.clientId locally.
 * Nothing is sent to Google. Ids are stored as 10 digits with no dashes.
 *   tsx scripts/google-ads-client-scope.ts --name "Client" --customers 1234567890,123-456-7891 [--off]
 * --name is a client name or an existing client id.
 */
import { prisma } from "../lib/db";
import { applyGoogleAdsClientScopes } from "../lib/marketing/client-campaign-scope";
import { normalizeCustomerId } from "../lib/marketing/config";
import { WORKSPACE_ID } from "../lib/marketing/types";

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? "" : "";
}

async function main() {
  const key = arg("name").trim();
  if (!key) throw new Error("--name is required");
  const parts = arg("customers").split(",").map((id) => id.trim()).filter(Boolean);
  if (!parts.length) throw new Error("--customers is required");
  const ids: string[] = [];
  for (const part of parts) {
    const id = normalizeCustomerId(part);
    if (!id) throw new Error("--customers must be 10-digit ids");
    if (!ids.includes(id)) ids.push(id);
  }
  const data = { googleAdsCustomerIds: ids, googleAdsLiveRead: !process.argv.includes("--off") };
  const byId = await prisma.marketingClient.findFirst({ where: { workspaceId: WORKSPACE_ID, id: key } });
  const client = byId
    ? await prisma.marketingClient.update({ where: { id: byId.id }, data })
    : await prisma.marketingClient.upsert({
        where: { workspaceId_name: { workspaceId: WORKSPACE_ID, name: key } },
        create: { workspaceId: WORKSPACE_ID, name: key, ...data },
        update: data,
      });
  const result = await applyGoogleAdsClientScopes(prisma as never, WORKSPACE_ID);
  const linked = await prisma.campaign.findMany({
    where: { clientId: client.id, platform: "google_ads" },
    select: { externalId: true, name: true },
  });
  console.log(JSON.stringify({ clientId: client.id, ...data, ...result, campaigns: linked }));
}

main().finally(() => prisma.$disconnect());

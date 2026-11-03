/**
 * Staff setup: link a client to StackAdapt advertiser ids, then set Campaign.clientId locally.
 * Nothing is sent to StackAdapt.
 *   tsx scripts/stackadapt-client-scope.ts --name "Cedar Lane Studio" --advertisers 1001,1002 [--off]
 *   tsx scripts/stackadapt-client-scope.ts --name "Precision Garage Doors Nashville" --advertisers 95590 --contains Nashville
 * --contains is a case-insensitive campaign-name substring (at least 3 characters), checked before the plain advertiser match.
 * Omitting --contains leaves an existing filter unchanged.
 */
import { prisma } from "../lib/db";
import { applyStackAdaptClientScopes } from "../lib/marketing/client-campaign-scope";
import { WORKSPACE_ID } from "../lib/marketing/types";

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? "" : "";
}

async function main() {
  const name = arg("name").trim();
  if (!name) throw new Error("--name is required");
  const ids = arg("advertisers").split(",").map((id) => id.trim()).filter(Boolean);
  if (!ids.length) throw new Error("--advertisers is required");
  if (ids.some((id) => !/^\d+$/.test(id))) throw new Error("--advertisers must be numeric ids");
  const containsFlag = process.argv.includes("--contains");
  const contains = arg("contains").trim();
  if (containsFlag && contains.length < 3) throw new Error("--contains must be at least 3 characters");
  const data = {
    stackadaptAdvertiserIds: ids,
    stackadaptLiveRead: !process.argv.includes("--off"),
    ...(containsFlag ? { stackadaptCampaignNameContains: contains } : {}),
  };
  const client = await prisma.marketingClient.upsert({
    where: { workspaceId_name: { workspaceId: WORKSPACE_ID, name } },
    create: { workspaceId: WORKSPACE_ID, name, ...data },
    update: data,
  });
  const result = await applyStackAdaptClientScopes(prisma as never, WORKSPACE_ID);
  const linked = await prisma.campaign.findMany({
    where: { clientId: client.id, platform: "stackadapt" },
    select: { externalId: true, name: true },
  });
  console.log(JSON.stringify({ clientId: client.id, ...data, ...result, campaigns: linked }));
}

main().finally(() => prisma.$disconnect());

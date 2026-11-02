/**
 * Staff setup: link a client to StackAdapt advertiser ids, then set Campaign.clientId locally.
 * Nothing is sent to StackAdapt.
 *   tsx scripts/stackadapt-client-scope.ts --name "Cedar Lane Studio" --advertisers 1001,1002 [--off]
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
  const data = { stackadaptAdvertiserIds: ids, stackadaptLiveRead: !process.argv.includes("--off") };
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

/**
 * Staff setup: create or update a client's Meta campaign scope, then link matching campaigns.
 * Local database only. Nothing is sent to Meta.
 *   tsx scripts/client-campaign-scope.ts --name "Client" --ids 1,2,3 [--contains text] [--off]
 */
import { prisma } from "../lib/db";
import { applyClientCampaignScopes } from "../lib/marketing/client-campaign-scope";
import { WORKSPACE_ID } from "../lib/marketing/types";

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? "" : "";
}

async function main() {
  const name = arg("name").trim();
  if (!name) throw new Error("--name is required");
  const ids = arg("ids").split(",").map((id) => id.trim()).filter((id) => /^\d+$/.test(id));
  const data = { metaCampaignIds: ids, metaCampaignNameContains: arg("contains").trim(), metaLiveRead: !process.argv.includes("--off") };
  const client = await prisma.marketingClient.upsert({
    where: { workspaceId_name: { workspaceId: WORKSPACE_ID, name } },
    create: { workspaceId: WORKSPACE_ID, name, ...data },
    update: data,
  });
  const result = await applyClientCampaignScopes(prisma as never, WORKSPACE_ID);
  const linked = await prisma.campaign.findMany({ where: { clientId: client.id }, select: { externalId: true, name: true } });
  console.log(JSON.stringify({ clientId: client.id, ...result, campaigns: linked }));
}

main().finally(() => prisma.$disconnect());

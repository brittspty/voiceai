/**
 * Staff setup: create or update a client's Meta campaign scope, then link matching campaigns.
 * Local database only. Nothing is sent to Meta.
 *   tsx scripts/client-campaign-scope.ts --name "Client" --ids 1,2,3 [--contains text] [--off]
 *   tsx scripts/client-campaign-scope.ts --name "HomeStead RV" --accounts act_695605706002199
 * --accounts links every campaign on those ad accounts, including campaigns created later.
 * The shared account act_532471207924121 is refused. Passing --accounts does not clear
 * --ids or --contains unless those flags are present too.
 */
import { prisma } from "../lib/db";
import { applyClientCampaignScopes, linkableMetaAdAccountIds } from "../lib/marketing/client-campaign-scope";
import { WORKSPACE_ID } from "../lib/marketing/types";

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? "" : "";
}

function has(name: string) {
  return process.argv.includes(`--${name}`);
}

function campaignIds(raw: string) {
  return raw.split(",").map((id) => id.trim()).filter((id) => /^\d+$/.test(id));
}

async function main() {
  const name = arg("name").trim();
  if (!name) throw new Error("--name is required");
  const data: {
    metaLiveRead: boolean;
    metaCampaignIds?: string[];
    metaCampaignNameContains?: string;
    metaAdAccountIds?: string[];
  } = { metaLiveRead: !has("off") };
  if (has("accounts")) {
    const parts = arg("accounts").split(",").map((id) => id.trim()).filter(Boolean);
    if (!parts.length) throw new Error("--accounts is required when the flag is set");
    data.metaAdAccountIds = linkableMetaAdAccountIds(parts);
    if (has("ids")) data.metaCampaignIds = campaignIds(arg("ids"));
    if (has("contains")) data.metaCampaignNameContains = arg("contains").trim();
  } else {
    data.metaCampaignIds = campaignIds(arg("ids"));
    data.metaCampaignNameContains = arg("contains").trim();
  }
  const client = await prisma.marketingClient.upsert({
    where: { workspaceId_name: { workspaceId: WORKSPACE_ID, name } },
    create: { workspaceId: WORKSPACE_ID, name, ...data },
    update: data,
  });
  const result = await applyClientCampaignScopes(prisma as never, WORKSPACE_ID);
  const linked = await prisma.campaign.findMany({ where: { clientId: client.id }, select: { externalId: true, name: true } });
  console.log(JSON.stringify({ clientId: client.id, ...data, ...result, campaigns: linked }));
}

main().finally(() => prisma.$disconnect());

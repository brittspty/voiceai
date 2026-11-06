/**
 * Staff setup: map a client to a Traxy or Apollo connection. Nothing is sent to either API.
 *   tsx scripts/prospect-client-scope.ts --name "Cedar Lane Studio" --source traxy [--connection befound] [--profiles uuid] [--tiers QUALIFIED] [--min-icp 70] [--off]
 *   tsx scripts/prospect-client-scope.ts --name "Cedar Lane Studio" --source apollo [--connection befound] [--lists id] [--saved-searches id] [--off]
 * An empty --connection uses the primary API key. --off turns that source's live read off.
 */
import { prisma } from "../lib/db";
import { apolloScopeData, traxyScopeData } from "../lib/marketing/prospects/scope";
import { WORKSPACE_ID } from "../lib/marketing/types";

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? "" : "";
}

function list(name: string) {
  if (!process.argv.includes(`--${name}`)) return [];
  return arg(name).split(",").map((item) => item.trim()).filter(Boolean);
}

async function main() {
  const name = arg("name").trim();
  if (!name) throw new Error("--name is required");
  const source = arg("source").trim().toLowerCase();
  const live = !process.argv.includes("--off");
  const connection = arg("connection");
  if (source === "traxy") {
    const data = traxyScopeData({
      connection,
      profiles: list("profiles"),
      tiers: list("tiers"),
      minIcp: process.argv.includes("--min-icp") ? Number(arg("min-icp")) : null,
      live,
    });
    if (!data.ok) throw new Error(data.reason);
    const client = await prisma.marketingClient.upsert({
      where: { workspaceId_name: { workspaceId: WORKSPACE_ID, name } },
      create: { workspaceId: WORKSPACE_ID, name, ...data.data },
      update: data.data,
    });
    console.log(JSON.stringify({ clientId: client.id, source, ...data.data }));
    return;
  }
  if (source !== "apollo") throw new Error("--source must be traxy or apollo");
  const data = apolloScopeData({ connection, lists: list("lists"), savedSearches: list("saved-searches"), live });
  if (!data.ok) throw new Error(data.reason);
  const client = await prisma.marketingClient.upsert({
    where: { workspaceId_name: { workspaceId: WORKSPACE_ID, name } },
    create: { workspaceId: WORKSPACE_ID, name, ...data.data },
    update: data.data,
  });
  console.log(JSON.stringify({ clientId: client.id, source, ...data.data }));
}

main().finally(() => prisma.$disconnect());

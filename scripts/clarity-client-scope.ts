/**
 * Staff setup: map a client to one Clarity project.
 * Dry run unless --write is set. Does not call Clarity. Does not create a client.
 * Updates only the Clarity scope. Does not change metaLiveRead or any other live-read flag.
 *
 *   tsx scripts/clarity-client-scope.ts --name "Be Found AI" --project abc123xyz --connection befound
 *   tsx scripts/clarity-client-scope.ts --name "Be Found AI" --project abc123xyz --connection befound --label "Be Found site" --write
 *
 * --connection is a name from CLARITY_CONNECTIONS. The token is CLARITY_<NAME>_API_TOKEN and is not read here.
 */
import { prisma } from "../lib/db";
import { clarityScopeData } from "../lib/marketing/clarity/scope";
import { WORKSPACE_ID } from "../lib/marketing/types";

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? "" : "";
}

async function main() {
  const name = arg("name").trim();
  if (!name) throw new Error("--name is required");
  const projectId = arg("project").trim();
  if (!projectId) throw new Error("--project is required");
  const connection = arg("connection").trim();
  if (!connection) throw new Error("--connection is required");
  const data = clarityScopeData({ projectId, connection, label: arg("label") });
  if (!data.ok) throw new Error(data.reason);
  const write = process.argv.includes("--write");
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
  const taken = await prisma.clarityClientScope.findFirst({
    where: { workspaceId: WORKSPACE_ID, projectId: data.data.projectId, clientId: { not: client.id } },
    select: { client: { select: { name: true } } },
  });
  if (taken) throw new Error(`project ${data.data.projectId} is already mapped to ${taken.client.name}`);
  const existing = await prisma.clarityClientScope.findUnique({
    where: { clientId: client.id },
    select: { projectId: true },
  });
  const reset = !existing || existing.projectId !== data.data.projectId;
  const updated = await prisma.clarityClientScope.upsert({
    where: { clientId: client.id },
    create: { workspaceId: WORKSPACE_ID, clientId: client.id, ...data.data },
    update: {
      ...data.data,
      ...(reset ? { requestDay: null, requestCount: 0, syncedBreakdowns: [] } : {}),
    },
    select: { clientId: true, projectId: true, label: true, connectionName: true },
  });
  console.log(JSON.stringify({ clientId: updated.clientId, name: client.name, write: true, projectId: updated.projectId, label: updated.label, connectionName: updated.connectionName }));
}

main().finally(() => prisma.$disconnect());

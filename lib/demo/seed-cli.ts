import { prisma } from "../db";
import { demoWorkspaceEnabled } from "./flags";
import { applyDemoDataset } from "./seed-apply";

async function main() {
  if (!demoWorkspaceEnabled()) {
    console.error("Demo is disabled. Set DEMO_WORKSPACE=on and DEMO_ACCESS_SECRET.");
    process.exit(1);
  }
  const result = await applyDemoDataset(prisma);
  console.log(`Demo reseed wrote ${result.rows} rows in ${result.workspaceId}.`);
  for (const mod of result.modules) console.log(`module ${mod.id}: ${mod.status}${mod.reason ? ` (${mod.reason})` : ""}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Demo reseed failed");
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { DEMO_WORKSPACE_ID } from "./isolation";
import type { DemoDataset } from "./dataset";

export type LooseModel = {
  deleteMany: (args: { where: Record<string, unknown> }) => Promise<unknown>;
  create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
};

export function optionalModel(client: object, name: string): LooseModel | null {
  const value = (client as Record<string, unknown>)[name];
  if (!value || typeof value !== "object") return null;
  const model = value as { create?: unknown; deleteMany?: unknown };
  if (typeof model.create !== "function" || typeof model.deleteMany !== "function") return null;
  return model as LooseModel;
}

export type SeedModuleResult = { id: string; status: "seeded" | "skipped"; reason?: string };

type SeedModule = {
  id: string;
  models: string[];
  run: (client: object, dataset: DemoDataset) => Promise<SeedModuleResult>;
};

async function writeIfPresent(client: object, names: string[], write: (model: LooseModel, name: string) => Promise<void>, id: string): Promise<SeedModuleResult> {
  const found = names.map((name) => ({ name, model: optionalModel(client, name) })).find((item) => item.model);
  if (!found?.model) return { id, status: "skipped", reason: "model not in this build" };
  try {
    await write(found.model, found.name);
    return { id, status: "seeded" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "seed failed";
    return { id, status: "skipped", reason: message };
  }
}

export const SEED_MODULES: SeedModule[] = [
  {
    id: "maid",
    models: ["maidAudience", "maidUpload", "audienceMaid"],
    run: (client, dataset) =>
      writeIfPresent(client, ["maidAudience", "maidUpload", "audienceMaid"], async (model) => {
        await model.deleteMany({ where: { workspaceId: DEMO_WORKSPACE_ID } });
        for (const row of dataset.maids.slice(0, 12)) {
          await model.create({
            data: { workspaceId: DEMO_WORKSPACE_ID, externalId: row.maid, name: row.maid, lineage: row.lineage, matched: row.matched },
          });
        }
      }, "maid"),
  },
  {
    id: "segments",
    models: ["segmentDecision", "segmentTest"],
    run: (client, dataset) =>
      writeIfPresent(client, ["segmentDecision", "segmentTest"], async (model) => {
        await model.deleteMany({ where: { workspaceId: DEMO_WORKSPACE_ID } });
        for (const row of dataset.segments) {
          await model.create({
            data: { workspaceId: DEMO_WORKSPACE_ID, segmentKey: row.id, label: row.name, action: row.action, note: row.note },
          });
        }
      }, "segments"),
  },
  {
    id: "reports",
    models: ["clientReport", "marketingReport"],
    run: (client, dataset) =>
      writeIfPresent(client, ["clientReport", "marketingReport"], async (model) => {
        await model.deleteMany({ where: { workspaceId: DEMO_WORKSPACE_ID } });
        for (const report of dataset.reports) {
          await model.create({
            data: { workspaceId: DEMO_WORKSPACE_ID, title: report.title, clientId: report.clientId, weeks: report.weeks },
          });
        }
      }, "reports"),
  },
  {
    id: "feed",
    models: ["amFeedEvent"],
    run: (client, dataset) =>
      writeIfPresent(client, ["amFeedEvent"], async (model) => {
        await model.deleteMany({ where: { workspaceId: DEMO_WORKSPACE_ID } });
        for (const item of dataset.feed) {
          await model.create({
            data: {
              workspaceId: DEMO_WORKSPACE_ID,
              campaignId: "",
              adAccountId: "",
              kind: "demo",
              title: item.title,
              body: item.body,
              reason: item.basedOn,
              decision: "",
              sourceId: `demo:${item.id}`,
            },
          });
        }
      }, "feed"),
  },
  {
    id: "redesign",
    models: ["dashboardLayout", "homeLayout"],
    run: (client) => writeIfPresent(client, ["dashboardLayout", "homeLayout"], async () => {}, "redesign"),
  },
];

export async function runOptionalSeeds(client: object, dataset: DemoDataset) {
  if (dataset.workspaceId !== DEMO_WORKSPACE_ID) throw new Error("demo mutations stay in the demo workspace");
  const results: SeedModuleResult[] = [];
  for (const mod of SEED_MODULES) results.push(await mod.run(client, dataset));
  return results;
}

import type { Prisma, PrismaClient } from "@prisma/client";
import { assertDemoWorkspace, demoDeleteWhere, DEMO_WORKSPACE_ID } from "./isolation";
import { runOptionalSeeds } from "./modules";
import { seedRows, type SeedRow } from "./seed-rows";
import type { DemoDataset } from "./dataset";
import { buildDemoDataset } from "./dataset";

export type DemoWriter = {
  wipe(where: { workspaceId: string }): Promise<void>;
  put(table: string, rows: SeedRow[]): Promise<void>;
};

const WIPE_ORDER = [
  "fatigueSignal",
  "dailyMetric",
  "recommendation",
  "leadAlert",
  "leadResponse",
  "leadLanding",
  "pacingSnapshot",
  "searchTermMetric",
  "adHourlyMetric",
  "ad",
  "adGroupAudience",
  "adGroup",
  "campaign",
  "audience",
  "creativeVersion",
  "creative",
  "audienceSegment",
  "adAccount",
  "platformConnection",
  "marketingSyncRun",
  "marketingRawRecord",
  "marketingClient",
  "demoExhibit",
] as const;

export async function reseedDemo(writer: DemoWriter, dataset: DemoDataset) {
  assertDemoWorkspace(dataset.workspaceId);
  const where = demoDeleteWhere();
  await writer.wipe(where);
  const tables = seedRows(dataset);
  let rows = 0;
  for (const [table, batch] of Object.entries(tables)) {
    for (const row of batch) {
      if (row.workspaceId !== DEMO_WORKSPACE_ID) throw new Error("demo row left the demo workspace");
    }
    if (batch.length) {
      await writer.put(table, batch);
      rows += batch.length;
    }
  }
  return { workspaceId: where.workspaceId, rows };
}

function day(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function delegate(prisma: PrismaClient, name: string) {
  const model = (prisma as unknown as Record<string, { deleteMany?: (args: { where: { workspaceId: string } }) => Promise<unknown>; createMany?: (args: { data: unknown[] }) => Promise<unknown> }>)[name];
  if (!model?.deleteMany || !model.createMany) throw new Error(`Missing demo model ${name}`);
  return { deleteMany: model.deleteMany, createMany: model.createMany };
}

export function prismaDemoWriter(prisma: PrismaClient): DemoWriter {
  return {
    async wipe(where) {
      assertDemoWorkspace(where.workspaceId);
      for (const name of WIPE_ORDER) {
        await delegate(prisma, name).deleteMany({ where: { workspaceId: where.workspaceId } });
      }
      await prisma.workspace.upsert({
        where: { id: DEMO_WORKSPACE_ID },
        create: { id: DEMO_WORKSPACE_ID, name: "Demo workspace", voiceEnabled: false },
        update: { name: "Demo workspace", voiceEnabled: false },
      });
    },
    async put(table, rows) {
      if (table === "dailyMetric") {
        await prisma.dailyMetric.createMany({
          data: rows.map((row) => ({
            id: String(row.id),
            workspaceId: String(row.workspaceId),
            date: day(String(row.date)),
            platform: row.platform as Prisma.DailyMetricCreateManyInput["platform"],
            campaignId: String(row.campaignId),
            adGroupId: String(row.adGroupId),
            adId: String(row.adId),
            creativeVersionId: String(row.creativeVersionId),
            audienceSegmentId: String(row.audienceSegmentId),
            attributionWindow: String(row.attributionWindow),
            currency: String(row.currency),
            spend: String(row.spend),
            impressions: BigInt(Number(row.impressions)),
            clicks: BigInt(Number(row.clicks)),
            linkClicks: BigInt(Number(row.linkClicks)),
            reach: BigInt(Number(row.reach)),
            platformLeads: String(row.platformLeads),
            platformConversions: String(row.platformConversions),
            conversionValue: String(row.conversionValue),
          })),
        });
        return;
      }
      if (table === "fatigueSignal") {
        await prisma.fatigueSignal.createMany({
          data: rows.map((row) => ({
            id: String(row.id),
            workspaceId: String(row.workspaceId),
            platform: row.platform as Prisma.FatigueSignalCreateManyInput["platform"],
            adId: String(row.adId),
            creativeVersionId: String(row.creativeVersionId),
            campaignId: String(row.campaignId),
            adAccountId: String(row.adAccountId),
            fatigued: Boolean(row.fatigued),
            reasons: row.reasons as string[],
            windowStart: day(String(row.windowStart)),
            windowEnd: day(String(row.windowEnd)),
            sampleSize: Number(row.sampleSize),
            dedupeKey: String(row.dedupeKey),
            detectedAt: new Date(String(row.detectedAt)),
          })),
        });
        return;
      }
      if (table === "recommendation") {
        await prisma.recommendation.createMany({
          data: rows.map((row) => ({
            id: String(row.id),
            workspaceId: String(row.workspaceId),
            type: row.type as Prisma.RecommendationCreateManyInput["type"],
            status: "verified",
            title: String(row.title),
            summary: String(row.summary),
            rationale: String(row.rationale),
            metric: String(row.metric),
            baseline: String(row.baseline),
            observed: String(row.observed),
            sampleSize: Number(row.sampleSize),
            evidence: row.evidence as Prisma.InputJsonValue,
          })),
        });
        return;
      }
      if (table === "leadResponse") {
        await prisma.leadResponse.createMany({
          data: rows.map((row) => ({
            id: String(row.id),
            workspaceId: String(row.workspaceId),
            name: String(row.name),
            phone: String(row.phone),
            email: String(row.email),
            leadSource: String(row.leadSource),
            clockStartAt: new Date(String(row.clockStartAt)),
            clockSource: "form_submit",
            slaStartAt: new Date(String(row.slaStartAt)),
            firstTouchAt: new Date(String(row.firstTouchAt)),
            channel: row.channel as Prisma.LeadResponseCreateManyInput["channel"],
            seconds: Number(row.seconds),
          })),
        });
        return;
      }
      if (table === "demoExhibit") {
        await prisma.demoExhibit.createMany({
          data: rows.map((row) => ({
            id: String(row.id),
            workspaceId: String(row.workspaceId),
            kind: String(row.kind),
            payload: row.payload as Prisma.InputJsonValue,
          })),
        });
        return;
      }
      const data = rows.map((row) => ({ ...row })) as unknown[];
      await delegate(prisma, table).createMany?.({ data });
    },
  };
}

export async function applyDemoDataset(prisma: PrismaClient, dataset: DemoDataset = buildDemoDataset()) {
  const result = await reseedDemo(prismaDemoWriter(prisma), dataset);
  const modules = await runOptionalSeeds(prisma, dataset);
  await prisma.demoReseed.upsert({
    where: { id: DEMO_WORKSPACE_ID },
    create: { id: DEMO_WORKSPACE_ID, finishedAt: new Date(), status: "succeeded" },
    update: { finishedAt: new Date(), status: "succeeded" },
  });
  return { ...result, modules };
}

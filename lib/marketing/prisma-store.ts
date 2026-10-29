import type { Prisma, PrismaClient } from "@prisma/client";
import type { MarketingStore } from "./store";

type Client = PrismaClient | Prisma.TransactionClient;

function day(iso: string | null) {
  if (!iso) return null;
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

function big(value: string | null) {
  if (value === null) return null;
  return BigInt(value);
}

export function createPrismaMarketingStore(client: Client): MarketingStore {
  return {
    async upsertConnection(input) {
      const row = await client.platformConnection.upsert({
        where: { workspaceId_platform: { workspaceId: input.workspaceId, platform: input.platform } },
        create: input,
        update: {
          authType: input.authType,
          secretRef: input.secretRef,
          appExternalId: input.appExternalId,
          status: input.status,
          scopes: input.scopes,
          lastSyncAt: input.lastSyncAt,
          lastError: input.lastError,
        },
      });
      return { id: row.id };
    },
    async markConnection(id, patch) {
      await client.platformConnection.update({ where: { id }, data: patch });
    },
    async startRun(input) {
      const row = await client.marketingSyncRun.create({
        data: {
          workspaceId: input.workspaceId,
          connectionId: input.connectionId,
          platform: input.platform,
          kind: input.kind,
          status: "running",
          mode: input.mode,
          windowStart: day(input.windowStart),
          windowEnd: day(input.windowEnd),
          requestedAccounts: input.requestedAccounts,
        },
      });
      return { id: row.id };
    },
    async finishRun(id, patch) {
      await client.marketingSyncRun.update({
        where: { id },
        data: {
          status: patch.status,
          rowsRead: patch.rowsRead,
          rowsWritten: patch.rowsWritten,
          error: patch.error,
          note: patch.note,
          finishedAt: patch.finishedAt,
        },
      });
    },
    async enabledAccountIds(platform, workspaceId) {
      const rows = await client.adAccount.findMany({
        where: { platform, workspaceId, syncEnabled: true },
        select: { externalId: true },
        orderBy: { externalId: "asc" },
      });
      return rows.map((row) => row.externalId);
    },
    async upsertAccount(input) {
      const where = { workspaceId_platform_externalId: { workspaceId: input.workspaceId, platform: input.platform, externalId: input.externalId } };
      const existing = await client.adAccount.findUnique({ where, select: { syncEnabled: true } });
      const row = await client.adAccount.upsert({
        where,
        create: {
          workspaceId: input.workspaceId,
          connectionId: input.connectionId,
          platform: input.platform,
          externalId: input.externalId,
          name: input.name,
          currency: input.currency,
          timezone: input.timezone,
          status: input.status,
          syncEnabled: input.syncEnabled,
        },
        update: {
          connectionId: input.connectionId,
          name: input.name,
          currency: input.currency,
          timezone: input.timezone,
          status: input.status,
          syncEnabled: existing?.syncEnabled ?? input.syncEnabled,
        },
      });
      return { id: row.id };
    },
    async findCampaign(workspaceId, platform, externalId) {
      return client.campaign.findUnique({
        where: { workspaceId_platform_externalId: { workspaceId, platform, externalId } },
        select: { id: true },
      });
    },
    async upsertCampaign(input) {
      const row = await client.campaign.upsert({
        where: { workspaceId_platform_externalId: { workspaceId: input.workspaceId, platform: input.platform, externalId: input.externalId } },
        create: {
          workspaceId: input.workspaceId,
          adAccountId: input.adAccountId,
          platform: input.platform,
          externalId: input.externalId,
          name: input.name,
          objective: input.objective,
          objectiveRaw: input.objectiveRaw,
          status: input.status,
          statusRaw: input.statusRaw,
          budgetType: input.budgetType,
          budgetAmount: input.budgetAmount,
          startDate: input.startDate ? new Date(input.startDate) : null,
          endDate: input.endDate ? new Date(input.endDate) : null,
          namingParsed: input.namingParsed,
        },
        update: {
          adAccountId: input.adAccountId,
          name: input.name,
          objective: input.objective,
          objectiveRaw: input.objectiveRaw,
          status: input.status,
          statusRaw: input.statusRaw,
          budgetType: input.budgetType,
          budgetAmount: input.budgetAmount,
          startDate: input.startDate ? new Date(input.startDate) : null,
          endDate: input.endDate ? new Date(input.endDate) : null,
          namingParsed: input.namingParsed,
        },
      });
      return { id: row.id };
    },
    async findAdGroup(workspaceId, platform, externalId) {
      return client.adGroup.findUnique({
        where: { workspaceId_platform_externalId: { workspaceId, platform, externalId } },
        select: { id: true },
      });
    },
    async upsertAdGroup(input) {
      const row = await client.adGroup.upsert({
        where: { workspaceId_platform_externalId: { workspaceId: input.workspaceId, platform: input.platform, externalId: input.externalId } },
        create: {
          workspaceId: input.workspaceId,
          campaignId: input.campaignId,
          platform: input.platform,
          externalId: input.externalId,
          name: input.name,
          status: input.status,
          statusRaw: input.statusRaw,
          optimizationGoal: input.optimizationGoal,
          bidStrategy: input.bidStrategy,
        },
        update: {
          campaignId: input.campaignId,
          name: input.name,
          status: input.status,
          statusRaw: input.statusRaw,
          optimizationGoal: input.optimizationGoal,
          bidStrategy: input.bidStrategy,
        },
      });
      return { id: row.id };
    },
    async upsertCreative(input) {
      const row = await client.creative.upsert({
        where: { workspaceId_conceptKey: { workspaceId: input.workspaceId, conceptKey: input.conceptKey } },
        create: {
          workspaceId: input.workspaceId,
          name: input.name,
          conceptKey: input.conceptKey,
          conceptTag: input.conceptTag,
          format: input.format,
          angle: input.angle,
          offer: input.offer,
          hook: input.hook,
        },
        update: {
          name: input.name,
          conceptTag: input.conceptTag,
          format: input.format,
          angle: input.angle,
          offer: input.offer,
          hook: input.hook,
        },
      });
      return { id: row.id };
    },
    async findCreativeVersion(workspaceId, fingerprint) {
      const row = await client.creativeVersion.findUnique({
        where: { workspaceId_fingerprint: { workspaceId, fingerprint } },
      });
      if (!row) return null;
      return {
        id: row.id,
        versionLabel: row.versionLabel,
        platformCreativeIds: row.platformCreativeIds,
        firstSeenAt: row.firstSeenAt,
      };
    },
    async versionLabels(creativeId) {
      const rows = await client.creativeVersion.findMany({ where: { creativeId }, select: { versionLabel: true } });
      return rows.map((row) => row.versionLabel);
    },
    async insertCreativeVersion(input) {
      const row = await client.creativeVersion.create({
        data: {
          workspaceId: input.workspaceId,
          creativeId: input.creativeId,
          versionLabel: input.versionLabel,
          fingerprint: input.fingerprint,
          headline: input.headline,
          body: input.body,
          description: input.description,
          cta: input.cta,
          mediaRef: input.mediaRef,
          landingUrl: input.landingUrl,
          platformCreativeIds: input.platformCreativeIds,
        },
      });
      return { id: row.id };
    },
    async updateCreativeVersion(id, input) {
      await client.creativeVersion.update({
        where: { id },
        data: {
          headline: input.headline,
          body: input.body,
          description: input.description,
          cta: input.cta,
          mediaRef: input.mediaRef,
          landingUrl: input.landingUrl,
          platformCreativeIds: input.platformCreativeIds,
        },
      });
    },
    async findAd(workspaceId, platform, externalId) {
      return client.ad.findUnique({
        where: { workspaceId_platform_externalId: { workspaceId, platform, externalId } },
        select: { id: true },
      });
    },
    async upsertAd(input) {
      const row = await client.ad.upsert({
        where: { workspaceId_platform_externalId: { workspaceId: input.workspaceId, platform: input.platform, externalId: input.externalId } },
        create: {
          workspaceId: input.workspaceId,
          adGroupId: input.adGroupId,
          platform: input.platform,
          externalId: input.externalId,
          name: input.name,
          status: input.status,
          statusRaw: input.statusRaw,
          creativeVersionId: input.creativeVersionId,
          destinationUrl: input.destinationUrl,
          urlTags: input.urlTags,
        },
        update: {
          adGroupId: input.adGroupId,
          name: input.name,
          status: input.status,
          statusRaw: input.statusRaw,
          creativeVersionId: input.creativeVersionId,
          destinationUrl: input.destinationUrl,
          urlTags: input.urlTags,
        },
      });
      return { id: row.id };
    },
    async upsertAudience(input) {
      const row = await client.audience.upsert({
        where: { workspaceId_platform_externalId: { workspaceId: input.workspaceId, platform: input.platform, externalId: input.externalId } },
        create: {
          workspaceId: input.workspaceId,
          adAccountId: input.adAccountId,
          platform: input.platform,
          externalId: input.externalId,
          name: input.name,
          type: input.type,
          sourceDescription: input.sourceDescription,
          sizeEstimate: input.sizeEstimate,
        },
        update: {
          adAccountId: input.adAccountId,
          name: input.name,
          type: input.type,
          sourceDescription: input.sourceDescription,
          sizeEstimate: input.sizeEstimate,
        },
      });
      return { id: row.id };
    },
    async replaceAdGroupAudiences(adGroupId, workspaceId, links) {
      await client.adGroupAudience.deleteMany({ where: { adGroupId } });
      if (!links.length) return;
      await client.adGroupAudience.createMany({
        data: links.map((link) => ({
          workspaceId,
          adGroupId,
          audienceId: link.audienceId,
          role: link.role,
        })),
      });
    },
    async upsertSegment(input) {
      const row = await client.audienceSegment.upsert({
        where: { workspaceId_kind_segmentKey: { workspaceId: input.workspaceId, kind: input.kind, segmentKey: input.segmentKey } },
        create: {
          workspaceId: input.workspaceId,
          segmentKey: input.segmentKey,
          kind: input.kind,
          label: input.label,
        },
        update: { label: input.label },
      });
      return { id: row.id };
    },
    async upsertRaw(input) {
      await client.marketingRawRecord.upsert({
        where: {
          workspaceId_platform_objectType_externalId: {
            workspaceId: input.workspaceId,
            platform: input.platform,
            objectType: input.objectType,
            externalId: input.externalId,
          },
        },
        create: {
          workspaceId: input.workspaceId,
          platform: input.platform,
          objectType: input.objectType,
          externalId: input.externalId,
          payload: input.payload as Prisma.InputJsonValue,
          syncRunId: input.syncRunId,
        },
        update: {
          payload: input.payload as Prisma.InputJsonValue,
          syncRunId: input.syncRunId,
          fetchedAt: new Date(),
        },
      });
    },
    async upsertMetric(input) {
      const date = day(input.date)!;
      const data = {
        campaignId: input.campaignId,
        adGroupId: input.adGroupId,
        creativeVersionId: input.creativeVersionId,
        currency: input.currency,
        spend: input.spend,
        impressions: BigInt(input.impressions),
        clicks: BigInt(input.clicks),
        linkClicks: BigInt(input.linkClicks),
        reach: BigInt(input.reach),
        platformLeads: input.platformLeads,
        platformConversions: input.platformConversions,
        conversionValue: input.conversionValue,
        videoViews3s: big(input.videoViews3s),
        thruplays: big(input.thruplays),
        ingestedAt: new Date(),
        sourcePullId: input.sourcePullId,
      };
      await client.dailyMetric.upsert({
        where: {
          workspaceId_date_platform_adId_audienceSegmentId_attributionWindow: {
            workspaceId: input.workspaceId,
            date,
            platform: input.platform,
            adId: input.adId,
            audienceSegmentId: input.audienceSegmentId,
            attributionWindow: input.attributionWindow,
          },
        },
        create: {
          workspaceId: input.workspaceId,
          date,
          platform: input.platform,
          adId: input.adId,
          audienceSegmentId: input.audienceSegmentId,
          attributionWindow: input.attributionWindow,
          ...data,
        },
        update: data,
      });
    },
  };
}

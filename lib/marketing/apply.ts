import { mergePlatformCreativeIds, nextVersionLabel } from "./creative";
import type { MarketingStore } from "./store";
import type { NormalizedSnapshot } from "./types";

export type ApplyContext = {
  workspaceId: string;
  runId: string;
  connectionId: string;
};

export async function applySnapshot(store: MarketingStore, snapshot: NormalizedSnapshot, ctx: ApplyContext) {
  let rowsWritten = 0;
  const accountIds = new Map<string, string>();
  for (const account of snapshot.accounts) {
    const saved = await store.upsertAccount({ ...account, workspaceId: ctx.workspaceId, connectionId: ctx.connectionId });
    accountIds.set(`${account.platform}:${account.externalId}`, saved.id);
    rowsWritten += 1;
  }

  const campaignIds = new Map<string, string>();
  for (const campaign of snapshot.campaigns) {
    const adAccountId = accountIds.get(`${campaign.platform}:${campaign.accountExternalId}`);
    if (!adAccountId) continue;
    const saved = await store.upsertCampaign({ ...campaign, workspaceId: ctx.workspaceId, adAccountId });
    campaignIds.set(`${campaign.platform}:${campaign.externalId}`, saved.id);
    rowsWritten += 1;
  }

  const adGroupIds = new Map<string, string>();
  for (const adGroup of snapshot.adGroups) {
    const campaignId = campaignIds.get(`${adGroup.platform}:${adGroup.campaignExternalId}`);
    if (!campaignId) continue;
    const saved = await store.upsertAdGroup({ ...adGroup, workspaceId: ctx.workspaceId, campaignId });
    adGroupIds.set(`${adGroup.platform}:${adGroup.externalId}`, saved.id);
    rowsWritten += 1;
  }

  const creativeIds = new Map<string, string>();
  const concepts = new Map<string, string>();
  const creatives = [...snapshot.creatives].sort(
    (a, b) => a.conceptKey.localeCompare(b.conceptKey) || a.fingerprint.localeCompare(b.fingerprint),
  );
  for (const creative of creatives) {
    let creativeId = concepts.get(creative.conceptKey);
    if (!creativeId) {
      const saved = await store.upsertCreative({ ...creative, workspaceId: ctx.workspaceId });
      creativeId = saved.id;
      concepts.set(creative.conceptKey, creativeId);
      rowsWritten += 1;
    }
    const existing = await store.findCreativeVersion(ctx.workspaceId, creative.fingerprint);
    if (existing) {
      await store.updateCreativeVersion(existing.id, {
        ...creative,
        platformCreativeIds: mergePlatformCreativeIds(existing.platformCreativeIds, creative.platformCreativeIds),
      });
      creativeIds.set(creative.fingerprint, existing.id);
    } else {
      const versionLabel = nextVersionLabel(await store.versionLabels(creativeId));
      const saved = await store.insertCreativeVersion({ ...creative, workspaceId: ctx.workspaceId, creativeId, versionLabel });
      creativeIds.set(creative.fingerprint, saved.id);
    }
    rowsWritten += 1;
  }

  const adIds = new Map<string, string>();
  for (const ad of snapshot.ads) {
    const adGroupId = adGroupIds.get(`${ad.platform}:${ad.adGroupExternalId}`);
    if (!adGroupId) continue;
    const saved = await store.upsertAd({
      ...ad,
      workspaceId: ctx.workspaceId,
      adGroupId,
      creativeVersionId: creativeIds.get(ad.fingerprint) ?? null,
    });
    adIds.set(`${ad.platform}:${ad.externalId}`, saved.id);
    rowsWritten += 1;
  }

  const audienceIds = new Map<string, string>();
  for (const audience of snapshot.audiences) {
    const adAccountId = accountIds.get(`${audience.platform}:${audience.accountExternalId}`) ?? null;
    const saved = await store.upsertAudience({ ...audience, workspaceId: ctx.workspaceId, adAccountId });
    audienceIds.set(`${audience.platform}:${audience.externalId}`, saved.id);
    rowsWritten += 1;
  }

  const groupsWithLinks = new Set(snapshot.adGroups.map((group) => `${group.platform}:${group.externalId}`));
  for (const key of groupsWithLinks) {
    const adGroupId = adGroupIds.get(key);
    if (!adGroupId) continue;
    const [platform, externalId] = key.split(":");
    const links = snapshot.adGroupAudiences
      .filter((link) => link.platform === platform && link.adGroupExternalId === externalId)
      .map((link) => ({
        audienceId: audienceIds.get(`${link.platform}:${link.audienceExternalId}`) ?? "",
        role: link.role,
      }))
      .filter((link) => link.audienceId);
    await store.replaceAdGroupAudiences(adGroupId, ctx.workspaceId, links);
    rowsWritten += 1;
  }

  const segmentIds = new Map<string, string>();
  for (const segment of snapshot.segments) {
    const saved = await store.upsertSegment({ ...segment, workspaceId: ctx.workspaceId });
    segmentIds.set(`${segment.kind}:${segment.segmentKey}`, saved.id);
    rowsWritten += 1;
  }

  for (const raw of snapshot.raw) {
    await store.upsertRaw({ ...raw, workspaceId: ctx.workspaceId, syncRunId: ctx.runId });
    rowsWritten += 1;
  }

  for (const metric of snapshot.metrics) {
    const adId = adIds.get(`${metric.platform}:${metric.adExternalId}`);
    const audienceSegmentId = segmentIds.get(`${metric.segmentKind}:${metric.segmentKey}`);
    if (!adId || !audienceSegmentId) continue;
    await store.upsertMetric({
      ...metric,
      workspaceId: ctx.workspaceId,
      adId,
      audienceSegmentId,
      campaignId: campaignIds.get(`${metric.platform}:${metric.campaignExternalId}`) ?? null,
      adGroupId: adGroupIds.get(`${metric.platform}:${metric.adGroupExternalId}`) ?? null,
      creativeVersionId: metric.fingerprint ? (creativeIds.get(metric.fingerprint) ?? null) : null,
      sourcePullId: ctx.runId,
    });
    rowsWritten += 1;
  }

  return { rowsWritten };
}

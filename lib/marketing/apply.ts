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

  const preservedRaw = new Set<string>();
  const campaignIds = new Map<string, string>();
  for (const campaign of snapshot.campaigns) {
    const adAccountId = accountIds.get(`${campaign.platform}:${campaign.accountExternalId}`);
    if (!adAccountId) continue;
    const key = `${campaign.platform}:${campaign.externalId}`;
    if (campaign.placeholder) {
      const existing = await store.findCampaign(ctx.workspaceId, campaign.platform, campaign.externalId);
      if (existing) {
        campaignIds.set(key, existing.id);
        preservedRaw.add(`campaign:${campaign.externalId}`);
        continue;
      }
    }
    const saved = await store.upsertCampaign({ ...campaign, workspaceId: ctx.workspaceId, adAccountId });
    campaignIds.set(key, saved.id);
    rowsWritten += 1;
  }

  const adGroupIds = new Map<string, string>();
  for (const adGroup of snapshot.adGroups) {
    const campaignId = campaignIds.get(`${adGroup.platform}:${adGroup.campaignExternalId}`);
    if (!campaignId) continue;
    const key = `${adGroup.platform}:${adGroup.externalId}`;
    if (adGroup.placeholder) {
      const existing = await store.findAdGroup(ctx.workspaceId, adGroup.platform, adGroup.externalId);
      if (existing) {
        adGroupIds.set(key, existing.id);
        preservedRaw.add(`ad_group:${adGroup.externalId}`);
        continue;
      }
    }
    const saved = await store.upsertAdGroup({ ...adGroup, workspaceId: ctx.workspaceId, campaignId });
    adGroupIds.set(key, saved.id);
    rowsWritten += 1;
  }

  const preservedAdIds = new Map<string, string>();
  for (const ad of snapshot.ads) {
    if (!ad.placeholder) continue;
    const existing = await store.findAd(ctx.workspaceId, ad.platform, ad.externalId);
    if (!existing) continue;
    const key = `${ad.platform}:${ad.externalId}`;
    preservedAdIds.set(key, existing.id);
    preservedRaw.add(`ad:${ad.externalId}`);
    const creative = snapshot.creatives.find((row) => row.fingerprint === ad.fingerprint);
    for (const ref of creative?.platformCreativeIds ?? []) {
      if (ref.platform === ad.platform) preservedRaw.add(`creative:${ref.externalId}`);
    }
  }
  const activeFingerprints = new Set(
    snapshot.ads.filter((ad) => !preservedAdIds.has(`${ad.platform}:${ad.externalId}`)).map((ad) => ad.fingerprint),
  );

  const creativeIds = new Map<string, string>();
  const concepts = new Map<string, string>();
  const creatives = [...snapshot.creatives].sort(
    (a, b) => a.conceptKey.localeCompare(b.conceptKey) || a.fingerprint.localeCompare(b.fingerprint),
  );
  for (const creative of creatives) {
    if (!activeFingerprints.has(creative.fingerprint)) continue;
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
    const key = `${ad.platform}:${ad.externalId}`;
    const preserved = preservedAdIds.get(key);
    if (preserved) {
      adIds.set(key, preserved);
      continue;
    }
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

  for (const adGroup of snapshot.adGroups) {
    if (adGroup.placeholder || !adGroup.audiencesLoaded) continue;
    const key = `${adGroup.platform}:${adGroup.externalId}`;
    const adGroupId = adGroupIds.get(key);
    if (!adGroupId) continue;
    const { platform, externalId } = adGroup;
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
    if (preservedRaw.has(`${raw.objectType}:${raw.externalId}`)) continue;
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

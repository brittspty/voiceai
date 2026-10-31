import type { DemoDataset } from "./dataset";
import { DEMO_WORKSPACE_ID } from "./isolation";

export type SeedRow = Record<string, unknown> & { workspaceId?: string };

function accountId(platform: string) {
  return `demo_acct_${platform}`;
}

export function seedRows(dataset: DemoDataset): Record<string, SeedRow[]> {
  if (dataset.workspaceId !== DEMO_WORKSPACE_ID) throw new Error("demo mutations stay in the demo workspace");
  const platforms = [...new Set(dataset.campaigns.map((campaign) => campaign.platform))];
  const connections = platforms.map((platform) => ({
    id: `demo_conn_${platform}`,
    workspaceId: DEMO_WORKSPACE_ID,
    platform,
    authType: "internal",
    secretRef: "demo://mock",
    status: "unconfigured",
  }));
  const accounts = platforms.map((platform) => ({
    id: accountId(platform),
    workspaceId: DEMO_WORKSPACE_ID,
    connectionId: `demo_conn_${platform}`,
    platform,
    externalId: `demo-${platform}`,
    name: `Demo ${platform}`,
    currency: "USD",
    timezone: "America/New_York",
    status: "active",
    syncEnabled: false,
  }));
  const clients = dataset.clients.map((client) => ({
    id: client.id,
    workspaceId: DEMO_WORKSPACE_ID,
    name: client.name,
  }));
  const campaigns = dataset.campaigns.map((campaign) => ({
    id: campaign.id,
    workspaceId: DEMO_WORKSPACE_ID,
    adAccountId: accountId(campaign.platform),
    platform: campaign.platform,
    externalId: campaign.id,
    name: campaign.name,
    objective: campaign.kind === "voice" ? "calls" : "leads",
    status: "active",
    budgetType: "daily",
    budgetAmount: campaign.illustrative ? "40" : "25",
    budgetCurrency: "USD",
  }));
  const adGroups = dataset.campaigns.map((campaign) => ({
    id: `demo_ag_${campaign.id}`,
    workspaceId: DEMO_WORKSPACE_ID,
    campaignId: campaign.id,
    platform: campaign.platform,
    externalId: `demo_ag_${campaign.id}`,
    name: `${campaign.name} group`,
    status: "active",
  }));
  const creatives = dataset.campaigns.flatMap((campaign) =>
    campaign.creatives.map((creative) => ({
      id: creative.id,
      workspaceId: DEMO_WORKSPACE_ID,
      name: creative.name,
      conceptKey: creative.id,
      format: campaign.kind === "voice" ? "text" : "image",
    })),
  );
  const versions = dataset.campaigns.flatMap((campaign) =>
    campaign.creatives.map((creative) => ({
      id: `demo_ver_${creative.id}`,
      workspaceId: DEMO_WORKSPACE_ID,
      creativeId: creative.id,
      versionLabel: creative.fatigue,
      fingerprint: creative.id,
      headline: creative.headline,
      status: "live",
    })),
  );
  const ads = dataset.campaigns.flatMap((campaign) =>
    campaign.creatives.map((creative) => ({
      id: `demo_ad_${creative.id}`,
      workspaceId: DEMO_WORKSPACE_ID,
      adGroupId: `demo_ag_${campaign.id}`,
      platform: campaign.platform,
      externalId: `demo_ad_${creative.id}`,
      name: creative.name,
      status: "active",
      creativeVersionId: `demo_ver_${creative.id}`,
    })),
  );
  const segments = [
    {
      id: "demo_segment_all",
      workspaceId: DEMO_WORKSPACE_ID,
      segmentKey: "all",
      kind: "targeting",
      label: "All demo traffic",
    },
  ];
  const metrics = dataset.metrics.map((row) => ({
    id: `demo_metric_${row.creativeId}_${row.date}`,
    workspaceId: DEMO_WORKSPACE_ID,
    date: row.date,
    platform: dataset.campaigns.find((campaign) => campaign.id === row.campaignId)?.platform || "meta",
    campaignId: row.campaignId,
    adGroupId: `demo_ag_${row.campaignId}`,
    adId: `demo_ad_${row.creativeId}`,
    creativeVersionId: `demo_ver_${row.creativeId}`,
    audienceSegmentId: "demo_segment_all",
    attributionWindow: "demo",
    currency: "USD",
    spend: (row.spendCents / 100).toFixed(2),
    impressions: row.impressions,
    clicks: row.clicks,
    linkClicks: row.clicks,
    reach: row.impressions,
    platformLeads: row.leads,
    platformConversions: row.verifiedConversions,
    conversionValue: (row.verifiedConversions * 120).toFixed(2),
  }));
  const fatigue = dataset.campaigns.flatMap((campaign) =>
    campaign.creatives
      .filter((creative) => creative.fatigue !== "fresh")
      .map((creative) => ({
        id: `demo_fatigue_${creative.id}`,
        workspaceId: DEMO_WORKSPACE_ID,
        platform: campaign.platform,
        adId: `demo_ad_${creative.id}`,
        creativeVersionId: `demo_ver_${creative.id}`,
        campaignId: campaign.id,
        adAccountId: accountId(campaign.platform),
        fatigued: creative.fatigue === "fatigued",
        reasons: [creative.fatigue === "fatigued" ? "ctr_decline" : "early_decline"],
        windowStart: dataset.metrics[0]?.date || "2026-08-01",
        windowEnd: dataset.metrics[dataset.metrics.length - 1]?.date || "2026-10-30",
        sampleSize: 90,
        dedupeKey: `demo:${creative.id}`,
        detectedAt: "2026-10-30T15:00:00.000Z",
      })),
  );
  const recommendations = dataset.decisions.map((decision) => ({
    id: decision.id,
    workspaceId: DEMO_WORKSPACE_ID,
    type: decision.kind === "fatigue" ? "creative_fatigue" : "performance",
    status: "verified",
    title: decision.title,
    summary: decision.summary,
    rationale: decision.basedOn,
    metric: decision.kind,
    baseline: "demo seed",
    observed: decision.summary,
    sampleSize: 90,
    evidence: { basedOn: decision.basedOn, kind: decision.kind },
  }));
  const leads = dataset.leads.map((lead) => ({
    id: lead.id,
    workspaceId: DEMO_WORKSPACE_ID,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    leadSource: lead.source,
    clockStartAt: "2026-10-30T14:00:00.000Z",
    clockSource: "form_submit",
    slaStartAt: "2026-10-30T14:00:00.000Z",
    firstTouchAt: "2026-10-30T14:05:00.000Z",
    channel: lead.source.includes("voice") ? "voice_ai" : "human",
    seconds: lead.secondsToLead,
  }));
  const exhibits = [
    ...dataset.feed.map((item) => ({ id: `demo_exhibit_feed_${item.id}`, workspaceId: DEMO_WORKSPACE_ID, kind: "feed", payload: item })),
    ...dataset.bots.map((item) => ({ id: `demo_exhibit_bot_${item.id}`, workspaceId: DEMO_WORKSPACE_ID, kind: "bot", payload: item })),
    ...dataset.reports.map((item) => ({ id: `demo_exhibit_report_${item.clientId}`, workspaceId: DEMO_WORKSPACE_ID, kind: "report", payload: item })),
    ...dataset.segments.map((item) => ({ id: `demo_exhibit_segment_${item.id}`, workspaceId: DEMO_WORKSPACE_ID, kind: "segment", payload: item })),
    { id: "demo_exhibit_maids", workspaceId: DEMO_WORKSPACE_ID, kind: "maid", payload: { count: dataset.maids.length, sample: dataset.maids.slice(0, 4) } },
  ];
  return {
    marketingClient: clients,
    platformConnection: connections,
    adAccount: accounts,
    campaign: campaigns,
    adGroup: adGroups,
    creative: creatives,
    creativeVersion: versions,
    ad: ads,
    audienceSegment: segments,
    dailyMetric: metrics,
    fatigueSignal: fatigue,
    recommendation: recommendations,
    leadResponse: leads,
    demoExhibit: exhibits,
  };
}

import type {
  AdPlatform,
  AudienceLinkRole,
  AuthType,
  ConnectionStatus,
  NormalizedSnapshot,
  StoredSyncMode,
  SyncKind,
  SyncStatus,
} from "./types";

export type ConnectionWrite = {
  workspaceId: string;
  platform: AdPlatform;
  authType: AuthType;
  secretRef: string;
  appExternalId: string;
  status: ConnectionStatus;
  scopes: string[];
  lastSyncAt: Date | null;
  lastError: string | null;
};

export type RunWrite = {
  workspaceId: string;
  connectionId: string;
  platform: AdPlatform;
  kind: SyncKind;
  mode: StoredSyncMode;
  windowStart: string | null;
  windowEnd: string | null;
  requestedAccounts: string[];
};

export type RunFinish = {
  status: SyncStatus;
  rowsRead: number;
  rowsWritten: number;
  error: string | null;
  note: string;
  finishedAt: Date;
};

export type VersionRow = {
  id: string;
  versionLabel: string;
  platformCreativeIds: unknown;
  firstSeenAt: Date;
};

export type MarketingStore = {
  upsertConnection(input: ConnectionWrite): Promise<{ id: string }>;
  markConnection(id: string, patch: { status: ConnectionStatus; lastSyncAt: Date | null; lastError: string | null }): Promise<void>;
  startRun(input: RunWrite): Promise<{ id: string }>;
  finishRun(id: string, patch: RunFinish): Promise<void>;
  enabledAccountIds(platform: AdPlatform, workspaceId: string): Promise<string[]>;
  upsertAccount(input: NormalizedSnapshot["accounts"][number] & { workspaceId: string; connectionId: string }): Promise<{ id: string }>;
  findCampaign(workspaceId: string, platform: AdPlatform, externalId: string): Promise<{ id: string } | null>;
  upsertCampaign(input: NormalizedSnapshot["campaigns"][number] & { workspaceId: string; adAccountId: string }): Promise<{ id: string }>;
  findAdGroup(workspaceId: string, platform: AdPlatform, externalId: string): Promise<{ id: string } | null>;
  upsertAdGroup(input: NormalizedSnapshot["adGroups"][number] & { workspaceId: string; campaignId: string }): Promise<{ id: string }>;
  upsertCreative(input: NormalizedSnapshot["creatives"][number] & { workspaceId: string }): Promise<{ id: string }>;
  findCreativeVersion(workspaceId: string, fingerprint: string): Promise<VersionRow | null>;
  versionLabels(creativeId: string): Promise<string[]>;
  insertCreativeVersion(input: NormalizedSnapshot["creatives"][number] & { workspaceId: string; creativeId: string; versionLabel: string }): Promise<{ id: string }>;
  updateCreativeVersion(id: string, input: NormalizedSnapshot["creatives"][number]): Promise<void>;
  findAd(workspaceId: string, platform: AdPlatform, externalId: string): Promise<{ id: string } | null>;
  upsertAd(input: NormalizedSnapshot["ads"][number] & { workspaceId: string; adGroupId: string; creativeVersionId: string | null }): Promise<{ id: string }>;
  upsertAudience(input: NormalizedSnapshot["audiences"][number] & { workspaceId: string; adAccountId: string | null }): Promise<{ id: string }>;
  replaceAdGroupAudiences(adGroupId: string, workspaceId: string, links: { audienceId: string; role: AudienceLinkRole }[]): Promise<void>;
  upsertSegment(input: NormalizedSnapshot["segments"][number] & { workspaceId: string }): Promise<{ id: string }>;
  upsertRaw(input: NormalizedSnapshot["raw"][number] & { workspaceId: string; syncRunId: string }): Promise<void>;
  upsertMetric(
    input: NormalizedSnapshot["metrics"][number] & {
      workspaceId: string;
      campaignId: string | null;
      adGroupId: string | null;
      adId: string;
      creativeVersionId: string | null;
      audienceSegmentId: string;
      sourcePullId: string;
    },
  ): Promise<void>;
};

type MemoryVersion = VersionRow & { creativeId: string; fingerprint: string; fields: NormalizedSnapshot["creatives"][number] };

export type MemoryDump = {
  connections: number;
  accounts: number;
  campaigns: number;
  adGroups: number;
  ads: number;
  creatives: number;
  versions: number;
  audiences: number;
  links: number;
  segments: number;
  metrics: number;
  raw: number;
  runs: number;
  metricSpend: Record<string, string>;
  versionLabels: Record<string, string>;
  metricPulls: Record<string, string>;
  names: Record<string, string>;
};

export function createMemoryStore(): MarketingStore & { dump: () => MemoryDump } {
  let seq = 0;
  const nextId = () => `mem_${++seq}`;
  const connections = new Map<string, { id: string } & ConnectionWrite>();
  const accounts = new Map<string, { id: string; connectionId: string; workspaceId: string; platform: AdPlatform; externalId: string; syncEnabled: boolean }>();
  const campaigns = new Map<string, { id: string }>();
  const adGroups = new Map<string, { id: string }>();
  const ads = new Map<string, { id: string; externalId: string }>();
  const names = new Map<string, string>();
  const creatives = new Map<string, { id: string }>();
  const versions = new Map<string, MemoryVersion>();
  const audiences = new Map<string, { id: string }>();
  const links = new Map<string, { adGroupId: string; workspaceId: string; audienceId: string; role: AudienceLinkRole }>();
  const segments = new Map<string, { id: string }>();
  const metrics = new Map<string, { spend: string; sourcePullId: string; adExternalId: string; date: string }>();
  const raw = new Map<string, unknown>();
  const runs: { id: string; status: SyncStatus }[] = [];

  const store: MarketingStore & { dump: () => MemoryDump } = {
    async upsertConnection(input) {
      const key = `${input.workspaceId}:${input.platform}`;
      const existing = connections.get(key);
      const id = existing?.id ?? nextId();
      connections.set(key, { ...input, id });
      return { id };
    },
    async markConnection(id, patch) {
      for (const [key, row] of connections) {
        if (row.id === id) connections.set(key, { ...row, ...patch });
      }
    },
    async startRun(input) {
      const id = nextId();
      runs.push({ id, status: "running", ...input } as { id: string; status: SyncStatus });
      return { id };
    },
    async finishRun(id, patch) {
      const run = runs.find((item) => item.id === id);
      if (run) run.status = patch.status;
    },
    async enabledAccountIds(platform, workspaceId) {
      return [...accounts.values()]
        .filter((row) => row.platform === platform && row.workspaceId === workspaceId && row.syncEnabled)
        .map((row) => row.externalId);
    },
    async upsertAccount(input) {
      const key = `${input.workspaceId}:${input.platform}:${input.externalId}`;
      const existing = accounts.get(key);
      const id = existing?.id ?? nextId();
      accounts.set(key, {
        id,
        connectionId: input.connectionId,
        workspaceId: input.workspaceId,
        platform: input.platform,
        externalId: input.externalId,
        syncEnabled: existing?.syncEnabled ?? input.syncEnabled,
      });
      return { id };
    },
    async findCampaign(workspaceId, platform, externalId) {
      return campaigns.get(`${workspaceId}:${platform}:${externalId}`) ?? null;
    },
    async upsertCampaign(input) {
      const key = `${input.workspaceId}:${input.platform}:${input.externalId}`;
      const id = campaigns.get(key)?.id ?? nextId();
      campaigns.set(key, { id });
      names.set(`campaign:${input.externalId}`, input.name);
      return { id };
    },
    async findAdGroup(workspaceId, platform, externalId) {
      return adGroups.get(`${workspaceId}:${platform}:${externalId}`) ?? null;
    },
    async upsertAdGroup(input) {
      const key = `${input.workspaceId}:${input.platform}:${input.externalId}`;
      const id = adGroups.get(key)?.id ?? nextId();
      adGroups.set(key, { id });
      names.set(`ad_group:${input.externalId}`, input.name);
      return { id };
    },
    async upsertCreative(input) {
      const key = `${input.workspaceId}:${input.conceptKey}`;
      const id = creatives.get(key)?.id ?? nextId();
      creatives.set(key, { id });
      return { id };
    },
    async findCreativeVersion(workspaceId, fingerprint) {
      const row = versions.get(`${workspaceId}:${fingerprint}`);
      return row ? { id: row.id, versionLabel: row.versionLabel, platformCreativeIds: row.platformCreativeIds, firstSeenAt: row.firstSeenAt } : null;
    },
    async versionLabels(creativeId) {
      return [...versions.values()].filter((row) => row.creativeId === creativeId).map((row) => row.versionLabel);
    },
    async insertCreativeVersion(input) {
      const id = nextId();
      versions.set(`${input.workspaceId}:${input.fingerprint}`, {
        id,
        creativeId: input.creativeId,
        fingerprint: input.fingerprint,
        versionLabel: input.versionLabel,
        platformCreativeIds: input.platformCreativeIds,
        firstSeenAt: new Date(),
        fields: input,
      });
      return { id };
    },
    async updateCreativeVersion(id, input) {
      for (const [key, row] of versions) {
        if (row.id !== id) continue;
        versions.set(key, { ...row, platformCreativeIds: input.platformCreativeIds, fields: { ...row.fields, ...input } });
      }
    },
    async findAd(workspaceId, platform, externalId) {
      const row = ads.get(`${workspaceId}:${platform}:${externalId}`);
      return row ? { id: row.id } : null;
    },
    async upsertAd(input) {
      const key = `${input.workspaceId}:${input.platform}:${input.externalId}`;
      const id = ads.get(key)?.id ?? nextId();
      ads.set(key, { id, externalId: input.externalId });
      names.set(`ad:${input.externalId}`, input.name);
      return { id };
    },
    async upsertAudience(input) {
      const key = `${input.workspaceId}:${input.platform}:${input.externalId}`;
      const id = audiences.get(key)?.id ?? nextId();
      audiences.set(key, { id });
      return { id };
    },
    async replaceAdGroupAudiences(adGroupId, workspaceId, nextLinks) {
      for (const [key, row] of links) {
        if (row.adGroupId === adGroupId) links.delete(key);
      }
      for (const link of nextLinks) {
        links.set(`${adGroupId}:${link.audienceId}:${link.role}`, { adGroupId, workspaceId, ...link });
      }
    },
    async upsertSegment(input) {
      const key = `${input.workspaceId}:${input.kind}:${input.segmentKey}`;
      const id = segments.get(key)?.id ?? nextId();
      segments.set(key, { id });
      return { id };
    },
    async upsertRaw(input) {
      raw.set(`${input.workspaceId}:${input.platform}:${input.objectType}:${input.externalId}`, input.payload);
    },
    async upsertMetric(input) {
      const key = `${input.workspaceId}|${input.date}|${input.platform}|${input.adId}|${input.audienceSegmentId}|${input.attributionWindow}`;
      metrics.set(key, { spend: input.spend, sourcePullId: input.sourcePullId, adExternalId: input.adExternalId, date: input.date });
    },
    dump() {
      const metricSpend: Record<string, string> = {};
      const metricPulls: Record<string, string> = {};
      for (const row of metrics.values()) {
        const key = `${row.adExternalId}|${row.date}`;
        metricSpend[key] = row.spend;
        metricPulls[key] = row.sourcePullId;
      }
      const versionLabels: Record<string, string> = {};
      for (const row of versions.values()) versionLabels[row.fingerprint] = row.versionLabel;
      return {
        connections: connections.size,
        accounts: accounts.size,
        campaigns: campaigns.size,
        adGroups: adGroups.size,
        ads: ads.size,
        creatives: creatives.size,
        versions: versions.size,
        audiences: audiences.size,
        links: links.size,
        segments: segments.size,
        metrics: metrics.size,
        raw: raw.size,
        runs: runs.length,
        metricSpend,
        versionLabels,
        metricPulls,
        names: Object.fromEntries(names),
      };
    },
  };
  return store;
}

/**
 * Stores StackAdapt CTV conversion attribution for mapped advertisers.
 * STACKADAPT_CTV_LIVE off makes no request. INTEGRATIONS_MODE is not consulted.
 * A successful read replaces that client's daily rows in the window.
 * Breakdown rows are replaced per chunk that actually finished, for that client and dimension.
 */

import { createHash } from "node:crypto";
import { addDaysISO, zonedISODate } from "../../time";
import { clientForStackAdaptCampaign, liveStackAdaptAdvertiserIds, type StackAdaptClientRule } from "../client-campaign-scope";
import { ctvBreakdownChunkDays, decideStackAdaptCtv, lookbackDays, type Env } from "../config";
import { mapStackAdaptStatus } from "../connectors/stackadapt-status";
import type { FetchLike } from "../connectors/stackadapt-client";
import { WORKSPACE_ID } from "../types";
import { BREAKDOWN_UNAVAILABLE, pullStackAdaptCtvAttribution } from "./attribution-graphql";
import type { CtvAttributionRow, CtvBreakdownKind, CtvBreakdownTotal } from "./attribution";
import { isExplicitCtvType } from "./parse";
import { isMissingCtvTable } from "./store";
import type { CtvLiveCampaign } from "./live-sync";

export type CtvAttributionMetaState = {
  clientId: string;
  ipSplitAvailable: boolean;
  pixelAvailable: boolean;
  pixelNote: string;
  breakdownNote: string;
  breakdownCovered: number;
  breakdownTotal: number;
  breakdownGaps: string;
};

const BREAKDOWN_DIMENSIONS: CtvBreakdownKind[] = ["publisher", "app", "device", "geo"];

export type CtvBreakdownChunkReplace = {
  dimension: CtvBreakdownKind;
  rangeStart: string;
  rangeEnd: string;
  rows: CtvBreakdownTotal[];
};

export type CtvAttributionStore = {
  rows: CtvAttributionRow[];
  breakdowns: CtvBreakdownTotal[];
  metas: CtvAttributionMetaState[];
  segments: { exampleData: boolean }[];
  campaigns: CtvLiveCampaign[];
  examplesCleared: boolean;
  replaceClient(clientId: string, from: string, to: string, rows: CtvAttributionRow[]): void;
  replaceBreakdownChunks(clientId: string, chunks: CtvBreakdownChunkReplace[]): void;
  setMeta(meta: CtvAttributionMetaState): void;
  rememberChannel(externalId: string, channelType: string, clientId: string | null, name: string, status: string): void;
  clearExamples(): void;
};

export function memoryCtvAttributionStore(input: {
  campaigns?: CtvLiveCampaign[];
  rows?: CtvAttributionRow[];
  breakdowns?: CtvBreakdownTotal[];
  segments?: { exampleData: boolean }[];
} = {}): CtvAttributionStore {
  const box: CtvAttributionStore = {
    rows: (input.rows ?? []).map((row) => ({ ...row })),
    breakdowns: (input.breakdowns ?? []).map((row) => ({ ...row })),
    metas: [],
    segments: (input.segments ?? []).map((row) => ({ ...row })),
    campaigns: (input.campaigns ?? []).map((row) => ({ ...row })),
    examplesCleared: false,
    replaceClient(clientId, from, to, rows) {
      box.rows = box.rows.filter((row) => row.exampleData || row.clientId !== clientId || row.date < from || row.date > to);
      box.rows.push(...rows.map((row) => ({ ...row, exampleData: false as const })));
    },
    replaceBreakdownChunks(clientId, chunks) {
      for (const chunk of chunks) {
        box.breakdowns = box.breakdowns.filter((row) => row.exampleData || row.clientId !== clientId || row.dimension !== chunk.dimension || row.rangeStart !== chunk.rangeStart || row.rangeEnd !== chunk.rangeEnd);
        box.breakdowns.push(...chunk.rows.map((row) => ({ ...row, exampleData: false as const })));
      }
    },
    setMeta(meta) {
      box.metas = box.metas.filter((row) => row.clientId !== meta.clientId);
      box.metas.push({ ...meta });
    },
    rememberChannel(externalId, channelType, clientId, name, status) {
      const existing = box.campaigns.find((row) => row.externalId === externalId);
      const naming = namingWithChannel(existing?.namingParsed, channelType);
      if (!existing) {
        box.campaigns.push({ id: `new-${externalId}`, externalId, name, clientId, status, channelType, namingParsed: naming });
        return;
      }
      existing.channelType = channelType;
      existing.namingParsed = naming;
      existing.name = name || existing.name;
      existing.status = status || existing.status;
      if (clientId) existing.clientId = clientId;
    },
    clearExamples() {
      box.rows = box.rows.filter((row) => !row.exampleData);
      box.breakdowns = box.breakdowns.filter((row) => !row.exampleData);
      box.segments = box.segments.filter((row) => !row.exampleData);
      box.examplesCleared = true;
    },
  };
  return box;
}

function namingWithChannel(parsed: unknown, channelType: string) {
  const next: Record<string, string> = {};
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string") next[key] = value;
    }
  }
  if (channelType) next.channelType = channelType;
  return next;
}

function rowKey(row: CtvAttributionRow) {
  const raw = [row.clientId, row.date, row.campaignId, row.grain, row.pixelId, row.breakdown, row.breakdownName].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 40);
}

function money(value: number) {
  return value.toFixed(4);
}

function blank(partial: Omit<CtvAttributionRow, "pixelId" | "pixelName" | "breakdown" | "breakdownName" | "ipConversions" | "cookieConversions" | "exampleData"> & Partial<CtvAttributionRow>): CtvAttributionRow {
  return {
    pixelId: "",
    pixelName: "",
    breakdown: "",
    breakdownName: "",
    ipConversions: 0,
    cookieConversions: 0,
    exampleData: false,
    ...partial,
  };
}

export async function saveCtvAttribution(workspaceId: string, clientId: string, from: string, to: string, rows: CtvAttributionRow[], meta: CtvAttributionMetaState, chunks: CtvBreakdownChunkReplace[] = [], replaceDays = true) {
  const { prisma } = await import("../../db");
  const kept = rows.filter((row) => row.date >= from && row.date <= to);
  await prisma.$transaction(async (tx) => {
    if (replaceDays) {
      await tx.ctvAttributionDay.deleteMany({
        where: {
          workspaceId,
          clientId,
          exampleData: false,
          date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) },
        },
      });
      if (kept.length) {
        await tx.ctvAttributionDay.createMany({
          data: kept.map((row) => ({
            workspaceId,
            clientId: row.clientId,
            date: new Date(`${row.date}T00:00:00.000Z`),
            platform: "stackadapt",
            identityKey: rowKey(row),
            campaignId: row.campaignId,
            campaignName: row.campaignName,
            grain: row.grain,
            pixelId: row.pixelId,
            pixelName: row.pixelName,
            breakdown: row.breakdown,
            breakdownName: row.breakdownName,
            impressions: BigInt(Math.round(row.impressions)),
            clickConversions: money(row.clickConversions),
            viewConversions: money(row.viewConversions),
            ipConversions: money(row.ipConversions),
            cookieConversions: money(row.cookieConversions),
            spend: money(row.spend),
            exampleData: false,
          })),
        });
      }
    }
    for (const chunk of chunks) {
      await tx.ctvAttributionBreakdown.deleteMany({
        where: {
          workspaceId,
          clientId,
          exampleData: false,
          dimension: chunk.dimension,
          rangeStart: new Date(`${chunk.rangeStart}T00:00:00.000Z`),
          rangeEnd: new Date(`${chunk.rangeEnd}T00:00:00.000Z`),
        },
      });
      if (chunk.rows.length) {
        await tx.ctvAttributionBreakdown.createMany({
          data: chunk.rows.map((row) => ({
            workspaceId,
            clientId: row.clientId,
            campaignId: row.campaignId,
            campaignName: row.campaignName,
            dimension: row.dimension,
            name: row.name,
            rangeStart: new Date(`${row.rangeStart}T00:00:00.000Z`),
            rangeEnd: new Date(`${row.rangeEnd}T00:00:00.000Z`),
            impressions: BigInt(Math.round(row.impressions)),
            clickConversions: money(row.clickConversions),
            viewConversions: money(row.viewConversions),
            spend: money(row.spend),
            exampleData: false,
          })),
        });
      }
    }
    const remaining = await tx.ctvAttributionBreakdown.count({ where: { workspaceId, clientId, exampleData: false } });
    const breakdownNote = remaining > 0 ? "" : meta.breakdownNote;
    await tx.ctvAttributionMeta.upsert({
      where: { workspaceId_clientId: { workspaceId, clientId } },
      create: { workspaceId, ...meta, breakdownNote },
      update: {
        ipSplitAvailable: meta.ipSplitAvailable,
        pixelAvailable: meta.pixelAvailable,
        pixelNote: meta.pixelNote,
        breakdownNote,
        breakdownCovered: meta.breakdownCovered,
        breakdownTotal: meta.breakdownTotal,
        breakdownGaps: meta.breakdownGaps,
      },
    });
  });
}

export async function clearExampleCtvAttribution(workspaceId: string) {
  const { prisma } = await import("../../db");
  await prisma.ctvAttributionDay.deleteMany({ where: { workspaceId, exampleData: true } });
  await prisma.ctvAttributionBreakdown.deleteMany({ where: { workspaceId, exampleData: true } });
  await prisma.ctvSegmentRead.deleteMany({ where: { workspaceId, exampleData: true } });
}

async function rememberPrismaChannel(workspaceId: string, externalId: string, channelType: string, clientId: string | null, name: string, status: string) {
  const { prisma } = await import("../../db");
  const existing = await prisma.campaign.findUnique({
    where: { workspaceId_platform_externalId: { workspaceId, platform: "stackadapt", externalId } },
    select: { id: true, namingParsed: true },
  });
  if (!existing) return;
  await prisma.campaign.update({
    where: { id: existing.id },
    data: {
      channelType,
      namingParsed: namingWithChannel(existing.namingParsed, channelType),
      ...(clientId ? { clientId } : {}),
      ...(name ? { name } : {}),
      ...(status ? { status: mapStackAdaptStatus(status) } : {}),
    },
  });
}

export async function runStackAdaptCtvAttribution(options: {
  env?: Env;
  now?: Date;
  timezone?: string;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  clock?: () => number;
  workspaceId?: string;
  advertisers?: StackAdaptClientRule[];
  store?: CtvAttributionStore;
} = {}) {
  const env = options.env ?? process.env;
  const decision = decideStackAdaptCtv(env);
  if (decision.action !== "live") {
    return { status: "skipped" as const, reason: decision.action === "mock" ? "MARKETING_SYNC_MODE=mock" : decision.reason, outbound: 0 };
  }
  const rules = options.advertisers ?? (await loadRules());
  const advertiserIds = liveStackAdaptAdvertiserIds(rules);
  if (!advertiserIds.length) return { status: "skipped" as const, reason: "no StackAdapt advertiser is mapped", outbound: 0 };
  const now = options.now ?? new Date();
  const until = zonedISODate(now, options.timezone ?? "America/New_York");
  const since = addDaysISO(until, -(lookbackDays(env) - 1));
  const workspaceId = options.workspaceId ?? WORKSPACE_ID;
  let outbound = 0;
  const warnings: string[] = [];
  let wrote = false;
  const fetchImpl: FetchLike = async (url, init) => {
    outbound += 1;
    const impl = options.fetchImpl ?? fetch;
    return impl(url, init);
  };
  for (const advertiserId of advertiserIds) {
    try {
      const pulled = await pullStackAdaptCtvAttribution({
        apiKey: decision.apiKey,
        from: since,
        to: until,
        advertiserId,
        fetchImpl,
        chunkDays: ctvBreakdownChunkDays(env),
        sleep: options.sleep,
        now: options.clock,
      });
      warnings.push(...pulled.warnings);
      const byClient = new Map<string, CtvAttributionRow[]>();
      const writesByClient = new Map<string, CtvBreakdownChunkReplace[]>();
      const seen = new Map<string, { channelType: string; clientId: string | null; name: string; status: string }>();
      const consider = (campaign: { campaignId: string; campaignName: string; channelType: string; status?: string }) => {
        if (!campaign.channelType || !campaign.campaignId) return null;
        const clientId = clientForStackAdaptCampaign(rules, {
          name: campaign.campaignName,
          namingParsed: { stackadaptAdvertiserId: advertiserId },
        });
        const previous = seen.get(campaign.campaignId);
        seen.set(campaign.campaignId, {
          channelType: campaign.channelType,
          clientId: clientId || previous?.clientId || null,
          name: campaign.campaignName,
          status: campaign.status || previous?.status || "",
        });
        if (!isExplicitCtvType(campaign.channelType) || !clientId) return null;
        return clientId;
      };
      for (const record of pulled.rows) {
        const clientId = consider(record);
        if (!clientId || !record.date) continue;
        const list = byClient.get(clientId) ?? [];
        list.push(blank({
          clientId,
          date: record.date,
          campaignId: record.campaignId,
          campaignName: record.campaignName,
          grain: "campaign",
          impressions: record.impressions,
          clickConversions: record.clickConversions,
          viewConversions: record.viewConversions,
          ipConversions: pulled.ipSplitAvailable ? record.ipConversions : 0,
          cookieConversions: pulled.ipSplitAvailable ? record.cookieConversions : 0,
          spend: record.spend,
        }));
        byClient.set(clientId, list);
      }
      for (const record of pulled.pixels) {
        const clientId = consider({ ...record, status: "" });
        if (!clientId || !record.date) continue;
        const list = byClient.get(clientId) ?? [];
        list.push(blank({
          clientId,
          date: record.date,
          campaignId: record.campaignId,
          campaignName: record.campaignName,
          grain: "pixel",
          pixelId: record.pixelId,
          pixelName: record.pixelName,
          impressions: record.impressions,
          clickConversions: record.clickConversions,
          viewConversions: record.viewConversions,
          cookieConversions: record.cookieConversions,
          spend: record.spend,
        }));
        byClient.set(clientId, list);
      }
      const scopedClients = new Set<string>();
      for (const campaign of seen.values()) {
        if (campaign.clientId) scopedClients.add(campaign.clientId);
      }
      for (const write of pulled.breakdownWrites) {
        const rowsByClient = new Map<string, CtvBreakdownTotal[]>();
        for (const record of write.rows) {
          const clientId = consider({ ...record, status: "" });
          if (!clientId || record.kind !== write.dimension) continue;
          const row: CtvBreakdownTotal = {
            clientId,
            campaignId: record.campaignId,
            campaignName: record.campaignName,
            dimension: write.dimension,
            name: record.name,
            rangeStart: write.from,
            rangeEnd: write.to,
            impressions: record.impressions,
            clickConversions: record.clickConversions,
            viewConversions: record.viewConversions,
            spend: record.spend,
            exampleData: false,
          };
          const list = rowsByClient.get(clientId) ?? [];
          list.push(row);
          rowsByClient.set(clientId, list);
          scopedClients.add(clientId);
        }
        for (const clientId of scopedClients) {
          const chunks = writesByClient.get(clientId) ?? [];
          chunks.push({
            dimension: write.dimension,
            rangeStart: write.from,
            rangeEnd: write.to,
            rows: rowsByClient.get(clientId) ?? [],
          });
          writesByClient.set(clientId, chunks);
        }
      }
      for (const [externalId, campaign] of seen) {
        if (options.store) options.store.rememberChannel(externalId, campaign.channelType, campaign.clientId, campaign.name, campaign.status);
        else await rememberPrismaChannel(workspaceId, externalId, campaign.channelType, campaign.clientId, campaign.name, campaign.status);
      }
      const metaBase = {
        ipSplitAvailable: pulled.ipSplitAvailable,
        pixelAvailable: pulled.pixelAvailable,
        pixelNote: pulled.pixelNote,
        breakdownCovered: pulled.breakdownCovered,
        breakdownTotal: pulled.breakdownTotal,
        breakdownGaps: pulled.breakdownGaps,
      };
      const clients = new Set([...byClient.keys(), ...writesByClient.keys()]);
      for (const clientId of clients) {
        const rows = byClient.get(clientId) ?? [];
        const chunks = writesByClient.get(clientId) ?? [];
        const meta = {
          clientId,
          ...metaBase,
          breakdownNote: pulled.breakdownNote || BREAKDOWN_UNAVAILABLE,
        };
        if (options.store) {
          if (rows.length || byClient.has(clientId)) options.store.replaceClient(clientId, since, until, rows);
          options.store.replaceBreakdownChunks(clientId, chunks);
          const remaining = options.store.breakdowns.some((row) => row.clientId === clientId && !row.exampleData);
          options.store.setMeta({ ...meta, breakdownNote: remaining ? "" : meta.breakdownNote });
        } else {
          await saveCtvAttribution(workspaceId, clientId, since, until, rows, meta, chunks, byClient.has(clientId));
        }
      }
      wrote = true;
    } catch (error) {
      if (isMissingCtvTable(error)) {
        warnings.push("CTV attribution storage is not available yet.");
        break;
      }
      warnings.push(error instanceof Error ? error.message : "StackAdapt CTV attribution read failed");
    }
  }
  if (wrote) {
    if (options.store) options.store.clearExamples();
    else await clearExampleCtvAttribution(workspaceId);
  }
  return {
    status: warnings.length && !wrote ? ("failed" as const) : ("succeeded" as const),
    outbound,
    since,
    until,
    warnings,
  };
}

async function loadRules() {
  const { prisma } = await import("../../db");
  return prisma.marketingClient.findMany({
    where: { workspaceId: WORKSPACE_ID },
    select: { id: true, stackadaptAdvertiserIds: true, stackadaptLiveRead: true, stackadaptCampaignNameContains: true },
  });
}

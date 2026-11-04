/**
 * Stores StackAdapt CTV delivery for mapped advertisers.
 * STACKADAPT_CTV_LIVE off makes no request. INTEGRATIONS_MODE is not consulted.
 */

import { createHash } from "node:crypto";
import { addDaysISO, zonedISODate } from "../../time";
import { clientForStackAdaptCampaign, liveStackAdaptAdvertiserIds, type StackAdaptClientRule } from "../client-campaign-scope";
import { decideStackAdaptCtv, lookbackDays, type Env } from "../config";
import { mapStackAdaptStatus } from "../connectors/stackadapt-status";
import type { FetchLike } from "../connectors/stackadapt-client";
import { WORKSPACE_ID } from "../types";
import { pullStackAdaptCtvDelivery } from "./graphql";
import { isExplicitCtvType, type CtvGraphqlDelivery } from "./parse";
import { isMissingCtvTable } from "./store";

export type CtvLiveCampaign = {
  id: string;
  externalId: string;
  name: string;
  clientId: string | null;
  status: string;
  channelType: string;
  namingParsed: unknown;
};

export type CtvLiveDay = {
  clientId: string;
  date: string;
  campaignId: string;
  campaignName: string;
  channelType: string;
  impressions: number;
  uniqueImpressions: number;
  frequency: number;
  videoStarts: number;
  completion25: number;
  completion50: number;
  completion75: number;
  completion100: number;
  clickConversions: number;
  viewConversions: number;
  spend: number;
  exampleData: boolean;
};

export type CtvLiveStore = {
  campaigns: CtvLiveCampaign[];
  days: CtvLiveDay[];
  examplesCleared: boolean;
  replaceClient(clientId: string, from: string, to: string, rows: CtvLiveDay[]): void;
  rememberChannel(externalId: string, channelType: string, clientId: string | null, name: string, status: string): void;
  clearExamples(): void;
};

export function memoryCtvLiveStore(campaigns: CtvLiveCampaign[] = [], days: CtvLiveDay[] = []): CtvLiveStore {
  const box: CtvLiveStore = {
    campaigns: campaigns.map((row) => ({ ...row })),
    days: days.map((row) => ({ ...row })),
    examplesCleared: false,
    replaceClient(clientId, from, to, rows) {
      box.days = box.days.filter((row) => row.exampleData || row.clientId !== clientId || row.date < from || row.date > to);
      box.days.push(...rows.map((row) => ({ ...row, exampleData: false as const })));
    },
    rememberChannel(externalId, channelType, clientId, name, status) {
      const existing = box.campaigns.find((row) => row.externalId === externalId);
      const naming = namingWithChannel(existing?.namingParsed, channelType);
      if (!existing) {
        box.campaigns.push({
          id: `new-${externalId}`,
          externalId,
          name,
          clientId,
          status,
          channelType,
          namingParsed: naming,
        });
        return;
      }
      existing.channelType = channelType;
      existing.namingParsed = naming;
      existing.name = name || existing.name;
      existing.status = status || existing.status;
      if (clientId) existing.clientId = clientId;
    },
    clearExamples() {
      box.days = box.days.filter((row) => !row.exampleData);
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

function dayKey(row: CtvLiveDay) {
  const raw = [row.clientId, row.date, row.campaignId, row.channelType].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 40);
}

function money(value: number) {
  return value.toFixed(4);
}

export async function saveCtvLiveDays(workspaceId: string, clientId: string, from: string, to: string, rows: CtvLiveDay[]) {
  const { prisma } = await import("../../db");
  try {
    await prisma.$transaction(async (tx) => {
      await tx.ctvDeliveryDay.deleteMany({
        where: {
          workspaceId,
          clientId,
          exampleData: false,
          date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) },
        },
      });
      if (!rows.length) return;
      await tx.ctvDeliveryDay.createMany({
        data: rows.map((row) => ({
          workspaceId,
          clientId: row.clientId,
          date: new Date(`${row.date}T00:00:00.000Z`),
          platform: "stackadapt",
          identityKey: dayKey(row),
          campaignId: row.campaignId,
          campaignName: row.campaignName,
          impressions: BigInt(Math.round(row.impressions)),
          uniqueImpressions: BigInt(Math.round(row.uniqueImpressions)),
          frequency: money(row.frequency),
          videoStarts: BigInt(Math.round(row.videoStarts)),
          completion25: BigInt(Math.round(row.completion25)),
          completion50: BigInt(Math.round(row.completion50)),
          completion75: BigInt(Math.round(row.completion75)),
          completion100: BigInt(Math.round(row.completion100)),
          spend: money(row.spend),
          clickConversions: money(row.clickConversions),
          viewConversions: money(row.viewConversions),
          exampleData: false,
        })),
      });
    });
  } catch (error) {
    if (isMissingCtvTable(error)) return;
    throw error;
  }
}

export async function clearExampleCtvDays(workspaceId: string) {
  const { prisma } = await import("../../db");
  try {
    await prisma.ctvDeliveryDay.deleteMany({ where: { workspaceId, exampleData: true } });
  } catch (error) {
    if (isMissingCtvTable(error)) return;
    throw error;
  }
}

async function rememberPrismaChannel(workspaceId: string, externalId: string, channelType: string, clientId: string | null, name: string, status: string) {
  const { prisma } = await import("../../db");
  const existing = await prisma.campaign.findUnique({
    where: { workspaceId_platform_externalId: { workspaceId, platform: "stackadapt", externalId } },
    select: { id: true, namingParsed: true, clientId: true },
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

function groupRows(rules: StackAdaptClientRule[], records: CtvGraphqlDelivery[], advertiserId: string) {
  const byClient = new Map<string, CtvLiveDay[]>();
  const seen = new Map<string, { channelType: string; clientId: string | null; name: string; status: string }>();
  for (const record of records) {
    if (!record.channelType || !record.campaignId) continue;
    const clientId = clientForStackAdaptCampaign(rules, {
      name: record.campaignName,
      namingParsed: { stackadaptAdvertiserId: advertiserId },
    });
    const previous = seen.get(record.campaignId);
    seen.set(record.campaignId, {
      channelType: record.channelType,
      clientId: clientId || previous?.clientId || null,
      name: record.campaignName,
      status: record.status,
    });
    if (!isExplicitCtvType(record.channelType) || !clientId || !record.date) continue;
    const list = byClient.get(clientId) ?? [];
    list.push({
      clientId,
      date: record.date,
      campaignId: record.campaignId,
      campaignName: record.campaignName,
      channelType: record.channelType,
      impressions: record.impressions,
      uniqueImpressions: record.uniqueImpressions,
      frequency: record.frequency,
      videoStarts: record.videoStarts,
      completion25: record.completion25,
      completion50: record.completion50,
      completion75: record.completion75,
      completion100: record.completion100,
      clickConversions: record.clickConversions,
      viewConversions: record.viewConversions,
      spend: record.spend,
      exampleData: false,
    });
    byClient.set(clientId, list);
  }
  return { byClient, seen };
}

export async function runStackAdaptCtvSync(options: {
  env?: Env;
  now?: Date;
  timezone?: string;
  fetchImpl?: FetchLike;
  workspaceId?: string;
  advertisers?: StackAdaptClientRule[];
  store?: CtvLiveStore;
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
  for (const advertiserId of advertiserIds) {
    try {
      const pulled = await pullStackAdaptCtvDelivery({
        apiKey: decision.apiKey,
        from: since,
        to: until,
        advertiserId,
        fetchImpl: async (url, init) => {
          outbound += 1;
          const impl = options.fetchImpl ?? fetch;
          return impl(url, init);
        },
      });
      warnings.push(...pulled.warnings);
      const grouped = groupRows(rules, pulled.rows, advertiserId);
      for (const [externalId, campaign] of grouped.seen) {
        if (options.store) options.store.rememberChannel(externalId, campaign.channelType, campaign.clientId, campaign.name, campaign.status);
        else await rememberPrismaChannel(workspaceId, externalId, campaign.channelType, campaign.clientId, campaign.name, campaign.status);
      }
      for (const [clientId, rows] of grouped.byClient) {
        if (options.store) options.store.replaceClient(clientId, since, until, rows);
        else await saveCtvLiveDays(workspaceId, clientId, since, until, rows);
      }
      wrote = true;
    } catch (error) {
      if (isMissingCtvTable(error)) {
        warnings.push("CTV delivery storage is not available yet.");
        break;
      }
      warnings.push(error instanceof Error ? error.message : "StackAdapt CTV read failed");
    }
  }
  if (wrote) {
    if (options.store) options.store.clearExamples();
    else await clearExampleCtvDays(workspaceId);
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

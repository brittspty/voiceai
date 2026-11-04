import { prisma } from "../../db";
import { zonedISODate } from "../../time";
import { canSwitchMarketingClient, type MarketingAccess } from "../access";
import { stackAdaptCtvLiveEnabled, type Env } from "../config";
import type { DashWindow } from "../dashboard-model";
import { realClientId, type RealStatus } from "../real-view";
import { WORKSPACE_ID } from "../types";
import { isolatedWhere } from "../workspace";
import { buildCtvAttributionPage, releaseCtvAttribution, type CtvAttributionPage, type CtvBreakdownKind, type CtvBreakdownTotal } from "./attribution";
import { isMissingCtvTable } from "./store";

function num(value: bigint | number | { toString(): string } | null | undefined) {
  if (value == null) return 0;
  const parsed = typeof value === "bigint" ? Number(value) : Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

const BREAKDOWN_KINDS = new Set(["publisher", "app", "device", "geo"]);

function breakdownKind(value: string): CtvBreakdownKind | "" {
  return BREAKDOWN_KINDS.has(value) ? (value as CtvBreakdownKind) : "";
}

function mapBreakdown(row: {
  clientId: string;
  campaignId: string;
  campaignName: string;
  dimension: string;
  name: string;
  rangeStart: Date;
  rangeEnd: Date;
  impressions: bigint | number | { toString(): string };
  clickConversions: { toString(): string } | number;
  viewConversions: { toString(): string } | number;
  spend?: { toString(): string } | number;
}, showMoney: boolean): CtvBreakdownTotal | null {
  const dimension = breakdownKind(row.dimension);
  if (!dimension) return null;
  return {
    clientId: row.clientId,
    campaignId: row.campaignId,
    campaignName: row.campaignName,
    dimension,
    name: row.name,
    rangeStart: row.rangeStart.toISOString().slice(0, 10),
    rangeEnd: row.rangeEnd.toISOString().slice(0, 10),
    impressions: num(row.impressions),
    clickConversions: num(row.clickConversions),
    viewConversions: num(row.viewConversions),
    spend: showMoney && row.spend != null ? num(row.spend) : 0,
  };
}

/**
 * Stored CTV attribution for the signed-in viewer.
 * Returns null while STACKADAPT_CTV_LIVE is off so the example page stays.
 */
export async function loadCtvAttributionPage(input: {
  access: MarketingAccess;
  requestedClientId?: string | null;
  days: DashWindow;
  status: RealStatus;
  path: string;
  now?: Date;
  env?: Env;
}): Promise<CtvAttributionPage | null> {
  const env = input.env ?? process.env;
  if (!stackAdaptCtvLiveEnabled(env)) return null;
  const staff = canSwitchMarketingClient(input.access);
  const showMoney = Boolean(input.access.seesCost && staff);
  const endDate = zonedISODate(input.now ?? new Date(), "America/New_York");
  const blank = buildCtvAttributionPage({
    showMoney,
    staff,
    clientId: null,
    clientName: staff ? "All clients" : "Your campaigns",
    days: input.days,
    status: input.status,
    path: input.path,
    endDate,
    ipSplitAvailable: false,
    pixelAvailable: false,
    pixelNote: "No CTV attribution stored yet.",
    campaigns: [],
    rows: [],
  });
  const workspaceId = input.access.workspaceId.trim();
  if (!workspaceId || input.access.kind === "none") return blank;
  try {
    const clients = staff
      ? await prisma.marketingClient.findMany({
          where: isolatedWhere(workspaceId),
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : [];
    const clientId = realClientId({
      enabled: true,
      staff,
      requestedId: input.requestedClientId ?? null,
      knownIds: clients.map((row) => row.id),
    });
    const where: {
      platform: "stackadapt";
      status: { notIn: ("archived" | "deleted")[] };
      id?: { in: string[] };
      adAccountId?: { in: string[] };
      clientId?: string;
    } = {
      platform: "stackadapt",
      status: { notIn: ["archived", "deleted"] },
    };
    if (input.access.campaigns !== "all") where.id = { in: input.access.campaigns };
    else if (input.access.accounts !== "all") where.adAccountId = { in: input.access.accounts };
    if (clientId) where.clientId = clientId;
    const selected = clientId ? clients.find((row) => row.id === clientId) : null;
    const clientName = selected?.name || (staff ? "All clients" : "Your campaigns");
    if (where.id && where.id.in.length === 0) {
      return { ...blank, clientId, clientName, clients };
    }
    const campaigns = await prisma.campaign.findMany({
      where: isolatedWhere(workspaceId, where),
      orderBy: { name: "asc" },
      select: { id: true, externalId: true, name: true, clientId: true, status: true, channelType: true, namingParsed: true },
    });
    const ids = campaigns.map((row) => row.externalId).filter(Boolean);
    const stored = ids.length
      ? await prisma.ctvAttributionDay.findMany({
          where: isolatedWhere(workspaceId, {
            campaignId: { in: ids },
            exampleData: false,
            ...(clientId ? { clientId } : {}),
          }),
          select: {
            clientId: true,
            campaignId: true,
            campaignName: true,
            date: true,
            grain: true,
            pixelId: true,
            pixelName: true,
            breakdown: true,
            breakdownName: true,
            impressions: true,
            clickConversions: true,
            viewConversions: true,
            ipConversions: true,
            cookieConversions: true,
            ...(showMoney ? { spend: true } : {}),
          },
        })
      : [];
    const storedBreakdowns = ids.length
      ? await prisma.ctvAttributionBreakdown.findMany({
      where: isolatedWhere(workspaceId, {
        exampleData: false,
        campaignId: { in: ids },
        ...(clientId ? { clientId } : {}),
      }),
      select: {
        clientId: true,
        campaignId: true,
        campaignName: true,
        dimension: true,
        name: true,
        rangeStart: true,
        rangeEnd: true,
        impressions: true,
        clickConversions: true,
        viewConversions: true,
        ...(showMoney ? { spend: true } : {}),
      },
    })
      : [];
    const metas = await prisma.ctvAttributionMeta.findMany({
      where: isolatedWhere(workspaceId, clientId ? { clientId } : {}),
    });
    const relevant = clientId ? metas.filter((row) => row.clientId === clientId) : metas;
    const ipSplitAvailable = relevant.length > 0 && relevant.every((row) => row.ipSplitAvailable);
    const pixelAvailable = relevant.length > 0 && relevant.every((row) => row.pixelAvailable);
    const pixelNote = relevant.map((row) => row.pixelNote).find(Boolean) || "";
    const breakdownNote = relevant.map((row) => row.breakdownNote).find(Boolean) || "";
    return buildCtvAttributionPage({
      showMoney,
      staff,
      clientId,
      clientName,
      clients,
      days: input.days,
      status: input.status,
      path: input.path,
      endDate,
      updatedLabel: stored.length ? endDate : "not yet",
      ipSplitAvailable,
      pixelAvailable,
      pixelNote,
      breakdownNote,
      campaigns,
      rows: stored.map((row) => ({
        clientId: row.clientId,
        campaignId: row.campaignId,
        campaignName: row.campaignName,
        date: row.date.toISOString().slice(0, 10),
        grain: row.grain === "pixel" || row.grain === "breakdown" ? row.grain : "campaign",
        pixelId: row.pixelId,
        pixelName: row.pixelName,
        breakdown: BREAKDOWN_KINDS.has(row.breakdown) ? (row.breakdown as CtvBreakdownKind) : "",
        breakdownName: row.breakdownName,
        impressions: num(row.impressions),
        clickConversions: num(row.clickConversions),
        viewConversions: num(row.viewConversions),
        ipConversions: num(row.ipConversions),
        cookieConversions: num(row.cookieConversions),
        ...(showMoney && "spend" in row ? { spend: num(row.spend) } : { spend: 0 }),
      })),
      breakdowns: storedBreakdowns.flatMap((row) => {
        const mapped = mapBreakdown(row, showMoney);
        return mapped ? [mapped] : [];
      }),
    });
  } catch (error) {
    if (isMissingCtvTable(error)) return blank;
    throw error;
  }
}

/** Public plans never receive cost. A missing table omits the block. */
export async function loadPlanAttribution(clientName: string, env: Env = process.env): Promise<CtvAttributionPage | null> {
  if (!stackAdaptCtvLiveEnabled(env)) return null;
  try {
    const client = clientName.trim()
      ? await prisma.marketingClient.findFirst({
          where: { workspaceId: WORKSPACE_ID, name: clientName },
          select: { id: true, name: true },
        })
      : null;
    if (!client) return null;
    const campaigns = await prisma.campaign.findMany({
      where: { clientId: client.id, platform: "stackadapt" },
      select: { id: true, externalId: true, name: true, clientId: true, status: true, channelType: true, namingParsed: true },
    });
    const stored = await prisma.ctvAttributionDay.findMany({
      where: { clientId: client.id, exampleData: false },
      select: {
        clientId: true,
        campaignId: true,
        campaignName: true,
        date: true,
        grain: true,
        pixelId: true,
        pixelName: true,
        breakdown: true,
        breakdownName: true,
        impressions: true,
        clickConversions: true,
        viewConversions: true,
        ipConversions: true,
        cookieConversions: true,
      },
    });
    const storedBreakdowns = await prisma.ctvAttributionBreakdown.findMany({
      where: { clientId: client.id, exampleData: false },
      select: {
        clientId: true,
        campaignId: true,
        campaignName: true,
        dimension: true,
        name: true,
        rangeStart: true,
        rangeEnd: true,
        impressions: true,
        clickConversions: true,
        viewConversions: true,
      },
    });
    const meta = await prisma.ctvAttributionMeta.findUnique({
      where: { workspaceId_clientId: { workspaceId: WORKSPACE_ID, clientId: client.id } },
    });
    const page = buildCtvAttributionPage({
      showMoney: false,
      staff: false,
      clientId: client.id,
      clientName: client.name,
      days: 30,
      status: "",
      endDate: zonedISODate(new Date(), "America/New_York"),
      ipSplitAvailable: Boolean(meta?.ipSplitAvailable),
      pixelAvailable: Boolean(meta?.pixelAvailable),
      pixelNote: meta?.pixelNote || "",
      breakdownNote: meta?.breakdownNote || "",
      campaigns,
      rows: stored.map((row) => ({
        clientId: row.clientId,
        campaignId: row.campaignId,
        campaignName: row.campaignName,
        date: row.date.toISOString().slice(0, 10),
        grain: row.grain === "pixel" || row.grain === "breakdown" ? row.grain : "campaign",
        pixelId: row.pixelId,
        pixelName: row.pixelName,
        breakdown: BREAKDOWN_KINDS.has(row.breakdown) ? (row.breakdown as CtvBreakdownKind) : "",
        breakdownName: row.breakdownName,
        impressions: num(row.impressions),
        clickConversions: num(row.clickConversions),
        viewConversions: num(row.viewConversions),
        ipConversions: num(row.ipConversions),
        cookieConversions: num(row.cookieConversions),
        spend: 0,
      })),
      breakdowns: storedBreakdowns.flatMap((row) => {
        const mapped = mapBreakdown(row, false);
        return mapped ? [mapped] : [];
      }),
    });
    return releaseCtvAttribution(page, "plan");
  } catch (error) {
    if (isMissingCtvTable(error)) return null;
    throw error;
  }
}

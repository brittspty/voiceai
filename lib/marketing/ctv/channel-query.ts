import { prisma } from "../../db";
import { zonedISODate } from "../../time";
import { canSwitchMarketingClient, type MarketingAccess } from "../access";
import { stackAdaptCtvLiveEnabled, type Env } from "../config";
import type { DashWindow } from "../dashboard-model";
import { realClientId, type RealStatus } from "../real-view";
import { WORKSPACE_ID } from "../types";
import { isolatedWhere } from "../workspace";
import { buildCtvChannelPage, emptyCtvChannelPage, releaseCtvChannel, type CtvChannelPage } from "./channel";
import { isMissingCtvTable } from "./store";

function num(value: bigint | number | { toString(): string } | null | undefined) {
  if (value == null) return 0;
  const parsed = typeof value === "bigint" ? Number(value) : Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Stored CTV page for the signed-in viewer.
 * The client switch, date window, and Active filter match the rest of the home.
 * Returns null while STACKADAPT_CTV_LIVE is off so the example mock-up stays.
 */
export async function loadCtvChannelPage(input: {
  access: MarketingAccess;
  requestedClientId?: string | null;
  days: DashWindow;
  status: RealStatus;
  path: string;
  now?: Date;
  env?: Env;
}): Promise<CtvChannelPage | null> {
  const env = input.env ?? process.env;
  if (!stackAdaptCtvLiveEnabled(env)) return null;
  const staff = canSwitchMarketingClient(input.access);
  const showMoney = Boolean(input.access.seesCost);
  const endDate = zonedISODate(input.now ?? new Date(), "America/New_York");
  const blank = emptyCtvChannelPage({
    showMoney,
    staff,
    clientName: staff ? "All clients" : "Your campaigns",
    days: input.days,
    status: input.status,
    path: input.path,
    endDate,
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
    if (where.id && where.id.in.length === 0) {
      return { ...blank, clientId, clientName: clients.find((row) => row.id === clientId)?.name || blank.clientName };
    }
    const campaigns = await prisma.campaign.findMany({
      where: isolatedWhere(workspaceId, where),
      orderBy: { name: "asc" },
      select: { id: true, externalId: true, name: true, clientId: true, status: true, channelType: true, namingParsed: true },
    });
    const ids = campaigns.map((row) => row.externalId).filter(Boolean);
    const delivery = ids.length
      ? await prisma.ctvDeliveryDay.findMany({
          where: isolatedWhere(workspaceId, {
            campaignId: { in: ids },
            exampleData: false,
            ...(clientId ? { clientId } : {}),
          }),
          select: {
            clientId: true,
            campaignId: true,
            date: true,
            impressions: true,
            uniqueImpressions: true,
            frequency: true,
            videoStarts: true,
            completion25: true,
            completion50: true,
            completion75: true,
            completion100: true,
            clickConversions: true,
            viewConversions: true,
            ...(showMoney ? { spend: true } : {}),
          },
        })
      : [];
    const selected = clientId ? clients.find((row) => row.id === clientId) : null;
    return buildCtvChannelPage({
      showMoney,
      staff,
      clientId,
      clientName: selected?.name || (staff ? "All clients" : "Your campaigns"),
      days: input.days,
      status: input.status,
      path: input.path,
      endDate,
      updatedLabel: delivery.length ? endDate : "not yet",
      campaigns,
      daysRows: delivery.map((row) => ({
        clientId: row.clientId,
        campaignId: row.campaignId,
        date: row.date.toISOString().slice(0, 10),
        impressions: num(row.impressions),
        uniqueImpressions: num(row.uniqueImpressions),
        frequency: num(row.frequency),
        videoStarts: num(row.videoStarts),
        completion25: num(row.completion25),
        completion50: num(row.completion50),
        completion75: num(row.completion75),
        completion100: num(row.completion100),
        clickConversions: num(row.clickConversions),
        viewConversions: num(row.viewConversions),
        ...(showMoney && "spend" in row ? { spend: num(row.spend) } : {}),
      })),
    });
  } catch (error) {
    if (isMissingCtvTable(error)) return { ...blank, note: blank.note };
    throw error;
  }
}

/** Public plans and previews never receive cost. A missing table omits the block. */
export async function loadPlanCtv(clientName: string, env: Env = process.env): Promise<CtvChannelPage | null> {
  if (!stackAdaptCtvLiveEnabled(env)) return null;
  try {
    const client = clientName.trim()
      ? await prisma.marketingClient.findFirst({
          where: { workspaceId: WORKSPACE_ID, name: clientName },
          select: { id: true, name: true },
        })
      : null;
    if (!client) {
      return releaseCtvChannel(
        emptyCtvChannelPage({ showMoney: false, staff: false, clientName, days: 30, status: "", path: "" }),
        "plan",
      );
    }
    const campaigns = await prisma.campaign.findMany({
      where: { clientId: client.id, platform: "stackadapt" },
      select: { id: true, externalId: true, name: true, clientId: true, status: true, channelType: true, namingParsed: true },
    });
    const delivery = await prisma.ctvDeliveryDay.findMany({
      where: { clientId: client.id, exampleData: false },
      select: {
        clientId: true,
        campaignId: true,
        date: true,
        impressions: true,
        uniqueImpressions: true,
        frequency: true,
        videoStarts: true,
        completion25: true,
        completion50: true,
        completion75: true,
        completion100: true,
        clickConversions: true,
        viewConversions: true,
      },
    });
    const page = buildCtvChannelPage({
      showMoney: false,
      staff: false,
      clientId: client.id,
      clientName: client.name,
      days: 30,
      status: "",
      endDate: zonedISODate(new Date(), "America/New_York"),
      campaigns,
      daysRows: delivery.map((row) => ({
        clientId: row.clientId,
        campaignId: row.campaignId,
        date: row.date.toISOString().slice(0, 10),
        impressions: num(row.impressions),
        uniqueImpressions: num(row.uniqueImpressions),
        frequency: num(row.frequency),
        videoStarts: num(row.videoStarts),
        completion25: num(row.completion25),
        completion50: num(row.completion50),
        completion75: num(row.completion75),
        completion100: num(row.completion100),
        clickConversions: num(row.clickConversions),
        viewConversions: num(row.viewConversions),
      })),
    });
    return releaseCtvChannel(page, "plan");
  } catch (error) {
    if (isMissingCtvTable(error)) return null;
    throw error;
  }
}

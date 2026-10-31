import { prisma } from "../../db";
import { prepareChannelDailyWrite } from "../channels/query";
import { isolatedWhere } from "../workspace";
import { toChannelDaily, type ChatgptReportRow } from "./reporting";

export async function saveChatgptReportRows(workspaceId: string, clientKey: string, rows: ChatgptReportRow[]) {
  let written = 0;
  for (const row of rows) {
    const data = prepareChannelDailyWrite(workspaceId, { ...toChannelDaily(row), clientKey });
    const existing = await prisma.channelDailyMetric.findFirst({
      where: isolatedWhere(workspaceId, { channel: "chatgpt_ads", entityKey: data.entityKey, date: data.date as Date }),
    });
    if (existing) {
      await prisma.channelDailyMetric.update({
        where: { id: existing.id },
        data: {
          entityName: data.entityName,
          currency: data.currency,
          impressions: data.impressions,
          clicks: data.clicks,
          spend: data.spend,
          conversions: data.conversions,
          leads: data.leads,
        },
      });
    } else {
      await prisma.channelDailyMetric.create({ data });
    }
    written += 1;
  }
  return written;
}

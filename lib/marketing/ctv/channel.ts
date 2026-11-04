/**
 * Connected TV page built from stored delivery.
 * CTV campaigns are chosen by channel type. Spend stays off unless this viewer may see cost.
 */

import { addDaysISO } from "../../time";
import type { DashWindow } from "../dashboard-model";
import { realDateWindow, type RealStatus } from "../real-view";
import { presentedCampaignStatus } from "../connectors/stackadapt-status";
import { ctvPayloadForViewer } from "./report";
import { isCtvCampaign } from "./parse";
import type { CtvAudience } from "./types";

export const CTV_UNAVAILABLE_NOTE = "Event-level exposures and households are not available yet.";

export type CtvChannelCampaign = {
  id: string;
  externalId: string;
  name: string;
  clientId: string | null;
  clientName?: string;
  status: string;
  channelType?: string | null;
  namingParsed?: unknown;
};

export type CtvChannelDay = {
  clientId: string;
  campaignId: string;
  date: string;
  impressions: number;
  uniqueImpressions: number;
  frequency: number;
  videoStarts: number;
  completion25: number;
  completion50: number;
  completion75: number;
  completion100: number;
  completionRate?: number | null;
  clickConversions: number;
  viewConversions: number;
  spend?: number;
  exampleData?: boolean;
};

export type CtvChannelRow = {
  id: string;
  name: string;
  status: string;
  impressions: number;
  uniqueImpressions: number;
  frequency: number | null;
  videoStarts: number;
  completion25: number;
  completion50: number;
  completion75: number;
  completion100: number;
  completionRate: number | null;
  clickConversions: number;
  viewConversions: number;
  spend?: number;
};

export type CtvChannelPage = {
  source: "stored";
  showMoney: boolean;
  example: false;
  clientId: string | null;
  clientName: string;
  days: DashWindow;
  status: RealStatus;
  path: string;
  staff: boolean;
  updatedLabel: string;
  note: typeof CTV_UNAVAILABLE_NOTE;
  rows: CtvChannelRow[];
  totals: CtvChannelRow;
};

export type CtvSurface = CtvAudience | "plan" | "export";

const MONEY_FIELDS = ["spend", "cost", "ecpm", "ecpv", "cpa", "cpl", "roas", "budget", "bid"] as const;

function ratio(part: number, whole: number) {
  if (whole <= 0) return null;
  return part / whole;
}

function blank(id: string, name: string, status: string, showMoney: boolean): CtvChannelRow {
  const row: CtvChannelRow = {
    id,
    name,
    status,
    impressions: 0,
    uniqueImpressions: 0,
    frequency: null,
    videoStarts: 0,
    completion25: 0,
    completion50: 0,
    completion75: 0,
    completion100: 0,
    completionRate: null,
    clickConversions: 0,
    viewConversions: 0,
  };
  if (showMoney) row.spend = 0;
  return row;
}

function addDay(row: CtvChannelRow, day: CtvChannelDay, showMoney: boolean) {
  const weight = day.impressions;
  const previous = row.impressions;
  row.impressions += day.impressions;
  row.uniqueImpressions += day.uniqueImpressions;
  row.videoStarts += day.videoStarts;
  row.completion25 += day.completion25;
  row.completion50 += day.completion50;
  row.completion75 += day.completion75;
  row.completion100 += day.completion100;
  row.clickConversions += day.clickConversions;
  row.viewConversions += day.viewConversions;
  if (weight > 0 && day.frequency > 0) {
    const blended = ((row.frequency ?? 0) * previous + day.frequency * weight) / (previous + weight);
    row.frequency = blended;
  }
  if (showMoney && row.spend != null) row.spend += day.spend ?? 0;
  row.completionRate = ratio(row.completion100, row.impressions);
}

/** Stored CTV rows for one client, one date window, and the Active filter. Other clients are left out. */
export function buildCtvChannelPage(input: {
  showMoney: boolean;
  staff: boolean;
  clientId: string | null;
  clientName: string;
  days: DashWindow;
  status: RealStatus;
  path?: string;
  endDate: string;
  updatedLabel?: string;
  campaigns: readonly CtvChannelCampaign[];
  daysRows: readonly CtvChannelDay[];
}): CtvChannelPage {
  const showMoney = input.showMoney && input.staff;
  const dates = new Set(realDateWindow(input.endDate, input.days));
  const clientId = input.clientId;
  const campaigns = input.campaigns.filter((row) => {
    if (!isCtvCampaign(row)) return false;
    if (clientId && row.clientId !== clientId) return false;
    const status = presentedCampaignStatus("stackadapt", row.status, row.status);
    if (input.status && status !== input.status) return false;
    return status !== "archived" && status !== "deleted";
  });
  const allowed = new Map(campaigns.map((row) => [row.externalId, row]));
  const grouped = new Map<string, CtvChannelRow>();
  for (const campaign of campaigns) {
    const status = presentedCampaignStatus("stackadapt", campaign.status, campaign.status);
    grouped.set(campaign.externalId, blank(campaign.id, campaign.name, status, showMoney));
  }
  for (const day of input.daysRows) {
    if (day.exampleData) continue;
    if (!dates.has(day.date)) continue;
    if (clientId && day.clientId !== clientId) continue;
    const campaign = allowed.get(day.campaignId);
    if (!campaign) continue;
    const row = grouped.get(day.campaignId);
    if (!row) continue;
    addDay(row, day, showMoney);
  }
  const rows = [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
  const totals = blank("total", "Total", "", showMoney);
  for (const row of rows) {
    totals.impressions += row.impressions;
    totals.uniqueImpressions += row.uniqueImpressions;
    totals.videoStarts += row.videoStarts;
    totals.completion25 += row.completion25;
    totals.completion50 += row.completion50;
    totals.completion75 += row.completion75;
    totals.completion100 += row.completion100;
    totals.clickConversions += row.clickConversions;
    totals.viewConversions += row.viewConversions;
    if (showMoney && totals.spend != null) totals.spend += row.spend ?? 0;
  }
  const weighted = rows.reduce((sum, row) => sum + (row.frequency ?? 0) * row.impressions, 0);
  totals.frequency = totals.impressions > 0 ? weighted / totals.impressions : null;
  totals.completionRate = ratio(totals.completion100, totals.impressions);
  return {
    source: "stored",
    showMoney,
    example: false,
    clientId,
    clientName: input.clientName,
    days: input.days,
    status: input.status,
    path: input.path || "",
    staff: input.staff,
    updatedLabel: input.updatedLabel || input.endDate,
    note: CTV_UNAVAILABLE_NOTE,
    rows,
    totals,
  };
}

export function emptyCtvChannelPage(input: {
  showMoney: boolean;
  staff: boolean;
  clientName: string;
  days: DashWindow;
  status: RealStatus;
  path?: string;
  endDate?: string;
}): CtvChannelPage {
  return buildCtvChannelPage({
    ...input,
    clientId: null,
    endDate: input.endDate || "2026-11-04",
    campaigns: [],
    daysRows: [],
  });
}

function surfaceAudience(surface: CtvSurface): CtvAudience {
  if (surface === "plan" || surface === "export" || surface === "client") return "client";
  if (surface === "share") return "share";
  return surface;
}

/** Drops spend, cost, eCPM, eCPV, CPA, CPL, ROAS, budget, and bid for every audience except staff. */
export function releaseCtvChannel<T>(value: T, surface: CtvSurface): T {
  if (surface === "staff") return value;
  return ctvPayloadForViewer(value, surfaceAudience(surface));
}

export function ctvMoneyKeys(value: unknown, keys: string[] = []) {
  if (Array.isArray(value)) {
    for (const item of value) ctvMoneyKeys(item, keys);
    return keys;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (MONEY_FIELDS.includes(key.toLowerCase().replace(/[_-]/g, "") as (typeof MONEY_FIELDS)[number])) keys.push(key);
      ctvMoneyKeys(child, keys);
    }
  }
  return keys;
}

export function ctvExportCsv(page: CtvChannelPage | null | undefined) {
  if (!page) return "";
  const released = releaseCtvChannel(page, "export");
  const lines = ["Campaign,Status,Impressions,Unique impressions,Video starts,Completion rate"];
  for (const row of released.rows) {
    const rate = row.completionRate == null ? "" : `${Math.round(row.completionRate * 100)}%`;
    lines.push([row.name, row.status, row.impressions, row.uniqueImpressions, row.videoStarts, rate].join(","));
  }
  lines.push(CTV_UNAVAILABLE_NOTE);
  return lines.join("\n");
}

export function dateWindowEnding(end: string, days: number) {
  return { start: addDaysISO(end, -(days - 1)), end };
}

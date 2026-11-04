/**
 * Connected TV attribution built from stored StackAdapt conversion rows.
 * View-through counts are pixel-tracked site visits after an impression.
 * Spend, CPA, and eCPM stay off unless this viewer may see cost.
 */

import type { DashWindow } from "../dashboard-model";
import { realDateWindow, type RealStatus } from "../real-view";
import { presentedCampaignStatus } from "../connectors/stackadapt-status";
import { ctvPayloadForViewer } from "./report";
import { isCtvCampaign } from "./parse";
import type { CtvAudience } from "./types";
import type { CtvSurface } from "./channel";
import { BREAKDOWN_UNAVAILABLE, IP_SPLIT_UNAVAILABLE, PIXEL_UNAVAILABLE, VIEW_THROUGH_LABEL, breakdownWeeksLabel } from "./attribution-graphql";

export { BREAKDOWN_UNAVAILABLE, IP_SPLIT_UNAVAILABLE, PIXEL_UNAVAILABLE, VIEW_THROUGH_LABEL };

export type CtvAttributionGrain = "campaign" | "pixel" | "breakdown";
export type CtvBreakdownKind = "publisher" | "app" | "device" | "geo";

export type CtvBreakdownTotal = {
  clientId: string;
  campaignId: string;
  campaignName: string;
  dimension: CtvBreakdownKind;
  name: string;
  rangeStart: string;
  rangeEnd: string;
  impressions: number;
  clickConversions: number;
  viewConversions: number;
  spend: number;
  exampleData?: boolean;
};

export type CtvAttributionRow = {
  clientId: string;
  date: string;
  campaignId: string;
  campaignName: string;
  grain: CtvAttributionGrain;
  pixelId: string;
  pixelName: string;
  breakdown: "" | CtvBreakdownKind;
  breakdownName: string;
  impressions: number;
  clickConversions: number;
  viewConversions: number;
  ipConversions: number;
  cookieConversions: number;
  spend: number;
  exampleData?: boolean;
};

export type CtvAttributionCampaign = {
  id: string;
  externalId: string;
  name: string;
  clientId: string | null;
  status: string;
  channelType?: string | null;
  namingParsed?: unknown;
};

export type CtvAttributionTotals = {
  impressions: number;
  clickConversions: number;
  viewConversions: number;
  ipConversions: number;
  cookieConversions: number;
  perThousand: number | null;
  spend?: number;
  cpa?: number | null;
  ecpm?: number | null;
};

export type CtvAttributionPage = {
  source: "stored";
  example: false;
  showMoney: boolean;
  staff: boolean;
  clientId: string | null;
  clientName: string;
  clients: { id: string; name: string }[];
  days: DashWindow;
  status: RealStatus;
  path: string;
  updatedLabel: string;
  viewThroughLabel: typeof VIEW_THROUGH_LABEL;
  ipSplitAvailable: boolean;
  ipSplitNote: string;
  pixelAvailable: boolean;
  pixelNote: string;
  breakdownNote: string;
  /** Weeks label when some chunks were missed, otherwise the stored window when it differs from the page. */
  breakdownLabel: string;
  breakdownGaps: string;
  totals: CtvAttributionTotals;
  trend: { date: string; impressions: number; clickConversions: number; viewConversions: number }[];
  pixels: { id: string; name: string; impressions: number; clickConversions: number; viewConversions: number; perThousand: number | null; spend?: number }[];
  campaigns: { id: string; name: string; status: string; impressions: number; clickConversions: number; viewConversions: number; perThousand: number | null; spend?: number }[];
  breakdowns: { kind: CtvBreakdownKind; name: string; impressions: number; clickConversions: number; viewConversions: number; spend?: number }[];
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatCoverDay(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  return `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}`;
}

/** Empty when the stored total uses the same dates as the page. */
export function breakdownCoverLabel(storedStart: string, storedEnd: string, pageStart: string, pageEnd: string) {
  if (!storedStart || !storedEnd || (storedStart === pageStart && storedEnd === pageEnd)) return "";
  return `Breakdown covers ${formatCoverDay(storedStart)} – ${formatCoverDay(storedEnd)}`;
}

function perThousand(conversions: number, impressions: number) {
  if (impressions <= 0) return null;
  return (conversions / impressions) * 1000;
}

function ratio(part: number, whole: number) {
  if (whole <= 0) return null;
  return part / whole;
}

export function buildCtvAttributionPage(input: {
  showMoney: boolean;
  staff: boolean;
  clientId: string | null;
  clientName: string;
  clients?: readonly { id: string; name: string }[];
  days: DashWindow;
  status: RealStatus;
  path?: string;
  endDate: string;
  updatedLabel?: string;
  ipSplitAvailable: boolean;
  pixelAvailable: boolean;
  pixelNote?: string;
  breakdownNote?: string;
  breakdownCoverage?: { covered: number; total: number };
  breakdownGaps?: string;
  campaigns: readonly CtvAttributionCampaign[];
  rows: readonly CtvAttributionRow[];
  breakdowns?: readonly CtvBreakdownTotal[];
}): CtvAttributionPage {
  const showMoney = input.showMoney && input.staff;
  const dates = realDateWindow(input.endDate, input.days);
  const dateSet = new Set(dates);
  const clientId = input.clientId;
  const campaigns = input.campaigns.filter((row) => {
    if (!isCtvCampaign(row)) return false;
    if (clientId && row.clientId !== clientId) return false;
    const status = presentedCampaignStatus("stackadapt", row.status, row.status);
    if (input.status && status !== input.status) return false;
    return status !== "archived" && status !== "deleted";
  });
  const allowed = new Map(campaigns.map((row) => [row.externalId, row]));
  const totals = {
    impressions: 0,
    clickConversions: 0,
    viewConversions: 0,
    ipConversions: 0,
    cookieConversions: 0,
    spend: 0,
  };
  const trend = new Map(dates.map((date) => [date, { date, impressions: 0, clickConversions: 0, viewConversions: 0 }]));
  const byCampaign = new Map<string, { impressions: number; clickConversions: number; viewConversions: number; spend: number }>();
  for (const campaign of campaigns) {
    byCampaign.set(campaign.externalId, { impressions: 0, clickConversions: 0, viewConversions: 0, spend: 0 });
  }
  const byPixel = new Map<string, { id: string; name: string; clickConversions: number; viewConversions: number; spend: number; campaignIds: Set<string> }>();
  const byBreakdown = new Map<string, { kind: CtvBreakdownKind; name: string; impressions: number; clickConversions: number; viewConversions: number; spend: number }>();
  let breakdownStart = "";
  let breakdownEnd = "";
  for (const row of input.rows) {
    if (row.exampleData) continue;
    if (!row.date || !dateSet.has(row.date)) continue;
    if (clientId && row.clientId !== clientId) continue;
    if (!allowed.has(row.campaignId)) continue;
    if (row.grain === "campaign") {
      totals.impressions += row.impressions;
      totals.clickConversions += row.clickConversions;
      totals.viewConversions += row.viewConversions;
      totals.ipConversions += row.ipConversions;
      totals.cookieConversions += row.cookieConversions;
      totals.spend += row.spend;
      const day = trend.get(row.date);
      if (day) {
        day.impressions += row.impressions;
        day.clickConversions += row.clickConversions;
        day.viewConversions += row.viewConversions;
      }
      const current = byCampaign.get(row.campaignId);
      if (current) {
        current.impressions += row.impressions;
        current.clickConversions += row.clickConversions;
        current.viewConversions += row.viewConversions;
        current.spend += row.spend;
      }
    } else if (row.grain === "pixel" && input.pixelAvailable) {
      if (row.clickConversions + row.viewConversions <= 0) continue;
      const key = row.pixelId || row.pixelName;
      const current = byPixel.get(key) ?? { id: key, name: row.pixelName || row.pixelId, clickConversions: 0, viewConversions: 0, spend: 0, campaignIds: new Set<string>() };
      current.clickConversions += row.clickConversions;
      current.viewConversions += row.viewConversions;
      current.spend += row.spend;
      current.campaignIds.add(row.campaignId);
      byPixel.set(key, current);
    }
  }
  if (!input.breakdownNote) {
    for (const row of input.breakdowns ?? []) {
      if (row.exampleData || !row.dimension || !row.name) continue;
      if (clientId && row.clientId !== clientId) continue;
      if (!allowed.has(row.campaignId)) continue;
      if (!breakdownStart || row.rangeStart < breakdownStart) breakdownStart = row.rangeStart;
      if (row.rangeEnd > breakdownEnd) breakdownEnd = row.rangeEnd;
      const key = `${row.dimension}\0${row.name}`;
      const current = byBreakdown.get(key) ?? { kind: row.dimension, name: row.name, impressions: 0, clickConversions: 0, viewConversions: 0, spend: 0 };
      current.impressions += row.impressions;
      current.clickConversions += row.clickConversions;
      current.viewConversions += row.viewConversions;
      current.spend += row.spend;
      byBreakdown.set(key, current);
    }
  }
  const conversions = totals.clickConversions + totals.viewConversions;
  const pageTotals: CtvAttributionTotals = {
    impressions: totals.impressions,
    clickConversions: totals.clickConversions,
    viewConversions: totals.viewConversions,
    ipConversions: input.ipSplitAvailable ? totals.ipConversions : 0,
    cookieConversions: input.ipSplitAvailable ? totals.cookieConversions : 0,
    perThousand: perThousand(conversions, totals.impressions),
  };
  if (showMoney) {
    pageTotals.spend = totals.spend;
    pageTotals.cpa = ratio(totals.spend, conversions);
    pageTotals.ecpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : null;
  }
  const campaignRows = campaigns.map((campaign) => {
    const current = byCampaign.get(campaign.externalId) ?? { impressions: 0, clickConversions: 0, viewConversions: 0, spend: 0 };
    const status = presentedCampaignStatus("stackadapt", campaign.status, campaign.status);
    const row: CtvAttributionPage["campaigns"][number] = {
      id: campaign.id,
      name: campaign.name,
      status,
      impressions: current.impressions,
      clickConversions: current.clickConversions,
      viewConversions: current.viewConversions,
      perThousand: perThousand(current.clickConversions + current.viewConversions, current.impressions),
    };
    if (showMoney) row.spend = current.spend;
    return row;
  }).sort((a, b) => a.name.localeCompare(b.name));
  const pixels = [...byPixel.values()].map((row) => {
    const deliveryImpressions = [...row.campaignIds].reduce((sum, id) => sum + (byCampaign.get(id)?.impressions ?? 0), 0);
    const next: CtvAttributionPage["pixels"][number] = {
      id: row.id,
      name: row.name,
      impressions: deliveryImpressions,
      clickConversions: row.clickConversions,
      viewConversions: row.viewConversions,
      perThousand: perThousand(row.clickConversions + row.viewConversions, deliveryImpressions),
    };
    if (showMoney) next.spend = row.spend;
    return next;
  }).sort((a, b) => b.viewConversions - a.viewConversions || a.name.localeCompare(b.name));
  return {
    source: "stored",
    example: false,
    showMoney,
    staff: input.staff,
    clientId,
    clientName: input.clientName,
    clients: input.staff ? [...(input.clients ?? [])] : [],
    days: input.days,
    status: input.status,
    path: input.path || "",
    updatedLabel: input.updatedLabel || input.endDate,
    viewThroughLabel: VIEW_THROUGH_LABEL,
    ipSplitAvailable: input.ipSplitAvailable,
    ipSplitNote: input.ipSplitAvailable ? "" : IP_SPLIT_UNAVAILABLE,
    pixelAvailable: input.pixelAvailable,
    pixelNote: input.pixelAvailable ? (pixels.length ? "" : (input.pixelNote || "No conversions in this range.")) : (input.pixelNote || PIXEL_UNAVAILABLE),
    breakdownNote: input.breakdownNote || "",
    breakdownLabel: breakdownWeeksLabel(input.breakdownCoverage?.covered ?? 0, input.breakdownCoverage?.total ?? 0)
      || (input.breakdownNote ? "" : breakdownCoverLabel(breakdownStart, breakdownEnd, dates[0] || "", dates[dates.length - 1] || "")),
    breakdownGaps: input.breakdownGaps || "",
    totals: pageTotals,
    trend: dates.map((date) => trend.get(date) ?? { date, impressions: 0, clickConversions: 0, viewConversions: 0 }),
    pixels,
    campaigns: campaignRows,
    breakdowns: input.breakdownNote ? [] : [...byBreakdown.values()].map((row) => {
      const next: CtvAttributionPage["breakdowns"][number] = {
        kind: row.kind,
        name: row.name,
        impressions: row.impressions,
        clickConversions: row.clickConversions,
        viewConversions: row.viewConversions,
      };
      if (showMoney) next.spend = row.spend;
      return next;
    }).sort((a, b) => a.kind.localeCompare(b.kind) || b.impressions - a.impressions || a.name.localeCompare(b.name)),
  };
}

function surfaceAudience(surface: CtvSurface): CtvAudience {
  if (surface === "plan" || surface === "export" || surface === "client") return "client";
  if (surface === "share") return "share";
  return surface;
}

/** Drops spend, cost, eCPM, eCPV, CPA, CPL, ROAS, budget, and bid for every audience except staff. */
export function releaseCtvAttribution<T>(value: T, surface: CtvSurface): T {
  if (surface === "staff") return value;
  return ctvPayloadForViewer(value, surfaceAudience(surface));
}

export function ctvAttributionCsv(page: CtvAttributionPage | null | undefined) {
  if (!page) return "";
  const released = releaseCtvAttribution(page, "export");
  const lines = ["Campaign,Pixel,View-through site visits,Click-through,Conversions per 1K impressions"];
  const pixels = released.pixels.length ? released.pixels : [{ name: "", viewConversions: released.totals.viewConversions, clickConversions: released.totals.clickConversions, perThousand: released.totals.perThousand }];
  const campaign = released.campaigns.map((row) => row.name).join("; ");
  for (const row of pixels) {
    const rate = row.perThousand == null ? "" : row.perThousand.toFixed(2);
    lines.push([campaign, row.name, row.viewConversions, row.clickConversions, rate].join(","));
  }
  lines.push(released.viewThroughLabel);
  if (released.pixelNote) lines.push(released.pixelNote);
  if (released.breakdownNote) lines.push(released.breakdownNote);
  if (released.ipSplitNote) lines.push(released.ipSplitNote);
  return lines.join("\n");
}

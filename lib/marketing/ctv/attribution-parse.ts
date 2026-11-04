/**
 * Parsers for the CTV conversion read.
 * A row for another advertiser is dropped. Budget and bid values are ignored.
 */

import { CLICK_CONVERSION_FIELDS, COOKIE_CONVERSION_FIELDS, COST_FIELDS, IMPRESSION_FIELDS, IP_CONVERSION_FIELDS, VIEW_CONVERSION_FIELDS } from "./fields";

export type CtvConversionDelivery = {
  date: string;
  campaignId: string;
  campaignName: string;
  channelType: string;
  status: string;
  impressions: number;
  clickConversions: number;
  viewConversions: number;
  ipConversions: number;
  cookieConversions: number;
  spend: number;
};

export type CtvPixelDelivery = {
  date: string;
  campaignId: string;
  campaignName: string;
  channelType: string;
  pixelId: string;
  pixelName: string;
  impressions: number;
  clickConversions: number;
  viewConversions: number;
  cookieConversions: number;
  spend: number;
};

export type CtvBreakdownKind = "publisher" | "app" | "device" | "geo";

export type CtvBreakdownDelivery = {
  date: string;
  campaignId: string;
  campaignName: string;
  channelType: string;
  kind: CtvBreakdownKind;
  name: string;
  impressions: number;
  clickConversions: number;
  viewConversions: number;
  spend: number;
};

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function num(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const row = record(value);
  if (row && "amount" in row) return num(row.amount);
  return 0;
}

function pick(row: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    if (row[key] != null && row[key] !== "") return row[key];
  }
  return undefined;
}

function amount(row: Record<string, unknown>, keys: readonly string[]) {
  return num(pick(row, keys));
}

function campaignOf(value: unknown, advertiserId: string) {
  const row = record(value);
  const campaign = record(row?.campaign);
  const owner = text(record(campaign?.advertiser)?.id);
  const campaignId = text(campaign?.id);
  if (!row || !campaignId || owner !== advertiserId) return null;
  const metrics = record(row.metrics) ?? {};
  const attributes = record(row.attributes);
  const date = text(record(row.granularity)?.startTime).slice(0, 10) || text(attributes?.date).slice(0, 10);
  const status = text(record(campaign?.campaignStatus)?.state) || text(campaign?.status);
  return {
    row,
    metrics,
    attributes,
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
    campaignId,
    campaignName: text(campaign?.name) || campaignId,
    channelType: text(campaign?.channelType),
    status,
    impressions: amount(metrics, IMPRESSION_FIELDS),
    clickConversions: amount(metrics, CLICK_CONVERSION_FIELDS),
    viewConversions: amount(metrics, VIEW_CONVERSION_FIELDS),
    spend: amount(metrics, COST_FIELDS),
  };
}

export function parseCtvConversionNode(value: unknown, advertiserId: string): CtvConversionDelivery | null {
  const campaign = campaignOf(value, advertiserId);
  if (!campaign) return null;
  return {
    date: campaign.date,
    campaignId: campaign.campaignId,
    campaignName: campaign.campaignName,
    channelType: campaign.channelType,
    status: campaign.status,
    impressions: campaign.impressions,
    clickConversions: campaign.clickConversions,
    viewConversions: campaign.viewConversions,
    ipConversions: amount(campaign.metrics, IP_CONVERSION_FIELDS),
    cookieConversions: amount(campaign.metrics, COOKIE_CONVERSION_FIELDS),
    spend: campaign.spend,
  };
}

export function parseCtvPixelNode(value: unknown, advertiserId: string): CtvPixelDelivery | null {
  const campaign = campaignOf(value, advertiserId);
  if (!campaign) return null;
  const pixel = record(campaign.attributes?.conversionPixel);
  const pixelId = text(pixel?.id);
  const pixelName = text(pixel?.name) || text(pixel?.description);
  if (!pixelId && !pixelName) return null;
  return {
    date: campaign.date,
    campaignId: campaign.campaignId,
    campaignName: campaign.campaignName,
    channelType: campaign.channelType,
    pixelId,
    pixelName: pixelName || pixelId,
    impressions: campaign.impressions,
    clickConversions: campaign.clickConversions,
    viewConversions: campaign.viewConversions,
    cookieConversions: amount(campaign.metrics, COOKIE_CONVERSION_FIELDS),
    spend: campaign.spend,
  };
}

export function parseCtvBreakdownNode(value: unknown, advertiserId: string): CtvBreakdownDelivery[] {
  const campaign = campaignOf(value, advertiserId);
  if (!campaign?.attributes) return [];
  const attributes = campaign.attributes;
  const supply = record(attributes.supplySource);
  const app = record(attributes.app);
  const country = record(attributes.country);
  const named: { kind: CtvBreakdownKind; name: string }[] = [];
  const publisher = text(supply?.name) || text(supply?.id);
  const appName = text(app?.title) || text(app?.domain);
  const device = text(attributes.deviceType);
  const geo = text(country?.name) || text(country?.code);
  if (publisher) named.push({ kind: "publisher", name: publisher });
  if (appName) named.push({ kind: "app", name: appName });
  if (device) named.push({ kind: "device", name: device });
  if (geo) named.push({ kind: "geo", name: geo });
  return named.map((item) => ({
    date: campaign.date,
    campaignId: campaign.campaignId,
    campaignName: campaign.campaignName,
    channelType: campaign.channelType,
    kind: item.kind,
    name: item.name,
    impressions: campaign.impressions,
    clickConversions: campaign.clickConversions,
    viewConversions: campaign.viewConversions,
    spend: campaign.spend,
  }));
}

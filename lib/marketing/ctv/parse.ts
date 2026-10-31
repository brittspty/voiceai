import {
  AD_FIELDS,
  AD_NAME_FIELDS,
  AUDIENCE_FIELDS,
  AUDIENCE_NAME_FIELDS,
  CAMPAIGN_FIELDS,
  CAMPAIGN_GROUP_FIELDS,
  CAMPAIGN_NAME_FIELDS,
  CHANNEL_FIELDS,
  CLICK_CONVERSION_FIELDS,
  CLICK_WINDOW_FIELDS,
  COOKIE_CONVERSION_FIELDS,
  COST_FIELDS,
  CREATIVE_FIELDS,
  DEVICE_FIELDS,
  FREQUENCY_FIELDS,
  HOUSEHOLD_FIELDS,
  IMPRESSION_FIELDS,
  IP_CONVERSION_FIELDS,
  LINE_NAME_FIELDS,
  PATH_CLICK_LAG_FIELDS,
  PATH_TYPE_FIELDS,
  PATH_VIEW_LAG_FIELDS,
  REVENUE_FIELDS,
  SITE_VISIT_FIELDS,
  SUPPLY_ID_FIELDS,
  SUPPLY_NAME_FIELDS,
  UNIQUE_IMPRESSION_FIELDS,
  VIDEO_COMPLETE_FIELDS,
  VIDEO_Q1_FIELDS,
  VIDEO_Q2_FIELDS,
  VIDEO_Q3_FIELDS,
  VIDEO_RATE_FIELDS,
  VIEW_CONVERSION_FIELDS,
  VIEW_WINDOW_FIELDS,
} from "./fields";
import { acceptIp } from "./quality";
import type { CtvConversion, CtvDelivery, CtvExposure, CtvNativeWindow, CtvPlatformLift } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function rowsOf(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body.filter(isRecord);
  if (!isRecord(body)) return [];
  for (const key of ["data", "stats", "delivery", "results", "campaigns", "nodes", "conversion_trackers", "studies"]) {
    const value = body[key];
    if (Array.isArray(value)) return value.filter(isRecord);
    if (isRecord(value) && Array.isArray(value.nodes)) return value.nodes.filter(isRecord);
  }
  return [body];
}

function pick(row: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    if (row[key] != null && row[key] !== "") return row[key];
  }
  return undefined;
}

function text(row: Record<string, unknown>, keys: readonly string[]) {
  const value = pick(row, keys);
  return typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function num(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (isRecord(value) && "amount" in value) return num(value.amount);
  return 0;
}

function amount(row: Record<string, unknown>, keys: readonly string[]) {
  return num(pick(row, keys));
}

function rate(value: number) {
  if (!Number.isFinite(value) || value <= 0) return null;
  return value > 1 ? value / 100 : value;
}

export function isCtvChannel(value: string) {
  const key = value.trim().toLowerCase();
  if (!key) return true;
  return key === "ctv" || key === "connected tv" || key === "connected_tv";
}

/**
 * campaign_group is the public parent. campaign is the child.
 * TODO(verify): this product's campaign is the group when both ids exist, and the line item is the campaign.
 */
export function campaignIds(row: Record<string, unknown>) {
  const group = text(row, CAMPAIGN_GROUP_FIELDS);
  const campaign = text(row, CAMPAIGN_FIELDS) || text(row, ["id"]);
  return {
    campaignId: group || campaign,
    lineItemId: group ? campaign : text(row, ["line_item_id", "lineItemId"]),
    campaignName: text(row, group ? ["campaign_group_name", "campaignGroupName"] : CAMPAIGN_NAME_FIELDS),
    lineItemName: text(row, LINE_NAME_FIELDS) || (group ? text(row, ["campaign_name", "campaignName", "name"]) : ""),
  };
}

export function parseDeliveryRows(body: unknown): { rows: CtvDelivery[]; skipped: number } {
  const rows: CtvDelivery[] = [];
  let skipped = 0;
  for (const row of rowsOf(body)) {
    const channel = text(row, CHANNEL_FIELDS);
    if (!isCtvChannel(channel)) {
      skipped += 1;
      continue;
    }
    const ids = campaignIds(row);
    const impressions = amount(row, IMPRESSION_FIELDS);
    const completion100 = amount(row, VIDEO_COMPLETE_FIELDS);
    const completionRate = rate(amount(row, VIDEO_RATE_FIELDS)) ?? (impressions > 0 ? completion100 / impressions : null);
    const date = text(row, ["date", "day", "granularity_time"]).slice(0, 10);
    rows.push({
      date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
      campaignId: ids.campaignId,
      campaignName: ids.campaignName,
      lineItemId: ids.lineItemId,
      lineItemName: ids.lineItemName,
      creativeId: text(row, AD_FIELDS) || text(row, CREATIVE_FIELDS),
      creativeName: text(row, AD_NAME_FIELDS),
      audienceId: text(row, AUDIENCE_FIELDS),
      audienceName: text(row, AUDIENCE_NAME_FIELDS),
      maidListId: text(row, ["maid_list_id", "maidListId"]) || text(row, AUDIENCE_FIELDS),
      vendorId: text(row, ["vendor_id", "vendorId", "vendor"]),
      subSegmentKey: text(row, ["sub_segment", "subSegmentKey", "sub_segment_key"]),
      deviceType: text(row, DEVICE_FIELDS),
      publisher: text(row, SUPPLY_NAME_FIELDS) || text(row, SUPPLY_ID_FIELDS),
      impressions,
      uniqueImpressions: amount(row, UNIQUE_IMPRESSION_FIELDS),
      frequency: amount(row, FREQUENCY_FIELDS),
      completion25: amount(row, VIDEO_Q1_FIELDS),
      completion50: amount(row, VIDEO_Q2_FIELDS),
      completion75: amount(row, VIDEO_Q3_FIELDS),
      completion100,
      completionRate,
      spend: amount(row, COST_FIELDS),
      clickConversions: amount(row, CLICK_CONVERSION_FIELDS),
      viewConversions: amount(row, VIEW_CONVERSION_FIELDS),
      conversionValue: amount(row, REVENUE_FIELDS),
      ipConversions: amount(row, IP_CONVERSION_FIELDS),
      cookieConversions: amount(row, COOKIE_CONVERSION_FIELDS),
      siteVisits: amount(row, SITE_VISIT_FIELDS),
      currency: text(row, ["currency"]) || "USD",
    });
  }
  return { rows, skipped };
}

export function parseNativeWindow(body: unknown): CtvNativeWindow {
  let clickDays: number | null = null;
  let viewDays: number | null = null;
  for (const row of rowsOf(body)) {
    const click = amount(row, CLICK_WINDOW_FIELDS);
    const view = amount(row, VIEW_WINDOW_FIELDS);
    if (click > 0) clickDays = click;
    if (view > 0) viewDays = view;
  }
  if (clickDays == null && viewDays == null) {
    return {
      clickDays: null,
      viewDays: null,
      source: "missing",
      label: "CTV (StackAdapt) native window: not in this response. TODO(verify) the conversion tracker window fields.",
    };
  }
  const click = clickDays == null ? "click window unknown" : `${clickDays}-day click`;
  const view = viewDays == null ? "view window unknown" : `${viewDays}-day view`;
  return { clickDays, viewDays, source: "conversion_tracker", label: `CTV (StackAdapt) native: ${click}, ${view}` };
}

export function parsePlatformLifts(body: unknown): CtvPlatformLift[] {
  const lifts: CtvPlatformLift[] = [];
  for (const row of rowsOf(body)) {
    const kindRaw = text(row, ["kind", "control_type", "controlType", "type"]).toLowerCase();
    const kind = kindRaw.includes("psa") ? "psa" : kindRaw.includes("ghost") ? "ghost_bid" : kindRaw.includes("lift") || text(row, ["name"]) ? "brand_lift" : "";
    if (!kind) continue;
    const exposed = amount(row, ["exposed_cvr", "exposedCvr", "treatment_cvr", "lift"]);
    const control = amount(row, ["control_cvr", "controlCvr", "holdout_cvr"]);
    if (!exposed && !control && kind === "brand_lift") {
      lifts.push({
        kind,
        name: text(row, ["name"]) || "Brand lift study",
        maidListId: text(row, ["maid_list_id", "maidListId"]),
        vendorId: text(row, ["vendor_id", "vendorId"]),
        subSegmentKey: text(row, ["sub_segment_key", "subSegmentKey"]),
        exposedCvr: 0,
        controlCvr: 0,
        exposedTrials: 0,
        controlTrials: 0,
      });
      continue;
    }
    lifts.push({
      kind,
      name: text(row, ["name"]) || kind,
      maidListId: text(row, ["maid_list_id", "maidListId"]),
      vendorId: text(row, ["vendor_id", "vendorId"]),
      subSegmentKey: text(row, ["sub_segment_key", "subSegmentKey"]),
      exposedCvr: exposed,
      controlCvr: control,
      exposedTrials: amount(row, ["exposed_trials", "exposedTrials"]),
      controlTrials: amount(row, ["control_trials", "controlTrials"]),
    });
  }
  return lifts;
}

export function parseExposures(body: unknown): CtvExposure[] {
  const exposures: CtvExposure[] = [];
  for (const row of rowsOf(body)) {
    const eventId = text(row, ["event_id", "eventId", "id"]);
    const ts = text(row, ["ts", "occurred_at", "occurredAt", "timestamp"]);
    if (!eventId || !ts) continue;
    const ids = campaignIds(row);
    const interaction = text(row, ["interaction", "link_type", ...PATH_TYPE_FIELDS]).toLowerCase().includes("click") ? "click" : "view";
    exposures.push({
      eventId,
      ts,
      campaignId: ids.campaignId,
      campaignName: ids.campaignName,
      lineItemId: ids.lineItemId,
      lineItemName: ids.lineItemName,
      creativeId: text(row, AD_FIELDS) || text(row, CREATIVE_FIELDS),
      creativeName: text(row, AD_NAME_FIELDS),
      audienceId: text(row, AUDIENCE_FIELDS),
      maidListId: text(row, ["maid_list_id", "maidListId"]),
      vendorId: text(row, ["vendor_id", "vendorId", "vendor"]),
      subSegmentKey: text(row, ["sub_segment_key", "subSegmentKey"]),
      householdId: text(row, HOUSEHOLD_FIELDS),
      ipHash: acceptIp(text(row, ["ip", "ip_address"]), text(row, ["ip_hash", "ipHash"])),
      deviceType: text(row, DEVICE_FIELDS),
      publisher: text(row, SUPPLY_NAME_FIELDS),
      appBundle: text(row, ["app_bundle", "appBundle", "bundle"]),
      completionPct: amount(row, ["completion_pct", "completionPct"]),
      interaction,
      maid: text(row, ["maid", "maid_id"]),
    });
  }
  return exposures;
}

export function parseConversions(body: unknown): CtvConversion[] {
  const conversions: CtvConversion[] = [];
  for (const row of rowsOf(body)) {
    const conversionId = text(row, ["conversion_id", "conversionId", "id"]);
    const ts = text(row, ["ts", "occurred_at", "occurredAt", "timestamp"]);
    if (!conversionId || !ts) continue;
    conversions.push({
      conversionId,
      pixelEvent: text(row, ["pixel_event", "pixelEvent", "event"]) || "conversion",
      ts,
      value: amount(row, ["value", "conversion_value", ...REVENUE_FIELDS]),
      crmOutcome: text(row, ["crm_outcome", "crmOutcome"]),
      maidListId: text(row, ["maid_list_id", "maidListId"]),
      vendorId: text(row, ["vendor_id", "vendorId", "vendor"]),
      subSegmentKey: text(row, ["sub_segment_key", "subSegmentKey"]),
      audienceId: text(row, AUDIENCE_FIELDS),
      householdId: text(row, HOUSEHOLD_FIELDS),
      ipHash: acceptIp(text(row, ["ip", "ip_address"]), text(row, ["ip_hash", "ipHash"])),
      deviceType: text(row, DEVICE_FIELDS),
      maid: text(row, ["maid", "maid_id"]),
      cookie: text(row, ["cookie", "cookie_id"]),
      passesDedupe: row.passes_dedupe !== false && row.passesDedupe !== false,
      leadInvolved: row.lead_involved === true || row.leadInvolved === true,
      contactValid: typeof row.contact_valid === "boolean" ? row.contact_valid : typeof row.contactValid === "boolean" ? row.contactValid : null,
      crmOrPixelEngaged: row.crm_or_pixel_engaged === true || row.crmOrPixelEngaged === true,
      siteVisit: row.site_visit === true || row.siteVisit === true || text(row, ["pixel_event", "pixelEvent"]).includes("visit"),
      creditedChannel: text(row, ["credited_channel", "creditedChannel"]) || "stackadapt",
    });
  }
  return conversions;
}

export function pathLagHours(row: Record<string, unknown>, keys: readonly string[]) {
  const value = amount(row, keys);
  if (!value) return null;
  const unit = text(row, ["time_unit", "timeUnit"]).toLowerCase();
  if (unit.startsWith("sec")) return value / 3600;
  if (unit.startsWith("min")) return value / 60;
  if (unit.startsWith("day")) return value * 24;
  return value;
}

export { PATH_CLICK_LAG_FIELDS, PATH_VIEW_LAG_FIELDS, PATH_TYPE_FIELDS };

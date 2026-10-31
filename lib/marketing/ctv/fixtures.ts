import { hashIp } from "./quality";
import type { CtvConversion, CtvDelivery, CtvExposure, CtvHousehold, CtvPull } from "./types";

export const CTV_EXAMPLE_AT = "2026-10-30T15:00:00.000Z";
export const CTV_EXAMPLE_VENDOR = "vendor-example-9";
export const CTV_EXAMPLE_LIST = "list-retirees";
export const CTV_EXAMPLE_SUB = "55plus";
export const CTV_EXAMPLE_SPEND = 250.25;

const LIST = { maidListId: CTV_EXAMPLE_LIST, vendorId: CTV_EXAMPLE_VENDOR, subSegmentKey: CTV_EXAMPLE_SUB, audienceId: "aud-retirees" };

function atHoursBefore(hours: number) {
  return new Date(Date.parse(CTV_EXAMPLE_AT) - hours * 60 * 60 * 1000).toISOString();
}

function exposure(partial: Pick<CtvExposure, "eventId" | "householdId" | "interaction" | "ts"> & Partial<CtvExposure>): CtvExposure {
  return {
    campaignId: "cg-harbor",
    campaignName: "Harbor CTV",
    lineItemId: "c-retirees",
    lineItemName: "Retirees FL",
    creativeId: "ad-smile",
    creativeName: "Smile Again 15s",
    audienceId: LIST.audienceId,
    maidListId: LIST.maidListId,
    vendorId: LIST.vendorId,
    subSegmentKey: LIST.subSegmentKey,
    ipHash: "",
    deviceType: "ctv",
    publisher: "Example Streaming App",
    appBundle: "com.example.streaming",
    completionPct: 100,
    maid: "",
    ...partial,
  };
}

function conversion(partial: Pick<CtvConversion, "conversionId" | "householdId" | "ts"> & Partial<CtvConversion>): CtvConversion {
  return {
    pixelEvent: "lead",
    value: 0,
    crmOutcome: "qualified",
    maidListId: LIST.maidListId,
    vendorId: LIST.vendorId,
    subSegmentKey: LIST.subSegmentKey,
    audienceId: LIST.audienceId,
    ipHash: "",
    deviceType: "ctv",
    maid: "",
    cookie: "",
    passesDedupe: true,
    leadInvolved: true,
    contactValid: true,
    crmOrPixelEngaged: true,
    siteVisit: false,
    creditedChannel: "stackadapt",
    ...partial,
  };
}

export function exampleCtvPull(): CtvPull {
  const exposures: CtvExposure[] = [
    exposure({ eventId: "ex-det", householdId: "hh-det", maid: "maid-det", interaction: "click", ts: atHoursBefore(5), ipHash: hashIp("203.0.113.10") }),
    exposure({ eventId: "ex-view", householdId: "hh-view", interaction: "view", ts: atHoursBefore(10), ipHash: hashIp("203.0.113.11"), deviceType: "ctv" }),
    exposure({ eventId: "ex-late", householdId: "hh-late", interaction: "view", ts: atHoursBefore(60), ipHash: hashIp("203.0.113.12") }),
    exposure({ eventId: "ex-prob", householdId: "hh-prob", interaction: "view", ts: atHoursBefore(8), ipHash: hashIp("203.0.113.13"), deviceType: "phone" }),
    exposure({ eventId: "ex-both-click", householdId: "hh-both", maid: "maid-both", interaction: "click", ts: atHoursBefore(6), ipHash: hashIp("203.0.113.14") }),
    exposure({ eventId: "ex-both-view", householdId: "hh-both", maid: "maid-both", interaction: "view", ts: atHoursBefore(2), ipHash: hashIp("203.0.113.14") }),
    exposure({ eventId: "ex-unflag", householdId: "hh-unflag", maid: "maid-unflag", interaction: "click", ts: atHoursBefore(4), ipHash: hashIp("203.0.113.15") }),
    exposure({ eventId: "ex-dc", householdId: "hh-dc", interaction: "view", ts: atHoursBefore(3), ipHash: hashIp("203.0.113.66") }),
    exposure({ eventId: "ex-bad", householdId: "hh-bad", interaction: "view", ts: atHoursBefore(3), appBundle: "invalid.bundle" }),
    exposure({ eventId: "ex-assist", householdId: "hh-assist", maid: "maid-assist", interaction: "view", ts: atHoursBefore(4), ipHash: hashIp("203.0.113.16") }),
  ];
  const households: CtvHousehold[] = [
    { householdId: "hh-det", ipHash: hashIp("203.0.113.10"), linkedMaids: ["maid-det"], linkedCookies: [], matchMethod: "deterministic_maid", matchConfidence: 1 },
    { householdId: "hh-view", ipHash: hashIp("203.0.113.11"), linkedMaids: [], linkedCookies: [], matchMethod: "ip_device_graph", matchConfidence: 0.8 },
    { householdId: "hh-prob", ipHash: hashIp("203.0.113.13"), linkedMaids: [], linkedCookies: ["cookie-prob"], matchMethod: "probabilistic", matchConfidence: 0.4 },
  ];
  const conversions: CtvConversion[] = [
    conversion({ conversionId: "cv-det", householdId: "hh-det", maid: "maid-det", ts: CTV_EXAMPLE_AT, siteVisit: true, value: 100, ipHash: hashIp("203.0.113.10") }),
    conversion({ conversionId: "cv-view", householdId: "hh-view", ts: CTV_EXAMPLE_AT, siteVisit: true, leadInvolved: false, pixelEvent: "purchase", value: 80, ipHash: hashIp("203.0.113.11"), deviceType: "ctv" }),
    conversion({ conversionId: "cv-late", householdId: "hh-late", ts: CTV_EXAMPLE_AT, siteVisit: true, ipHash: hashIp("203.0.113.12") }),
    conversion({ conversionId: "cv-prob", householdId: "hh-prob", ts: CTV_EXAMPLE_AT, ipHash: hashIp("203.0.113.13"), deviceType: "tablet", cookie: "cookie-prob" }),
    conversion({ conversionId: "cv-both", householdId: "hh-both", maid: "maid-both", ts: CTV_EXAMPLE_AT, siteVisit: true, value: 120, ipHash: hashIp("203.0.113.14") }),
    conversion({ conversionId: "cv-unflag", householdId: "hh-unflag", maid: "maid-unflag", ts: CTV_EXAMPLE_AT, crmOrPixelEngaged: false, contactValid: null, crmOutcome: "", ipHash: hashIp("203.0.113.15") }),
    conversion({ conversionId: "cv-assist", householdId: "hh-assist", maid: "maid-assist", ts: CTV_EXAMPLE_AT, siteVisit: true, creditedChannel: "google_ads", ipHash: hashIp("203.0.113.16") }),
  ];
  const delivery: CtvDelivery[] = [
    {
      date: "2026-10-30",
      campaignId: "cg-harbor",
      campaignName: "Harbor CTV",
      lineItemId: "c-retirees",
      lineItemName: "Retirees FL",
      creativeId: "ad-smile",
      creativeName: "Smile Again 15s",
      audienceId: LIST.audienceId,
      audienceName: "Retirees",
      maidListId: LIST.maidListId,
      vendorId: LIST.vendorId,
      subSegmentKey: LIST.subSegmentKey,
      deviceType: "ctv",
      publisher: "Example Streaming App",
      impressions: 10000,
      uniqueImpressions: 4000,
      frequency: 2.5,
      completion25: 8000,
      completion50: 7000,
      completion75: 6000,
      completion100: 5000,
      completionRate: 0.5,
      spend: CTV_EXAMPLE_SPEND,
      clickConversions: 4,
      viewConversions: 3,
      conversionValue: 500,
      ipConversions: 2,
      cookieConversions: 2,
      siteVisits: 6,
      currency: "USD",
    },
  ];
  return {
    platform: "stackadapt",
    exampleData: true,
    warnings: ["EXAMPLE DATA. No platform call was made."],
    delivery,
    exposures,
    households,
    conversions,
    nativeWindow: {
      clickDays: 30,
      viewDays: 30,
      source: "example",
      label: "CTV (StackAdapt) native: 30-day click, 30-day view",
    },
    platformLifts: [],
  };
}

/** Raw REST-shaped fixture. Includes one raw IP so the parser can prove it is hashed and dropped. */
export function exampleStackAdaptBodies() {
  return {
    delivery: {
      data: [
        {
          date: "2026-10-30",
          campaign_group_id: "cg-harbor",
          campaign_group_name: "Harbor CTV",
          campaign_id: "c-retirees",
          campaign_name: "Retirees FL",
          channel_type: "CTV",
          ad_id: "ad-smile",
          ad_name: "Smile Again 15s",
          custom_segment_id: "aud-retirees",
          device_type: "ctv",
          supply_source_id: "src-example",
          supply_source_name: "Example Streaming App",
          impressions: "10000",
          unique_impressions: "4000",
          frequency: 2.5,
          cost: { amount: "250.25" },
          click_conversions: 4,
          impression_conversions: 3,
          conv_rev: "500",
          ip_conversions: 2,
          cookie_conversions: 2,
          ga4_sessions: 6,
          video_q_1_playbacks: "8000",
          video_q_2_playbacks: "7000",
          video_q_3_playbacks: "6000",
          video_completions: "5000",
          video_completion_rate: 0.5,
          ecpm: 25.025,
          ecpa: 80,
          roas: 2,
          currency: "USD",
        },
        {
          date: "2026-10-30",
          campaign_id: "display-1",
          channel_type: "Display",
          impressions: 50,
        },
      ],
    },
    conversionTrackers: {
      conversion_trackers: [{ id: "px-1", click_through_window: 30, view_through_window: 30 }],
    },
    exposures: {
      data: [
        {
          event_id: "ex-raw-ip",
          ts: CTV_EXAMPLE_AT,
          campaign_id: "c-retirees",
          interaction: "view",
          ip: "203.0.113.10",
          completion_pct: 75,
          maid_list_id: CTV_EXAMPLE_LIST,
        },
      ],
    },
  };
}

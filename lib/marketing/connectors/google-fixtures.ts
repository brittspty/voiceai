import { addDaysISO, zonedISODate } from "../../time";
import type { GoogleAdsBundle } from "./google-ads-map";

/**
 * Labeled fixture shaped like Google Ads API search rows.
 * Names start with MOCK. Numbers are illustrative, not a live account.
 */
export function mockGoogleAdsBundle(now: Date, timeZone = "America/New_York"): GoogleAdsBundle {
  const until = zonedISODate(now, timeZone);
  const days = [1, 0].map((offset) => addDaysISO(until, -offset));
  const customerId = "1000000001";

  const customer = {
    customer: {
      id: customerId,
      descriptiveName: "MOCK Google Ads account",
      currencyCode: "USD",
      timeZone,
      status: "ENABLED",
    },
  };

  const campaigns = [
    {
      campaign: {
        id: "2001",
        name: "MOCK — Search leads",
        status: "ENABLED",
        advertisingChannelType: "SEARCH",
        startDate: days[0],
        endDate: "2037-12-30",
      },
      campaignBudget: { amountMicros: "50000000", period: "DAILY" },
    },
    {
      campaign: {
        id: "2002",
        name: "MOCK — Brand search",
        status: "PAUSED",
        advertisingChannelType: "SEARCH",
        startDate: days[0],
        endDate: "2037-12-30",
      },
      campaignBudget: { amountMicros: "15000000", period: "DAILY" },
    },
  ];

  const adGroups = [
    {
      campaign: { id: "2001", biddingStrategyType: "MAXIMIZE_CONVERSIONS" },
      adGroup: { id: "3001", name: "MOCK — Roof repair", status: "ENABLED", type: "SEARCH_STANDARD" },
    },
    {
      campaign: { id: "2002", biddingStrategyType: "MANUAL_CPC" },
      adGroup: { id: "3002", name: "MOCK — Brand name", status: "PAUSED", type: "SEARCH_STANDARD" },
    },
  ];

  const ads = [
    {
      campaign: { id: "2001" },
      adGroup: { id: "3001" },
      adGroupAd: {
        status: "ENABLED",
        ad: {
          id: "4001",
          name: "MOCK Roof search",
          type: "RESPONSIVE_SEARCH_AD",
          finalUrls: ["https://example.com/mock/roof?utm_source=google"],
          responsiveSearchAd: {
            headlines: [{ text: "Storm damage? Start here" }, { text: "Free roof check" }],
            descriptions: [{ text: "A 30 second roof check." }],
          },
        },
      },
    },
    {
      campaign: { id: "2002" },
      adGroup: { id: "3002" },
      adGroupAd: {
        status: "PAUSED",
        ad: {
          id: "4002",
          name: "MOCK Brand search",
          type: "RESPONSIVE_SEARCH_AD",
          finalUrls: ["https://example.com/mock/brand"],
          responsiveSearchAd: {
            headlines: [{ text: "MOCK brand name" }],
            descriptions: [{ text: "Call the office." }],
          },
        },
      },
    },
  ];

  const metrics = ads.flatMap((ad, index) =>
    days.map((date, dayIndex) => ({
      segments: { date },
      campaign: { id: ad.campaign.id },
      adGroup: { id: ad.adGroup.id },
      adGroupAd: { ad: { id: ad.adGroupAd.ad.id } },
      metrics: {
        costMicros: String((12_000_000 + index * 1_000_000 + dayIndex * 500_000)),
        impressions: String(800 + index * 100 + dayIndex * 10),
        clicks: String(18 + index * 2 + dayIndex),
        conversions: String(index + dayIndex + 1),
        conversionsValue: "0",
      },
    })),
  );

  const searchTerms = [
    { term: "roof leak repair", matchType: "PHRASE", status: "NONE", adGroup: "3001", campaign: "2001" },
    { term: "free roof inspection", matchType: "EXACT", status: "ADDED", adGroup: "3001", campaign: "2001" },
  ].flatMap((row, index) =>
    days.map((date, dayIndex) => ({
      segments: { date, searchTermMatchType: row.matchType },
      campaign: { id: row.campaign },
      adGroup: { id: row.adGroup },
      searchTermView: { searchTerm: row.term, status: row.status },
      metrics: {
        impressions: String(40 + index * 5 + dayIndex),
        clicks: String(3 + index + dayIndex),
        costMicros: String(4_500_000 + index * 250_000),
        conversions: dayIndex === 0 ? "0" : "1",
      },
    })),
  );

  return { customer, campaigns, adGroups, ads, metrics, searchTerms, warnings: [] };
}

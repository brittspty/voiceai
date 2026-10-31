import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { decideGoogleBusinessProfile, googleBusinessProfileEnabled } from "./config";
import {
  BusinessProfileWriteBlockedError,
  assertBusinessProfileReadOnly,
  missingProfileFields,
  parsePerformanceMetrics,
  parseReviews,
  recommendBusinessProfile,
  reviewsUrl,
} from "./connectors/gbp-client";
import { runGoogleBusinessProfile } from "./gbp-sync";

const ROOT = path.resolve(import.meta.dirname, "../..");

test("business profile stays off until the switch is on", () => {
  assert.equal(googleBusinessProfileEnabled({}), false);
  assert.equal(decideGoogleBusinessProfile({}).action, "skip");
  const missing = decideGoogleBusinessProfile({ MARKETING_GBP: "on" });
  assert.equal(missing.action, "skip");
  assert.match(missing.action === "skip" ? missing.reason : "", /GOOGLE_ADS_CLIENT_ID/);
  const live = decideGoogleBusinessProfile({
    MARKETING_GBP: "on",
    GOOGLE_ADS_CLIENT_ID: "client",
    GOOGLE_ADS_CLIENT_SECRET: "secret",
    GOOGLE_ADS_REFRESH_TOKEN: "refresh",
    GOOGLE_BUSINESS_ACCOUNT_ID: "accounts/99",
    GOOGLE_BUSINESS_LOCATION_IDS: "locations/55,56",
  });
  assert.equal(live.action, "live");
  if (live.action === "live") {
    assert.deepEqual(live.locationIds, ["55", "56"]);
    assert.equal(live.accountId, "99");
    assert.equal(live.refreshToken, "refresh");
  }
});

test("performance, reviews, and missing info become recommendations", () => {
  const days = parsePerformanceMetrics({
    multiDailyMetricTimeSeries: [
      {
        dailyMetricTimeSeries: [
          { dailyMetric: "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", timeSeries: { datedValues: [{ date: { year: 2026, month: 10, day: 1 }, value: "10" }] } },
          { dailyMetric: "BUSINESS_IMPRESSIONS_MOBILE_MAPS", timeSeries: { datedValues: [{ date: { year: 2026, month: 10, day: 1 }, value: "4" }] } },
          { dailyMetric: "CALL_CLICKS", timeSeries: { datedValues: [{ date: { year: 2026, month: 10, day: 1 }, value: "2" }] } },
          { dailyMetric: "BUSINESS_DIRECTION_REQUESTS", timeSeries: { datedValues: [{ date: { year: 2026, month: 10, day: 1 }, value: "3" }] } },
          { dailyMetric: "WEBSITE_CLICKS", timeSeries: { datedValues: [{ date: { year: 2026, month: 10, day: 1 }, value: "5" }] } },
        ],
      },
    ],
  });
  assert.equal(days[0]?.views, 14);
  assert.equal(days[0]?.searches, 10);
  assert.equal(days[0]?.calls, 2);
  assert.equal(days[0]?.directionRequests, 3);
  assert.equal(days[0]?.websiteClicks, 5);
  const reviews = parseReviews({
    averageRating: 4.5,
    totalReviewCount: 2,
    reviews: [
      { reviewId: "a", starRating: "FIVE", comment: "Great", reviewReply: { comment: "Thanks" } },
      { reviewId: "b", starRating: "TWO", comment: "Slow" },
    ],
  });
  assert.equal(reviews.rating, 4.5);
  assert.equal(reviews.unansweredReviews, 1);
  const profile = missingProfileFields({ title: "North Roofing", phoneNumbers: {}, websiteUri: "", regularHours: { periods: [] }, profile: {}, categories: {}, storefrontAddress: {} });
  assert.ok(profile.missing.includes("phone number"));
  assert.ok(profile.missing.includes("hours"));
  const recommendations = recommendBusinessProfile({
    locationId: "55",
    title: profile.title,
    unansweredReviews: reviews.unansweredReviews,
    missingInfo: profile.missing,
    rating: reviews.rating,
    reviewCount: reviews.reviewCount,
  });
  assert.equal(recommendations.length, 2);
  assert.match(recommendations[0]?.title ?? "", /unanswered review/);
  assert.match(recommendations[1]?.title ?? "", /missing/);
  for (const recommendation of recommendations) {
    assert.equal(recommendation.recommendationOnly, true);
    assert.equal(recommendation.writesAds, false);
    assert.equal(recommendation.changesSpend, false);
    assert.match(recommendation.rationale, /Nothing is changed on Google|Nothing is posted/);
  }
});

test("writes are blocked and the live read reuses Google OAuth", async () => {
  assert.throws(() => assertBusinessProfileReadOnly("POST", reviewsUrl("99", "55") + "/abc/reply"), BusinessProfileWriteBlockedError);
  assert.throws(() => assertBusinessProfileReadOnly("PATCH", "https://mybusinessbusinessinformation.googleapis.com/v1/locations/55"), BusinessProfileWriteBlockedError);
  const calls: { url: string; method: string; body: string }[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method || "GET", body: String(init?.body ?? "") });
    if (url.includes("oauth2.googleapis.com/token")) return Response.json({ access_token: "access-token" });
    if (url.includes("fetchMultiDailyMetricsTimeSeries")) {
      return Response.json({
        multiDailyMetricTimeSeries: [
          {
            dailyMetricTimeSeries: [
              { dailyMetric: "CALL_CLICKS", timeSeries: { datedValues: [{ date: { year: 2026, month: 10, day: 20 }, value: "2" }] } },
              { dailyMetric: "WEBSITE_CLICKS", timeSeries: { datedValues: [{ date: { year: 2026, month: 10, day: 20 }, value: "5" }] } },
            ],
          },
        ],
      });
    }
    if (url.includes("mybusinessbusinessinformation.googleapis.com")) {
      return Response.json({
        title: "North Roofing",
        phoneNumbers: { primaryPhone: "555-0100" },
        websiteUri: "https://north.example",
        regularHours: { periods: [{ openDay: "MONDAY" }] },
        profile: { description: "Roofing" },
        categories: { primaryCategory: { displayName: "Roofer" } },
        storefrontAddress: { addressLines: ["1 Main"] },
      });
    }
    if (url.includes("/reviews")) {
      return Response.json({
        averageRating: 4.5,
        totalReviewCount: 1,
        reviews: [{ reviewId: "b", starRating: "TWO", comment: "Slow" }],
      });
    }
    return new Response("missing", { status: 404 });
  };
  const result = await runGoogleBusinessProfile({
    env: {
      MARKETING_GBP: "on",
      GOOGLE_ADS_CLIENT_ID: "google-client",
      GOOGLE_ADS_CLIENT_SECRET: "google-secret",
      GOOGLE_ADS_REFRESH_TOKEN: "google-refresh",
      GOOGLE_BUSINESS_ACCOUNT_ID: "99",
      GOOGLE_BUSINESS_LOCATION_IDS: "55",
      MARKETING_LOOKBACK_DAYS: "7",
    },
    now: new Date("2026-10-20T15:00:00.000Z"),
    fetchImpl,
  });
  assert.equal(result.status, "succeeded");
  assert.equal(calls[0]?.url, "https://oauth2.googleapis.com/token");
  assert.match(calls[0]?.body ?? "", /google-client/);
  assert.match(calls[0]?.body ?? "", /google-refresh/);
  assert.ok(calls.some((call) => call.method === "GET" && call.url.includes("businessprofileperformance.googleapis.com")));
  assert.ok(calls.some((call) => call.method === "GET" && call.url.includes("/reviews")));
  assert.equal(calls.filter((call) => call.method !== "GET" && !call.url.includes("oauth2.googleapis.com")).length, 0);
  assert.equal(result.recommendations.length, 1);
  assert.match(result.recommendations[0]?.title ?? "", /unanswered review/);
  const source = readFileSync(path.join(ROOT, "lib/marketing/connectors/gbp-client.ts"), "utf8");
  assert.match(source, /refreshGoogleAdsAccessToken/);
  assert.equal(source.includes("reviews.reply"), false);
  assert.match(source, /assertBusinessProfileReadOnly/);
});

/**
 * Google Business Profile reads.
 * Reuses the Google OAuth refresh token. This client only sends GET.
 * Reply, update, and delete URLs are refused before fetch.
 */

import { assertNoAdBudgetWrite } from "./budget-lock";
import { GOOGLE_ADS_TOKEN_URL, redactGoogleSecrets, refreshGoogleAdsAccessToken, type FetchLike } from "./google-ads-client";

export type { FetchLike };

export const BUSINESS_PROFILE_HOSTS = [
  "businessprofileperformance.googleapis.com",
  "mybusinessbusinessinformation.googleapis.com",
  "mybusiness.googleapis.com",
  "mybusinessaccountmanagement.googleapis.com",
] as const;

const DAILY_METRICS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "CALL_CLICKS",
  "BUSINESS_DIRECTION_REQUESTS",
  "WEBSITE_CLICKS",
] as const;

const VIEW_METRICS = new Set([
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
]);
const SEARCH_METRICS = new Set(["BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", "BUSINESS_IMPRESSIONS_MOBILE_SEARCH"]);

const WRITE_PATH = /:(patch|update|delete|mutate|reply)\b|\/reply\b|reviews:reply|locations\.patch|accounts\.patch/i;

export class BusinessProfileWriteBlockedError extends Error {
  constructor(method: string, rawUrl: string) {
    super(`Blocked Business Profile ${method} ${safePath(rawUrl)}. Only GET reads are allowed.`);
    this.name = "BusinessProfileWriteBlockedError";
  }
}

export class BusinessProfileApiError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "BusinessProfileApiError";
    this.status = status;
  }
}

function safePath(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return `${url.hostname}${url.pathname}`.slice(0, 180);
  } catch {
    return rawUrl.split("?")[0]?.slice(0, 180) || "invalid-url";
  }
}

export function assertBusinessProfileReadOnly(method: string, rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BusinessProfileWriteBlockedError(method, rawUrl);
  }
  const allowedHost = (BUSINESS_PROFILE_HOSTS as readonly string[]).includes(url.hostname);
  if (method.toUpperCase() !== "GET" || url.protocol !== "https:" || !allowedHost || url.username || url.password) {
    throw new BusinessProfileWriteBlockedError(method, rawUrl);
  }
  if (WRITE_PATH.test(`${url.pathname}${url.search}`)) throw new BusinessProfileWriteBlockedError(method, rawUrl);
}

export function businessLocationId(raw: string) {
  const trimmed = raw.trim().replace(/^locations\//, "");
  return /^\d+$/.test(trimmed) ? trimmed : "";
}

export function businessAccountId(raw: string) {
  const trimmed = raw.trim().replace(/^accounts\//, "");
  return /^\d+$/.test(trimmed) ? trimmed : "";
}

export function performanceUrl(locationId: string, start: string, end: string) {
  const id = businessLocationId(locationId);
  const startDate = dateParts(start);
  const endDate = dateParts(end);
  if (!id || !startDate || !endDate) throw new BusinessProfileWriteBlockedError("GET", locationId);
  const url = new URL(`https://businessprofileperformance.googleapis.com/v1/locations/${id}:fetchMultiDailyMetricsTimeSeries`);
  for (const metric of DAILY_METRICS) url.searchParams.append("dailyMetrics", metric);
  url.searchParams.set("dailyRange.startDate.year", String(startDate.year));
  url.searchParams.set("dailyRange.startDate.month", String(startDate.month));
  url.searchParams.set("dailyRange.startDate.day", String(startDate.day));
  url.searchParams.set("dailyRange.endDate.year", String(endDate.year));
  url.searchParams.set("dailyRange.endDate.month", String(endDate.month));
  url.searchParams.set("dailyRange.endDate.day", String(endDate.day));
  assertBusinessProfileReadOnly("GET", url.toString());
  return url.toString();
}

export function locationUrl(locationId: string) {
  const id = businessLocationId(locationId);
  if (!id) throw new BusinessProfileWriteBlockedError("GET", locationId);
  const url = new URL(`https://mybusinessbusinessinformation.googleapis.com/v1/locations/${id}`);
  url.searchParams.set("readMask", "title,phoneNumbers,websiteUri,storefrontAddress,regularHours,profile,categories");
  assertBusinessProfileReadOnly("GET", url.toString());
  return url.toString();
}

export function reviewsUrl(accountId: string, locationId: string) {
  const account = businessAccountId(accountId);
  const location = businessLocationId(locationId);
  if (!account || !location) throw new BusinessProfileWriteBlockedError("GET", `${accountId}/${locationId}`);
  const url = `https://mybusiness.googleapis.com/v4/accounts/${account}/locations/${location}/reviews`;
  assertBusinessProfileReadOnly("GET", url);
  return url;
}

function dateParts(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.slice(0, 10));
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

async function businessGet(url: string, accessToken: string, fetchImpl: FetchLike, secrets: string[]) {
  assertNoAdBudgetWrite({ method: "GET", url });
  assertBusinessProfileReadOnly("GET", url);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
      redirect: "error",
    });
  } catch (error) {
    throw new BusinessProfileApiError(redactGoogleSecrets(error instanceof Error ? error.message : "Business Profile request failed", secrets));
  }
  const text = await response.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    const record = body && typeof body === "object" ? (body as { error?: { message?: string } }) : {};
    const message = record.error?.message || (typeof body === "string" ? body : "Business Profile request failed");
    throw new BusinessProfileApiError(redactGoogleSecrets(`Business Profile ${response.status}: ${message}`.slice(0, 400), secrets), response.status);
  }
  return body;
}

export type BusinessProfileDay = {
  date: string;
  views: number;
  searches: number;
  calls: number;
  directionRequests: number;
  websiteClicks: number;
};

export type BusinessProfileReport = {
  locationId: string;
  accountId: string;
  title: string;
  days: BusinessProfileDay[];
  rating: number | null;
  reviewCount: number;
  unansweredReviews: number;
  missingInfo: string[];
  warnings: string[];
};

type DayBucket = BusinessProfileDay;

function dayBucket(date: string): DayBucket {
  return { date, views: 0, searches: 0, calls: 0, directionRequests: 0, websiteClicks: 0 };
}

function isoDate(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const row = value as { year?: number; month?: number; day?: number };
  if (!row.year || !row.month || !row.day) return "";
  return `${String(row.year).padStart(4, "0")}-${String(row.month).padStart(2, "0")}-${String(row.day).padStart(2, "0")}`;
}

function addMetric(bucket: DayBucket, metric: string, value: number) {
  if (VIEW_METRICS.has(metric)) bucket.views += value;
  if (SEARCH_METRICS.has(metric)) bucket.searches += value;
  if (metric === "CALL_CLICKS") bucket.calls += value;
  if (metric === "BUSINESS_DIRECTION_REQUESTS") bucket.directionRequests += value;
  if (metric === "WEBSITE_CLICKS") bucket.websiteClicks += value;
}

export function parsePerformanceMetrics(payload: unknown): BusinessProfileDay[] {
  const root = payload && typeof payload === "object" ? (payload as { multiDailyMetricTimeSeries?: unknown[] }) : {};
  const byDate = new Map<string, DayBucket>();
  const seriesGroups = Array.isArray(root.multiDailyMetricTimeSeries) ? root.multiDailyMetricTimeSeries : [];
  for (const group of seriesGroups) {
    const rows = group && typeof group === "object" ? (group as { dailyMetricTimeSeries?: unknown[] }).dailyMetricTimeSeries : undefined;
    const list = Array.isArray(rows) ? rows : [];
    for (const series of list) {
      if (!series || typeof series !== "object") continue;
      const metric = String((series as { dailyMetric?: string }).dailyMetric || "");
      const dated = (series as { timeSeries?: { datedValues?: unknown[] } }).timeSeries?.datedValues;
      if (!Array.isArray(dated)) continue;
      for (const point of dated) {
        if (!point || typeof point !== "object") continue;
        const row = point as { date?: unknown; value?: unknown };
        const date = isoDate(row.date);
        if (!date) continue;
        const value = Number(row.value ?? 0);
        const bucket = byDate.get(date) ?? dayBucket(date);
        addMetric(bucket, metric, Number.isFinite(value) && value > 0 ? value : 0);
        byDate.set(date, bucket);
      }
    }
  }
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

export function missingProfileFields(payload: unknown) {
  const row = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const phone = row.phoneNumbers && typeof row.phoneNumbers === "object" ? String((row.phoneNumbers as { primaryPhone?: string }).primaryPhone || "") : "";
  const website = typeof row.websiteUri === "string" ? row.websiteUri : "";
  const hours = row.regularHours && typeof row.regularHours === "object" ? (row.regularHours as { periods?: unknown[] }).periods : [];
  const description = row.profile && typeof row.profile === "object" ? String((row.profile as { description?: string }).description || "") : "";
  const category = row.categories && typeof row.categories === "object" ? (row.categories as { primaryCategory?: unknown }).primaryCategory : null;
  const address = row.storefrontAddress && typeof row.storefrontAddress === "object" ? (row.storefrontAddress as { addressLines?: unknown[] }).addressLines : [];
  const missing: string[] = [];
  if (!phone.trim()) missing.push("phone number");
  if (!website.trim()) missing.push("website");
  if (!Array.isArray(hours) || hours.length === 0) missing.push("hours");
  if (!description.trim()) missing.push("description");
  if (!category) missing.push("category");
  if (!Array.isArray(address) || address.length === 0) missing.push("address");
  const title = typeof row.title === "string" && row.title.trim() ? row.title.trim() : "";
  return { title, missing };
}

const STAR_VALUES: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

export function parseReviews(payload: unknown) {
  const row = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const reviews = Array.isArray(row.reviews) ? row.reviews : [];
  let unanswered = 0;
  let stars = 0;
  let counted = 0;
  for (const review of reviews) {
    if (!review || typeof review !== "object") continue;
    const item = review as { reviewReply?: unknown; starRating?: string };
    const reply = item.reviewReply && typeof item.reviewReply === "object" ? String((item.reviewReply as { comment?: string }).comment || "") : "";
    if (!reply.trim()) unanswered += 1;
    const value = STAR_VALUES[String(item.starRating || "").toUpperCase()];
    if (value) {
      stars += value;
      counted += 1;
    }
  }
  const average = typeof row.averageRating === "number" && Number.isFinite(row.averageRating) ? row.averageRating : counted ? stars / counted : null;
  const reviewCount = typeof row.totalReviewCount === "number" && Number.isFinite(row.totalReviewCount) ? row.totalReviewCount : reviews.length;
  return { rating: average, reviewCount, unansweredReviews: unanswered };
}

export type BusinessProfileRecommendation = {
  type: "business_profile";
  action: "review";
  locationId: string;
  title: string;
  summary: string;
  rationale: string;
  metric: string;
  baseline: string;
  observed: string;
  sampleSize: number;
  confidence: number;
  changesSpend: false;
  writesAds: false;
  recommendationOnly: true;
};

const FIXED = "Yes records your answer. Nothing is changed on Google.";

export function recommendBusinessProfile(report: Pick<BusinessProfileReport, "locationId" | "title" | "unansweredReviews" | "missingInfo" | "rating" | "reviewCount">): BusinessProfileRecommendation[] {
  const name = report.title || "This profile";
  const drafts: BusinessProfileRecommendation[] = [];
  if (report.unansweredReviews > 0) {
    const count = report.unansweredReviews;
    const reason = `${name} has ${count} unanswered review${count === 1 ? "" : "s"}. A person can reply. Nothing is posted on its own.`;
    drafts.push({
      type: "business_profile",
      action: "review",
      locationId: report.locationId,
      title: reason,
      summary: FIXED,
      rationale: [reason, FIXED].join("\n"),
      metric: "reviews",
      baseline: "0",
      observed: String(count),
      sampleSize: report.reviewCount,
      confidence: count >= 1 ? 0.9 : 0,
      changesSpend: false,
      writesAds: false,
      recommendationOnly: true,
    });
  }
  if (report.missingInfo.length) {
    const list = report.missingInfo.join(", ");
    const reason = `${name} is missing ${list}. Adding them is a suggestion. Nothing is changed on Google.`;
    drafts.push({
      type: "business_profile",
      action: "review",
      locationId: report.locationId,
      title: reason,
      summary: FIXED,
      rationale: [reason, FIXED].join("\n"),
      metric: "profile",
      baseline: "complete",
      observed: String(report.missingInfo.length),
      sampleSize: report.missingInfo.length,
      confidence: 0.9,
      changesSpend: false,
      writesAds: false,
      recommendationOnly: true,
    });
  }
  return drafts;
}

export async function pullBusinessProfile(input: {
  accessToken: string;
  accountId: string;
  locationId: string;
  start: string;
  end: string;
  fetchImpl?: FetchLike;
  secrets?: string[];
}): Promise<BusinessProfileReport> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const secrets = input.secrets ?? [];
  const warnings: string[] = [];
  const days = parsePerformanceMetrics(await businessGet(performanceUrl(input.locationId, input.start, input.end), input.accessToken, fetchImpl, secrets));
  let title = "";
  let missing: string[] = [];
  try {
    const location = missingProfileFields(await businessGet(locationUrl(input.locationId), input.accessToken, fetchImpl, secrets));
    title = location.title;
    missing = location.missing;
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "Location details were not read.");
  }
  let rating: number | null = null;
  let reviewCount = 0;
  let unansweredReviews = 0;
  if (businessAccountId(input.accountId)) {
    try {
      const reviews = parseReviews(await businessGet(reviewsUrl(input.accountId, input.locationId), input.accessToken, fetchImpl, secrets));
      rating = reviews.rating;
      reviewCount = reviews.reviewCount;
      unansweredReviews = reviews.unansweredReviews;
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "Reviews were not read.");
    }
  } else {
    warnings.push("Reviews need GOOGLE_BUSINESS_ACCOUNT_ID.");
  }
  return {
    locationId: businessLocationId(input.locationId),
    accountId: businessAccountId(input.accountId),
    title: title || `Location ${businessLocationId(input.locationId)}`,
    days,
    rating,
    reviewCount,
    unansweredReviews,
    missingInfo: missing,
    warnings,
  };
}

/** Refresh the shared Google OAuth token, then read. The refresh call is the existing Google token request. */
export async function pullBusinessProfileWithGoogleOAuth(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accountId: string;
  locationIds: string[];
  start: string;
  end: string;
  fetchImpl?: FetchLike;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const secrets = [input.clientSecret, input.refreshToken, input.clientId].filter((value) => value.length >= 6);
  assertNoAdBudgetWrite({
    method: "POST",
    url: GOOGLE_ADS_TOKEN_URL,
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: input.clientId,
      client_secret: input.clientSecret,
      refresh_token: input.refreshToken,
    }),
  });
  const accessToken = await refreshGoogleAdsAccessToken({
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    refreshToken: input.refreshToken,
    fetchImpl,
  });
  const reports: BusinessProfileReport[] = [];
  for (const locationId of input.locationIds) {
    reports.push(
      await pullBusinessProfile({
        accessToken,
        accountId: input.accountId,
        locationId,
        start: input.start,
        end: input.end,
        fetchImpl,
        secrets,
      }),
    );
  }
  return reports;
}

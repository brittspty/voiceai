/**
 * Google Business Profile reads.
 * Reuses the Google OAuth refresh token. This client only sends GET.
 * Reply, update, and delete URLs are refused before fetch.
 * Q&A is not called. Google retired that API.
 */

import { createHash } from "node:crypto";
import { assertNoAdBudgetWrite } from "./budget-lock";
import { GOOGLE_ADS_TOKEN_URL, redactGoogleSecrets, refreshGoogleAdsAccessToken, type FetchLike } from "./google-ads-client";
import { BUSINESS_PROFILE_SCOPE } from "../gbp-scope";

export type { FetchLike };
export { BUSINESS_PROFILE_SCOPE };

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
  "BUSINESS_BOOKINGS",
  "BUSINESS_CONVERSATIONS",
  "BUSINESS_FOOD_ORDERS",
] as const;

const VIEW_METRICS = new Set([
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
]);
const SEARCH_METRICS = new Set(["BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", "BUSINESS_IMPRESSIONS_MOBILE_SEARCH"]);
const MAPS_METRICS = new Set(["BUSINESS_IMPRESSIONS_DESKTOP_MAPS", "BUSINESS_IMPRESSIONS_MOBILE_MAPS"]);

const WRITE_PATH = /:(patch|update|delete|mutate|reply|batchUpdate)\b|\/reply\b|reviews:reply|locations\.patch|accounts\.patch|localPosts\b.*\b(delete|patch)/i;
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

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
  const verb = method.toUpperCase();
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BusinessProfileWriteBlockedError(method, rawUrl);
  }
  const allowedHost = (BUSINESS_PROFILE_HOSTS as readonly string[]).includes(url.hostname);
  if (WRITE_METHODS.has(verb) || verb !== "GET" || url.protocol !== "https:" || !allowedHost || url.username || url.password) {
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

function dateParts(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.slice(0, 10));
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function monthParts(iso: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(iso.slice(0, 7));
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
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

export function keywordsUrl(locationId: string, startMonth: string, endMonth: string) {
  const id = businessLocationId(locationId);
  const start = monthParts(startMonth);
  const end = monthParts(endMonth);
  if (!id || !start || !end) throw new BusinessProfileWriteBlockedError("GET", locationId);
  const url = new URL(`https://businessprofileperformance.googleapis.com/v1/locations/${id}/searchkeywords/impressions/monthly`);
  url.searchParams.set("monthlyRange.startMonth.year", String(start.year));
  url.searchParams.set("monthlyRange.startMonth.month", String(start.month));
  url.searchParams.set("monthlyRange.endMonth.year", String(end.year));
  url.searchParams.set("monthlyRange.endMonth.month", String(end.month));
  assertBusinessProfileReadOnly("GET", url.toString());
  return url.toString();
}

const LOCATION_READ_MASK = "name,title,phoneNumbers,websiteUri,storefrontAddress,regularHours,specialHours,profile,categories,serviceItems,metadata";

export function locationUrl(locationId: string) {
  const id = businessLocationId(locationId);
  if (!id) throw new BusinessProfileWriteBlockedError("GET", locationId);
  const url = new URL(`https://mybusinessbusinessinformation.googleapis.com/v1/locations/${id}`);
  url.searchParams.set("readMask", LOCATION_READ_MASK);
  assertBusinessProfileReadOnly("GET", url.toString());
  return url.toString();
}

export function attributesUrl(locationId: string) {
  const id = businessLocationId(locationId);
  if (!id) throw new BusinessProfileWriteBlockedError("GET", locationId);
  const url = `https://mybusinessbusinessinformation.googleapis.com/v1/locations/${id}/attributes`;
  assertBusinessProfileReadOnly("GET", url);
  return url;
}

export function reviewsUrl(accountId: string, locationId: string) {
  const account = businessAccountId(accountId);
  const location = businessLocationId(locationId);
  if (!account || !location) throw new BusinessProfileWriteBlockedError("GET", `${accountId}/${locationId}`);
  const url = `https://mybusiness.googleapis.com/v4/accounts/${account}/locations/${location}/reviews`;
  assertBusinessProfileReadOnly("GET", url);
  return url;
}

export function mediaUrl(accountId: string, locationId: string) {
  const account = businessAccountId(accountId);
  const location = businessLocationId(locationId);
  if (!account || !location) throw new BusinessProfileWriteBlockedError("GET", `${accountId}/${locationId}`);
  const url = `https://mybusiness.googleapis.com/v4/accounts/${account}/locations/${location}/media`;
  assertBusinessProfileReadOnly("GET", url);
  return url;
}

export function postsUrl(accountId: string, locationId: string) {
  const account = businessAccountId(accountId);
  const location = businessLocationId(locationId);
  if (!account || !location) throw new BusinessProfileWriteBlockedError("GET", `${accountId}/${locationId}`);
  const url = `https://mybusiness.googleapis.com/v4/accounts/${account}/locations/${location}/localPosts`;
  assertBusinessProfileReadOnly("GET", url);
  return url;
}

export function accountsUrl() {
  const url = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
  assertBusinessProfileReadOnly("GET", url);
  return url;
}

export function accountLocationsUrl(accountId: string) {
  const account = businessAccountId(accountId);
  if (!account) throw new BusinessProfileWriteBlockedError("GET", accountId);
  const url = new URL(`https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${account}/locations`);
  url.searchParams.set("readMask", "name,title,phoneNumbers,websiteUri,storefrontAddress,categories");
  url.searchParams.set("pageSize", "100");
  assertBusinessProfileReadOnly("GET", url.toString());
  return url.toString();
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
  searchDesktop: number;
  searchMobile: number;
  mapsDesktop: number;
  mapsMobile: number;
  bookings: number;
  conversations: number;
  foodOrders: number;
};

export type BusinessKeyword = {
  keyword: string;
  impressions: number | null;
  threshold: string;
};

export type BusinessReviewDetail = {
  reviewId: string;
  starRating: number;
  comment: string;
  createTime: string;
  updateTime: string;
  reviewerNameHash: string;
  hasOwnerReply: boolean;
  replyTime: string;
  replyText: string;
};

export type BusinessMediaItem = {
  id: string;
  type: string;
  category: string;
  createTime: string | null;
};

export type BusinessPostItem = {
  id: string;
  type: string;
  state: string;
  createTime: string | null;
};

export type BusinessAttribute = { name: string; answered: boolean };

export type BusinessAddress = {
  street: string;
  city: string;
  region: string;
  postalCode: string;
  lines: string[];
};

export type BusinessService = { name: string };

export type BusinessProfileFields = {
  title: string;
  phone: string;
  websiteUri: string;
  description: string;
  primaryCategory: string;
  additionalCategories: string[];
  address: BusinessAddress;
  regularHours: unknown;
  specialHours: unknown;
  services: BusinessService[];
  verificationState: string;
  missing: string[];
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
  keywords: BusinessKeyword[];
  reviews: BusinessReviewDetail[];
  photoCount: number;
  lastPhotoAt: string | null;
  hasLogo: boolean;
  hasCover: boolean;
  media: BusinessMediaItem[];
  postCount: number;
  lastPostAt: string | null;
  posts: BusinessPostItem[];
  attributes: BusinessAttribute[];
  profile: BusinessProfileFields;
};

type DayBucket = BusinessProfileDay;

function dayBucket(date: string): DayBucket {
  return {
    date,
    views: 0,
    searches: 0,
    calls: 0,
    directionRequests: 0,
    websiteClicks: 0,
    searchDesktop: 0,
    searchMobile: 0,
    mapsDesktop: 0,
    mapsMobile: 0,
    bookings: 0,
    conversations: 0,
    foodOrders: 0,
  };
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
  if (MAPS_METRICS.has(metric)) {
    if (metric.includes("DESKTOP")) bucket.mapsDesktop += value;
    if (metric.includes("MOBILE")) bucket.mapsMobile += value;
  }
  if (metric === "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH") bucket.searchDesktop += value;
  if (metric === "BUSINESS_IMPRESSIONS_MOBILE_SEARCH") bucket.searchMobile += value;
  if (metric === "CALL_CLICKS") bucket.calls += value;
  if (metric === "BUSINESS_DIRECTION_REQUESTS") bucket.directionRequests += value;
  if (metric === "WEBSITE_CLICKS") bucket.websiteClicks += value;
  if (metric === "BUSINESS_BOOKINGS") bucket.bookings += value;
  if (metric === "BUSINESS_CONVERSATIONS") bucket.conversations += value;
  if (metric === "BUSINESS_FOOD_ORDERS") bucket.foodOrders += value;
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

export function parseKeywords(payload: unknown): BusinessKeyword[] {
  const root = payload && typeof payload === "object" ? (payload as { searchKeywordsCounts?: unknown[] }) : {};
  const rows = Array.isArray(root.searchKeywordsCounts) ? root.searchKeywordsCounts : [];
  const keywords: BusinessKeyword[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const item = row as { searchKeyword?: string; insightsValue?: { value?: string; threshold?: string } };
    const keyword = String(item.searchKeyword || "").trim();
    if (!keyword) continue;
    const rawValue = item.insightsValue?.value;
    const impressions = rawValue == null || rawValue === "" ? null : Number(rawValue);
    keywords.push({
      keyword,
      impressions: impressions != null && Number.isFinite(impressions) ? impressions : null,
      threshold: String(item.insightsValue?.threshold || ""),
    });
  }
  return keywords;
}

function textOf(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function categoryName(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const row = value as { displayName?: string; name?: string };
  return textOf(row.displayName) || textOf(row.name);
}

export function parseLocationProfile(payload: unknown): BusinessProfileFields {
  const row = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const phone = row.phoneNumbers && typeof row.phoneNumbers === "object" ? textOf((row.phoneNumbers as { primaryPhone?: string }).primaryPhone) : "";
  const websiteUri = textOf(row.websiteUri);
  const description = row.profile && typeof row.profile === "object" ? textOf((row.profile as { description?: string }).description) : "";
  const categories = row.categories && typeof row.categories === "object" ? (row.categories as { primaryCategory?: unknown; additionalCategories?: unknown[] }) : {};
  const primaryCategory = categoryName(categories.primaryCategory);
  const additionalCategories = Array.isArray(categories.additionalCategories) ? categories.additionalCategories.map(categoryName).filter(Boolean) : [];
  const addressRow = row.storefrontAddress && typeof row.storefrontAddress === "object" ? (row.storefrontAddress as Record<string, unknown>) : {};
  const lines = Array.isArray(addressRow.addressLines) ? addressRow.addressLines.map((line) => textOf(line)).filter(Boolean) : [];
  const address: BusinessAddress = {
    street: lines[0] || "",
    city: textOf(addressRow.locality),
    region: textOf(addressRow.administrativeArea),
    postalCode: textOf(addressRow.postalCode),
    lines,
  };
  const services = parseServices(row.serviceItems);
  const metadata = row.metadata && typeof row.metadata === "object" ? (row.metadata as { placeId?: string; hasVoiceOfMerchant?: boolean }) : {};
  const verificationState = metadata.hasVoiceOfMerchant ? "verified" : textOf(metadata.placeId) ? "listed" : "";
  const missing: string[] = [];
  if (!phone) missing.push("phone number");
  if (!websiteUri) missing.push("website");
  const hours = row.regularHours && typeof row.regularHours === "object" ? (row.regularHours as { periods?: unknown[] }).periods : [];
  if (!Array.isArray(hours) || hours.length === 0) missing.push("hours");
  if (!description) missing.push("description");
  if (!primaryCategory) missing.push("category");
  if (!lines.length) missing.push("address");
  return {
    title: textOf(row.title),
    phone,
    websiteUri,
    description,
    primaryCategory,
    additionalCategories,
    address,
    regularHours: row.regularHours ?? {},
    specialHours: row.specialHours ?? {},
    services,
    verificationState,
    missing,
  };
}

function parseServices(value: unknown): BusinessService[] {
  if (!Array.isArray(value)) return [];
  const names: BusinessService[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as {
      freeFormServiceItem?: { label?: { displayName?: string } };
      structuredServiceItem?: { description?: string; serviceTypeId?: string };
      displayName?: string;
      name?: string;
    };
    const name = textOf(row.freeFormServiceItem?.label?.displayName) || textOf(row.displayName) || textOf(row.structuredServiceItem?.description) || textOf(row.name);
    if (name) names.push({ name });
  }
  return names;
}

export function missingProfileFields(payload: unknown) {
  const profile = parseLocationProfile(payload);
  return { title: profile.title, missing: profile.missing };
}

export function parseAttributes(payload: unknown): BusinessAttribute[] {
  const root = payload && typeof payload === "object" ? (payload as { attributes?: unknown[] }) : {};
  const rows = Array.isArray(root.attributes) ? root.attributes : Array.isArray(payload) ? payload : [];
  const attributes: BusinessAttribute[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const item = row as { name?: string; values?: unknown[]; uriValues?: unknown[]; repeatedEnumValue?: { setValues?: unknown[] } };
    const name = textOf(item.name);
    if (!name) continue;
    const answered = (Array.isArray(item.values) && item.values.length > 0) || (Array.isArray(item.uriValues) && item.uriValues.length > 0) || (Array.isArray(item.repeatedEnumValue?.setValues) && item.repeatedEnumValue.setValues.length > 0);
    attributes.push({ name, answered });
  }
  return attributes;
}

const STAR_VALUES: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5 };

export function hashReviewerName(name: string) {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return "";
  return createHash("sha256").update(`gbp-reviewer\0${normalized}`, "utf8").digest("hex");
}

export function parseReviews(payload: unknown) {
  const details = parseReviewDetails(payload);
  return { rating: details.rating, reviewCount: details.reviewCount, unansweredReviews: details.unansweredReviews };
}

export function parseReviewDetails(payload: unknown) {
  const row = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const reviewsRaw = Array.isArray(row.reviews) ? row.reviews : [];
  const reviews: BusinessReviewDetail[] = [];
  let unanswered = 0;
  let stars = 0;
  let counted = 0;
  for (const review of reviewsRaw) {
    if (!review || typeof review !== "object") continue;
    const item = review as {
      reviewId?: string;
      name?: string;
      starRating?: string | number;
      comment?: string;
      createTime?: string;
      updateTime?: string;
      reviewer?: { displayName?: string };
      reviewReply?: { comment?: string; updateTime?: string };
    };
    const reply = textOf(item.reviewReply?.comment);
    if (!reply) unanswered += 1;
    const value = STAR_VALUES[String(item.starRating || "").toUpperCase()] || 0;
    if (value) {
      stars += value;
      counted += 1;
    }
    const reviewId = textOf(item.reviewId) || textOf(item.name).split("/").pop() || "";
    reviews.push({
      reviewId,
      starRating: value,
      comment: textOf(item.comment),
      createTime: textOf(item.createTime),
      updateTime: textOf(item.updateTime),
      reviewerNameHash: hashReviewerName(textOf(item.reviewer?.displayName)),
      hasOwnerReply: Boolean(reply),
      replyTime: textOf(item.reviewReply?.updateTime),
      replyText: reply,
    });
  }
  const average = typeof row.averageRating === "number" && Number.isFinite(row.averageRating) ? row.averageRating : counted ? stars / counted : null;
  const reviewCount = typeof row.totalReviewCount === "number" && Number.isFinite(row.totalReviewCount) ? row.totalReviewCount : reviews.length;
  return { rating: average, reviewCount, unansweredReviews: unanswered, reviews };
}

function latestIso(values: (string | null)[]) {
  const sorted = values.filter((value): value is string => Boolean(value)).sort();
  return sorted.length ? sorted[sorted.length - 1] : null;
}

export function parseMedia(payload: unknown) {
  const root = payload && typeof payload === "object" ? (payload as { mediaItems?: unknown[]; totalMediaItemCount?: number }) : {};
  const rows = Array.isArray(root.mediaItems) ? root.mediaItems : [];
  const items: BusinessMediaItem[] = [];
  let hasLogo = false;
  let hasCover = false;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const item = row as { name?: string; mediaFormat?: string; createTime?: string; locationAssociation?: { category?: string } };
    const category = textOf(item.locationAssociation?.category).toUpperCase();
    if (category === "LOGO" || category === "PROFILE") hasLogo = true;
    if (category === "COVER") hasCover = true;
    items.push({
      id: textOf(item.name).split("/").pop() || "",
      type: textOf(item.mediaFormat) || "PHOTO",
      category,
      createTime: textOf(item.createTime) || null,
    });
  }
  const photoCount = typeof root.totalMediaItemCount === "number" && Number.isFinite(root.totalMediaItemCount) ? root.totalMediaItemCount : items.length;
  return { photoCount, lastPhotoAt: latestIso(items.map((item) => item.createTime)), hasLogo, hasCover, items };
}

export function parsePosts(payload: unknown) {
  const root = payload && typeof payload === "object" ? (payload as { localPosts?: unknown[] }) : {};
  const rows = Array.isArray(root.localPosts) ? root.localPosts : [];
  const items: BusinessPostItem[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const item = row as { name?: string; topicType?: string; state?: string; createTime?: string };
    items.push({
      id: textOf(item.name).split("/").pop() || "",
      type: textOf(item.topicType),
      state: textOf(item.state),
      createTime: textOf(item.createTime) || null,
    });
  }
  return { postCount: items.length, lastPostAt: latestIso(items.map((item) => item.createTime)), items };
}

export function parseAccounts(payload: unknown) {
  const root = payload && typeof payload === "object" ? (payload as { accounts?: unknown[] }) : {};
  const rows = Array.isArray(root.accounts) ? root.accounts : [];
  const accounts: { accountId: string; accountName: string }[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const item = row as { name?: string; accountName?: string };
    const accountId = businessAccountId(textOf(item.name));
    if (!accountId) continue;
    accounts.push({ accountId, accountName: textOf(item.accountName) });
  }
  return accounts;
}

export function parseListedLocations(payload: unknown) {
  const root = payload && typeof payload === "object" ? (payload as { locations?: unknown[] }) : {};
  const rows = Array.isArray(root.locations) ? root.locations : [];
  return rows.map((row) => parseLocationProfile(row)).map((profile, index) => {
    const source = rows[index] && typeof rows[index] === "object" ? (rows[index] as { name?: string }) : {};
    const locationId = textOf(source.name).split("/").pop() || "";
    return { locationId: businessLocationId(locationId) || locationId, profile };
  }).filter((row) => row.locationId);
}

export function profileFieldsHash(profile: BusinessProfileFields) {
  const stable = {
    title: profile.title,
    phone: profile.phone,
    websiteUri: profile.websiteUri,
    description: profile.description,
    primaryCategory: profile.primaryCategory,
    additionalCategories: profile.additionalCategories,
    address: profile.address,
    services: profile.services.map((service) => service.name),
  };
  return createHash("sha256").update(JSON.stringify(stable), "utf8").digest("hex");
}

function emptyProfile(): BusinessProfileFields {
  return {
    title: "",
    phone: "",
    websiteUri: "",
    description: "",
    primaryCategory: "",
    additionalCategories: [],
    address: { street: "", city: "", region: "", postalCode: "", lines: [] },
    regularHours: {},
    specialHours: {},
    services: [],
    verificationState: "",
    missing: ["phone number", "website", "hours", "description", "category", "address"],
  };
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

async function readOptional(label: string, url: string, accessToken: string, fetchImpl: FetchLike, secrets: string[], warnings: string[]) {
  try {
    return await businessGet(url, accessToken, fetchImpl, secrets);
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : `${label} was not read.`);
    return null;
  }
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
  const month = input.end.slice(0, 7);
  const keywordPayload = await readOptional("Keywords", keywordsUrl(input.locationId, month, month), input.accessToken, fetchImpl, secrets, warnings);
  let profile = emptyProfile();
  try {
    profile = parseLocationProfile(await businessGet(locationUrl(input.locationId), input.accessToken, fetchImpl, secrets));
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "Location details were not read.");
  }
  const attributePayload = await readOptional("Attributes", attributesUrl(input.locationId), input.accessToken, fetchImpl, secrets, warnings);
  let rating: number | null = null;
  let reviewCount = 0;
  let unansweredReviews = 0;
  let reviews: BusinessReviewDetail[] = [];
  let photoCount = 0;
  let lastPhotoAt: string | null = null;
  let hasLogo = false;
  let hasCover = false;
  let media: BusinessMediaItem[] = [];
  let postCount = 0;
  let lastPostAt: string | null = null;
  let posts: BusinessPostItem[] = [];
  if (businessAccountId(input.accountId)) {
    const reviewPayload = await readOptional("Reviews", reviewsUrl(input.accountId, input.locationId), input.accessToken, fetchImpl, secrets, warnings);
    if (reviewPayload) {
      const parsed = parseReviewDetails(reviewPayload);
      rating = parsed.rating;
      reviewCount = parsed.reviewCount;
      unansweredReviews = parsed.unansweredReviews;
      reviews = parsed.reviews;
    }
    const mediaPayload = await readOptional("Photos", mediaUrl(input.accountId, input.locationId), input.accessToken, fetchImpl, secrets, warnings);
    if (mediaPayload) {
      const parsed = parseMedia(mediaPayload);
      photoCount = parsed.photoCount;
      lastPhotoAt = parsed.lastPhotoAt;
      hasLogo = parsed.hasLogo;
      hasCover = parsed.hasCover;
      media = parsed.items;
    }
    const postPayload = await readOptional("Posts", postsUrl(input.accountId, input.locationId), input.accessToken, fetchImpl, secrets, warnings);
    if (postPayload) {
      const parsed = parsePosts(postPayload);
      postCount = parsed.postCount;
      lastPostAt = parsed.lastPostAt;
      posts = parsed.items;
    }
  } else {
    warnings.push("Reviews need a Business Profile account id.");
  }
  return {
    locationId: businessLocationId(input.locationId),
    accountId: businessAccountId(input.accountId),
    title: profile.title || `Location ${businessLocationId(input.locationId)}`,
    days,
    rating,
    reviewCount,
    unansweredReviews,
    missingInfo: profile.missing,
    warnings,
    keywords: keywordPayload ? parseKeywords(keywordPayload) : [],
    reviews,
    photoCount,
    lastPhotoAt,
    hasLogo,
    hasCover,
    media,
    postCount,
    lastPostAt,
    posts,
    attributes: attributePayload ? parseAttributes(attributePayload) : [],
    profile,
  };
}

export async function listReadableLocations(input: { accessToken: string; fetchImpl?: FetchLike; secrets?: string[] }) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const secrets = input.secrets ?? [];
  const accounts = parseAccounts(await businessGet(accountsUrl(), input.accessToken, fetchImpl, secrets));
  const locations: { accountId: string; locationId: string; profile: BusinessProfileFields }[] = [];
  for (const account of accounts) {
    const payload = await businessGet(accountLocationsUrl(account.accountId), input.accessToken, fetchImpl, secrets);
    for (const row of parseListedLocations(payload)) {
      if (!businessLocationId(row.locationId)) continue;
      locations.push({ accountId: account.accountId, locationId: row.locationId, profile: row.profile });
    }
  }
  return locations;
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

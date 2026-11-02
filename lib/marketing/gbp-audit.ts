import { addDaysISO } from "../time";

export const GBP_AUDIT_VERSION = "1";

export type AuditStatus = "pass" | "warn" | "fail";

export type AuditCheck = {
  id: string;
  label: string;
  weight: number;
  status: AuditStatus;
  earned: number;
  detail: string;
  fix: string;
};

export type GbpAuditResult = {
  version: string;
  score: number;
  checks: AuditCheck[];
};

export type AuditAddress = {
  street: string;
  city: string;
  region: string;
  postalCode: string;
};

export type AuditReview = {
  createTime: string;
  hasOwnerReply: boolean;
  replyTime: string | null;
};

export type WebsiteNap = {
  name: string;
  phone: string;
  street: string;
  city: string;
  region: string;
  postalCode: string;
};

export type GbpAuditInput = {
  now: Date;
  title: string;
  primaryCategory: string;
  additionalCategories: string[];
  regularHours: unknown;
  specialHours: unknown;
  description: string;
  services: { name: string }[];
  attributes: { answered: boolean }[];
  photoCount: number;
  lastPhotoAt: string | null;
  hasLogo: boolean;
  hasCover: boolean;
  postCount: number;
  lastPostAt: string | null;
  rating: number | null;
  reviews: AuditReview[];
  phone: string;
  address: AuditAddress;
  websiteHtml: string | null;
};

const WEIGHTS = {
  categories: 15,
  hours: 10,
  description: 10,
  services: 10,
  attributes: 5,
  photos: 10,
  posts: 10,
  reviews: 10,
  response: 15,
  nap: 5,
} as const;

function earned(weight: number, status: AuditStatus) {
  if (status === "pass") return weight;
  if (status === "fail") return 0;
  return Math.round(weight / 2);
}

function check(id: keyof typeof WEIGHTS, label: string, status: AuditStatus, detail: string, fix: string): AuditCheck {
  const weight = WEIGHTS[id];
  return { id, label, weight, status, earned: earned(weight, status), detail, fix };
}

function isoDay(year: number, month: number, day: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function nthWeekday(year: number, month: number, weekday: number, n: number) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const delta = (weekday - first.getUTCDay() + 7) % 7;
  return isoDay(year, month, 1 + delta + (n - 1) * 7);
}

function lastWeekday(year: number, month: number, weekday: number) {
  const last = new Date(Date.UTC(year, month, 0));
  const delta = (last.getUTCDay() - weekday + 7) % 7;
  return isoDay(year, month, last.getUTCDate() - delta);
}

export function usHolidays(year: number) {
  return [
    { date: isoDay(year, 1, 1), name: "New Year's Day" },
    { date: nthWeekday(year, 1, 1, 3), name: "Martin Luther King Jr. Day" },
    { date: nthWeekday(year, 2, 1, 3), name: "Presidents Day" },
    { date: lastWeekday(year, 5, 1), name: "Memorial Day" },
    { date: isoDay(year, 6, 19), name: "Juneteenth" },
    { date: isoDay(year, 7, 4), name: "Independence Day" },
    { date: nthWeekday(year, 9, 1, 1), name: "Labor Day" },
    { date: nthWeekday(year, 11, 4, 4), name: "Thanksgiving" },
    { date: isoDay(year, 12, 25), name: "Christmas" },
  ];
}

export function holidaysWithin(now: Date, days: number) {
  const start = now.toISOString().slice(0, 10);
  const end = addDaysISO(start, days);
  const years = new Set([Number(start.slice(0, 4)), Number(end.slice(0, 4))]);
  return [...years].flatMap((year) => usHolidays(year)).filter((holiday) => holiday.date >= start && holiday.date <= end);
}

function dateFromUnknown(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const row = value as { year?: number; month?: number; day?: number };
  if (!row.year || !row.month || !row.day) return "";
  return isoDay(row.year, row.month, row.day);
}

function specialDates(specialHours: unknown) {
  const periods = specialHours && typeof specialHours === "object" ? (specialHours as { specialHourPeriods?: unknown[] }).specialHourPeriods : [];
  const dates = new Set<string>();
  if (!Array.isArray(periods)) return dates;
  for (const period of periods) {
    if (!period || typeof period !== "object") continue;
    const start = dateFromUnknown((period as { startDate?: unknown }).startDate);
    if (start) dates.add(start);
  }
  return dates;
}

function regularHourCount(regularHours: unknown) {
  const periods = regularHours && typeof regularHours === "object" ? (regularHours as { periods?: unknown[] }).periods : [];
  return Array.isArray(periods) ? periods.length : 0;
}

function daysBefore(now: Date, iso: string | null) {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;
  return (now.getTime() - then) / 86_400_000;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function loose(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function readWebsiteNap(html: string | null | undefined): WebsiteNap | null {
  if (!html) return null;
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block[1] || "");
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const item = row as { name?: string; telephone?: string; address?: { streetAddress?: string; addressLocality?: string; addressRegion?: string; postalCode?: string } };
        const name = String(item.name || "").trim();
        const phone = String(item.telephone || "").trim();
        const address = item.address && typeof item.address === "object" ? item.address : {};
        if (!name && !phone) continue;
        return {
          name,
          phone,
          street: String(address.streetAddress || "").trim(),
          city: String(address.addressLocality || "").trim(),
          region: String(address.addressRegion || "").trim(),
          postalCode: String(address.postalCode || "").trim(),
        };
      }
    } catch {
      continue;
    }
  }
  return null;
}

function namesMatch(left: string, right: string) {
  const a = loose(left);
  const b = loose(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function phonesMatch(left: string, right: string) {
  const a = digits(left);
  const b = digits(right);
  if (a.length < 10 || b.length < 10) return false;
  return a.slice(-10) === b.slice(-10);
}

function addressesMatch(profile: AuditAddress, site: WebsiteNap) {
  const street = loose(profile.street);
  const city = loose(profile.city);
  const postal = digits(profile.postalCode);
  const siteStreet = loose(site.street);
  const siteCity = loose(site.city);
  const sitePostal = digits(site.postalCode);
  if (!street || !city || !postal) return false;
  const streetOk = siteStreet.includes(street) || street.includes(siteStreet);
  return streetOk && siteCity === city && sitePostal === postal;
}

export function scoreBusinessProfile(input: GbpAuditInput): GbpAuditResult {
  const checks: AuditCheck[] = [
    scoreCategories(input),
    scoreHours(input),
    scoreDescription(input),
    scoreServices(input),
    scoreAttributes(input),
    scorePhotos(input),
    scorePosts(input),
    scoreReviewVelocity(input),
    scoreReviewResponse(input),
    scoreNap(input),
  ];
  const score = Math.max(0, Math.min(100, checks.reduce((sum, item) => sum + item.earned, 0)));
  return { version: GBP_AUDIT_VERSION, score, checks };
}

function scoreCategories(input: GbpAuditInput) {
  const fix = "Choose a primary category and add at least one related category.";
  if (!input.primaryCategory.trim()) return check("categories", "Categories", "fail", "No primary category is set.", fix);
  if (input.additionalCategories.filter((item) => item.trim()).length >= 1) {
    return check("categories", "Categories", "pass", `Primary category is ${input.primaryCategory}, with ${input.additionalCategories.length} more.`, fix);
  }
  return check("categories", "Categories", "warn", `Primary category is ${input.primaryCategory}. A related category is still missing.`, fix);
}

function scoreHours(input: GbpAuditInput) {
  const fix = "Add weekly hours, and add special hours for holidays in the next 60 days.";
  if (regularHourCount(input.regularHours) === 0) return check("hours", "Hours", "fail", "Weekly hours are missing.", fix);
  const holidays = holidaysWithin(input.now, 60);
  if (!holidays.length) return check("hours", "Hours", "pass", "Weekly hours are set. No holiday falls in the next 60 days.", fix);
  const covered = specialDates(input.specialHours);
  const missing = holidays.filter((holiday) => !covered.has(holiday.date));
  if (!missing.length) return check("hours", "Hours", "pass", "Weekly hours are set, and special hours cover the holidays in the next 60 days.", fix);
  return check("hours", "Hours", "warn", `Weekly hours are set. Special hours are still missing for ${missing.map((holiday) => holiday.name).join(", ")}.`, fix);
}

function scoreDescription(input: GbpAuditInput) {
  const fix = "Write 250 to 750 characters that name a service and the city.";
  const text = input.description.trim();
  if (!text) return check("description", "Description", "fail", "The description is empty.", fix);
  const lower = text.toLowerCase();
  const serviceHit = input.services.some((service) => service.name.trim().length > 3 && lower.includes(service.name.trim().toLowerCase())) || (input.primaryCategory.trim() && lower.includes(input.primaryCategory.trim().toLowerCase()));
  const city = input.address.city.trim().toLowerCase();
  const cityHit = Boolean(city) && lower.includes(city);
  const lengthOk = text.length >= 250 && text.length <= 750;
  if (lengthOk && serviceHit && cityHit) return check("description", "Description", "pass", `The description is ${text.length} characters and names a service and the city.`, fix);
  const gaps = [lengthOk ? "" : "length", serviceHit ? "" : "a service", cityHit ? "" : "the city"].filter(Boolean);
  return check("description", "Description", "warn", `The description is ${text.length} characters. It still needs ${gaps.join(" and ")}.`, fix);
}

function scoreServices(input: GbpAuditInput) {
  const fix = "List at least five services.";
  const count = input.services.filter((service) => service.name.trim()).length;
  if (count >= 5) return check("services", "Services", "pass", `${count} services are listed.`, fix);
  if (count > 0) return check("services", "Services", "warn", `${count} services are listed. Five is the mark used here.`, fix);
  return check("services", "Services", "fail", "No services are listed.", fix);
}

function scoreAttributes(input: GbpAuditInput) {
  const fix = "Answer the main attributes, such as accessibility and payment options.";
  const answered = input.attributes.filter((attribute) => attribute.answered).length;
  if (answered >= 3) return check("attributes", "Attributes", "pass", `${answered} attributes are answered.`, fix);
  if (answered > 0) return check("attributes", "Attributes", "warn", `${answered} ${answered === 1 ? "attribute is" : "attributes are"} answered. Three is the mark used here.`, fix);
  return check("attributes", "Attributes", "fail", "No attributes are answered.", fix);
}

function scorePhotos(input: GbpAuditInput) {
  const fix = "Add at least 10 photos, including a logo and a cover, and add one from the last 30 days.";
  const age = daysBefore(input.now, input.lastPhotoAt);
  const recent = age != null && age <= 30;
  const enough = input.photoCount >= 10;
  const marks = input.hasLogo && input.hasCover;
  if (enough && recent && marks) return check("photos", "Photos", "pass", `${input.photoCount} photos, including a logo and a cover, with one from the last 30 days.`, fix);
  if (input.photoCount === 0) return check("photos", "Photos", "fail", "No photos are on the listing.", fix);
  const gaps = [enough ? "" : "at least 10 photos", recent ? "" : "a photo from the last 30 days", input.hasLogo ? "" : "a logo", input.hasCover ? "" : "a cover"].filter(Boolean);
  return check("photos", "Photos", "warn", `${input.photoCount} photos. Still needed: ${gaps.join(", ")}.`, fix);
}

function scorePosts(input: GbpAuditInput) {
  const fix = "Publish a post every 7 to 14 days.";
  const age = daysBefore(input.now, input.lastPostAt);
  if (age != null && age <= 14) return check("posts", "Post cadence", "pass", `The latest post is ${Math.floor(age)} days old.`, fix);
  if (age != null && age <= 30) return check("posts", "Post cadence", "warn", `The latest post is ${Math.floor(age)} days old. A post every 7 to 14 days keeps the listing current.`, fix);
  if (input.postCount === 0 || age == null) return check("posts", "Post cadence", "fail", "No post date is on the listing.", fix);
  return check("posts", "Post cadence", "fail", `The latest post is ${Math.floor(age)} days old.`, fix);
}

function scoreReviewVelocity(input: GbpAuditInput) {
  const fix = "Aim for a rating of 4.3 or higher and at least two new reviews this month.";
  const fresh = input.reviews.filter((review) => {
    const age = daysBefore(input.now, review.createTime);
    return age != null && age <= 30;
  }).length;
  const ratingOk = input.rating != null && input.rating >= 4.3;
  const velocityOk = fresh >= 2;
  if (ratingOk && velocityOk) return check("reviews", "Review rating and velocity", "pass", `Rating ${input.rating?.toFixed(1)} with ${fresh} new reviews in 30 days.`, fix);
  if (ratingOk || velocityOk) {
    return check("reviews", "Review rating and velocity", "warn", `Rating ${input.rating == null ? "is missing" : input.rating.toFixed(1)}. ${fresh} new reviews in 30 days.`, fix);
  }
  return check("reviews", "Review rating and velocity", "fail", `Rating ${input.rating == null ? "is missing" : input.rating.toFixed(1)}. ${fresh} new reviews in 30 days.`, fix);
}

function scoreReviewResponse(input: GbpAuditInput) {
  const fix = "Reply to at least 90 percent of reviews, most of them within 48 hours.";
  if (!input.reviews.length) return check("response", "Review responses", "warn", "There are no reviews to reply to yet.", fix);
  const replied = input.reviews.filter((review) => review.hasOwnerReply);
  const rate = replied.length / input.reviews.length;
  const hours = replied.flatMap((review) => {
    if (!review.replyTime || !review.createTime) return [];
    const value = (Date.parse(review.replyTime) - Date.parse(review.createTime)) / 3_600_000;
    return Number.isFinite(value) && value >= 0 ? [value] : [];
  });
  const typical = median(hours);
  const fast = typical != null && typical < 48;
  const detail = `${replied.length} of ${input.reviews.length} reviews have a reply${typical == null ? "" : `. Typical reply time is ${Math.round(typical)} hours`}.`;
  if (rate >= 0.9 && fast) return check("response", "Review responses", "pass", detail, fix);
  if (rate >= 0.5 || (rate >= 0.9 && !fast)) return check("response", "Review responses", "warn", detail, fix);
  return check("response", "Review responses", "fail", detail, fix);
}

function scoreNap(input: GbpAuditInput) {
  const fix = "Make the name, address, and phone on the website match the Google listing.";
  const site = readWebsiteNap(input.websiteHtml);
  if (!site) return check("nap", "Name, address, and phone", "warn", "The website name, address, and phone have not been read yet.", fix);
  const name = namesMatch(input.title, site.name);
  const phone = phonesMatch(input.phone, site.phone);
  const address = addressesMatch(input.address, site);
  const hits = [name, phone, address].filter(Boolean).length;
  const detail = `Name ${name ? "matches" : "differs"}. Phone ${phone ? "matches" : "differs"}. Address ${address ? "matches" : "differs"}.`;
  if (hits === 3) return check("nap", "Name, address, and phone", "pass", detail, fix);
  if (hits === 2) return check("nap", "Name, address, and phone", "warn", detail, fix);
  return check("nap", "Name, address, and phone", "fail", detail, fix);
}

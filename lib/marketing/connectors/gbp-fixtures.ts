import { addDaysISO } from "../../time";
import { hashReviewerName, type BusinessProfileReport } from "./gbp-client";
import { holidaysWithin, type GbpAuditInput } from "../gbp-audit";

export const GBP_FIXTURE_CLIENTS = [
  { id: "harbor", name: "Harbor Dental", phone: "5550102100", website: "https://harbordental.example" },
  { id: "gulf", name: "Gulf Pest", phone: "5550102200", website: "https://gulfpest.example" },
  { id: "north", name: "Northline Supply", phone: "5550102300", website: "https://northlinesupply.example" },
] as const;

export type GbpFixture = {
  accountId: string;
  locationId: string;
  clientHint: string;
  websiteHtml: string | null;
  report: BusinessProfileReport;
  audit: GbpAuditInput;
};

const HARBOR_DESCRIPTION = [
  "Harbor Dental welcomes Savannah neighbors for cleanings, fillings, crowns, and gentle family visits.",
  "The office on Broughton Street is the place to book a checkup, ask about a crown, or bring a child for a first visit.",
  "The team helps you find a time that fits the week, and the listing hours stay current so you know when the door is open.",
  "New patients can start with a cleaning and a short conversation about what they want to change.",
].join(" ");

function at(now: Date, daysAgo: number) {
  return new Date(now.getTime() - daysAgo * 86_400_000).toISOString();
}

function day(now: Date, daysAgo: number) {
  return addDaysISO(now.toISOString().slice(0, 10), -daysAgo);
}

function hoursFor() {
  return {
    periods: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"].map((openDay) => ({ openDay, closeDay: openDay })),
  };
}

function specialFor(now: Date) {
  return {
    specialHourPeriods: holidaysWithin(now, 60).map((holiday) => {
      const [year, month, date] = holiday.date.split("-").map(Number);
      return { startDate: { year, month, day: date }, closed: true };
    }),
  };
}

function review(id: string, daysAgo: number, stars: number, replied: boolean, now: Date) {
  const createTime = at(now, daysAgo);
  const replyTime = replied ? new Date(Date.parse(createTime) + 20 * 3_600_000).toISOString() : "";
  return {
    reviewId: id,
    starRating: stars,
    comment: "",
    createTime,
    updateTime: createTime,
    reviewerNameHash: hashReviewerName(`fixture reviewer ${id}`),
    hasOwnerReply: replied,
    replyTime,
    replyText: replied ? "Thank you for visiting." : "",
  };
}

function website(name: string, phone: string, street: string, city: string, region: string, postal: string) {
  const payload = JSON.stringify({
    "@type": "LocalBusiness",
    name,
    telephone: phone,
    address: { "@type": "PostalAddress", streetAddress: street, addressLocality: city, addressRegion: region, postalCode: postal },
  });
  return `<html><body><script type="application/ld+json">${payload}</script><footer>${name} · ${street}, ${city}, ${region} ${postal} · ${phone}</footer></body></html>`;
}

function metrics(now: Date, seed: { calls: number; directions: number; clicks: number; bookings: number; search: number; maps: number }) {
  return [6, 5, 4, 3, 2, 1, 0].map((ago, index) => ({
    date: day(now, ago),
    views: seed.search + seed.maps + index,
    searches: seed.search + index,
    calls: seed.calls,
    directionRequests: seed.directions,
    websiteClicks: seed.clicks,
    searchDesktop: Math.round((seed.search + index) * 0.4),
    searchMobile: (seed.search + index) - Math.round((seed.search + index) * 0.4),
    mapsDesktop: Math.round(seed.maps * 0.25),
    mapsMobile: seed.maps - Math.round(seed.maps * 0.25),
    bookings: seed.bookings,
    conversations: index === 0 ? 1 : 0,
    foodOrders: 0,
  }));
}

export function gbpFixtures(now = new Date("2026-11-02T15:00:00.000Z")): GbpFixture[] {
  const harborReviews = [
    review("h1", 4, 5, false, now),
    review("h2", 9, 5, false, now),
    review("h3", 12, 4, true, now),
    review("h4", 40, 5, true, now),
    review("h5", 48, 5, true, now),
    review("h6", 55, 4, true, now),
    review("h7", 60, 5, true, now),
    review("h8", 70, 5, true, now),
    review("h9", 75, 4, true, now),
    review("h10", 80, 5, true, now),
  ];
  const harborAddress = { street: "18 Broughton Street", city: "Savannah", region: "GA", postalCode: "31401", lines: ["18 Broughton Street"] };
  const harborServices = ["Cleaning", "Filling", "Crown", "Whitening", "Child visit"].map((name) => ({ name }));
  const harborProfile = {
    title: "Harbor Dental",
    phone: "(555) 010-2100",
    websiteUri: "https://harbordental.example",
    description: HARBOR_DESCRIPTION,
    primaryCategory: "Dentist",
    additionalCategories: ["Cosmetic dentist"],
    address: harborAddress,
    regularHours: hoursFor(),
    specialHours: specialFor(now),
    services: harborServices,
    verificationState: "verified",
    missing: [] as string[],
  };
  const gulfAddress = { street: "4 Government Street", city: "Mobile", region: "AL", postalCode: "36602", lines: ["4 Government Street"] };
  const northAddress = { street: "90 King Street", city: "Charleston", region: "SC", postalCode: "29401", lines: ["90 King Street"] };
  return [
    {
      accountId: "1001",
      locationId: "501",
      clientHint: "harbor",
      websiteHtml: website("Harbor Dental", "(555) 010-2100", harborAddress.street, harborAddress.city, harborAddress.region, harborAddress.postalCode),
      report: {
        locationId: "501",
        accountId: "1001",
        title: "Harbor Dental",
        days: metrics(now, { calls: 3, directions: 4, clicks: 6, bookings: 1, search: 40, maps: 18 }),
        rating: 4.6,
        reviewCount: harborReviews.length,
        unansweredReviews: harborReviews.filter((item) => !item.hasOwnerReply).length,
        missingInfo: [],
        warnings: [],
        keywords: [
          { keyword: "dentist savannah", impressions: 240, threshold: "" },
          { keyword: "teeth cleaning savannah", impressions: 96, threshold: "" },
          { keyword: "emergency dentist", impressions: null, threshold: "15" },
        ],
        reviews: harborReviews,
        photoCount: 12,
        lastPhotoAt: at(now, 10),
        hasLogo: true,
        hasCover: true,
        media: [
          { id: "logo", type: "PHOTO", category: "LOGO", createTime: at(now, 40) },
          { id: "cover", type: "PHOTO", category: "COVER", createTime: at(now, 30) },
          { id: "chair", type: "PHOTO", category: "ADDITIONAL", createTime: at(now, 10) },
        ],
        postCount: 4,
        lastPostAt: at(now, 20),
        posts: [{ id: "post-1", type: "STANDARD", state: "LIVE", createTime: at(now, 20) }],
        attributes: [
          { name: "attributes/has_wheelchair_accessible_entrance", answered: false },
          { name: "attributes/pay_credit_card", answered: false },
        ],
        profile: harborProfile,
      },
      audit: {
        now,
        title: "Harbor Dental",
        primaryCategory: "Dentist",
        additionalCategories: ["Cosmetic dentist"],
        regularHours: harborProfile.regularHours,
        specialHours: harborProfile.specialHours,
        description: HARBOR_DESCRIPTION,
        services: harborServices,
        attributes: [{ answered: false }, { answered: false }],
        photoCount: 12,
        lastPhotoAt: at(now, 10),
        hasLogo: true,
        hasCover: true,
        postCount: 4,
        lastPostAt: at(now, 20),
        rating: 4.6,
        reviews: harborReviews.map((item) => ({ createTime: item.createTime, hasOwnerReply: item.hasOwnerReply, replyTime: item.replyTime || null })),
        phone: "(555) 010-2100",
        address: harborAddress,
        websiteHtml: website("Harbor Dental", "(555) 010-2100", harborAddress.street, harborAddress.city, harborAddress.region, harborAddress.postalCode),
      },
    },
    {
      accountId: "1001",
      locationId: "502",
      clientHint: "gulf",
      websiteHtml: website("Gulf Pest", "(555) 010-2200", gulfAddress.street, gulfAddress.city, gulfAddress.region, gulfAddress.postalCode),
      report: {
        locationId: "502",
        accountId: "1001",
        title: "Gulf Pest Control",
        days: metrics(now, { calls: 2, directions: 1, clicks: 2, bookings: 0, search: 12, maps: 9 }),
        rating: 4.8,
        reviewCount: 2,
        unansweredReviews: 2,
        missingInfo: ["hours", "description"],
        warnings: [],
        keywords: [{ keyword: "pest control mobile", impressions: 30, threshold: "" }],
        reviews: [review("g1", 3, 5, false, now), review("g2", 6, 5, false, now)],
        photoCount: 4,
        lastPhotoAt: at(now, 50),
        hasLogo: true,
        hasCover: false,
        media: [{ id: "logo", type: "PHOTO", category: "LOGO", createTime: at(now, 50) }],
        postCount: 0,
        lastPostAt: null,
        posts: [],
        attributes: [{ name: "attributes/has_wheelchair_accessible_entrance", answered: true }],
        profile: {
          title: "Gulf Pest Control",
          phone: "(555) 010-2200",
          websiteUri: "https://gulfpest.example",
          description: "Pest control in Mobile.",
          primaryCategory: "Pest control service",
          additionalCategories: [],
          address: gulfAddress,
          regularHours: {},
          specialHours: {},
          services: ["Ants", "Termites"].map((name) => ({ name })),
          verificationState: "verified",
          missing: ["hours", "description"],
        },
      },
      audit: {
        now,
        title: "Gulf Pest Control",
        primaryCategory: "Pest control service",
        additionalCategories: [],
        regularHours: {},
        specialHours: {},
        description: "Pest control in Mobile.",
        services: [{ name: "Ants" }, { name: "Termites" }],
        attributes: [{ answered: true }],
        photoCount: 4,
        lastPhotoAt: at(now, 50),
        hasLogo: true,
        hasCover: false,
        postCount: 0,
        lastPostAt: null,
        rating: 4.8,
        reviews: [
          { createTime: at(now, 3), hasOwnerReply: false, replyTime: null },
          { createTime: at(now, 6), hasOwnerReply: false, replyTime: null },
        ],
        phone: "(555) 010-2200",
        address: gulfAddress,
        websiteHtml: website("Gulf Pest", "(555) 010-2200", gulfAddress.street, gulfAddress.city, gulfAddress.region, gulfAddress.postalCode),
      },
    },
    {
      accountId: "1001",
      locationId: "503",
      clientHint: "",
      websiteHtml: website("Northline Roofing", "(555) 010-9999", "1 Other Road", "Charleston", "SC", "29403"),
      report: {
        locationId: "503",
        accountId: "1001",
        title: "Northline Roofing",
        days: metrics(now, { calls: 1, directions: 1, clicks: 1, bookings: 0, search: 8, maps: 5 }),
        rating: 3.2,
        reviewCount: 1,
        unansweredReviews: 1,
        missingInfo: ["category"],
        warnings: [],
        keywords: [],
        reviews: [review("n1", 70, 3, false, now)],
        photoCount: 0,
        lastPhotoAt: null,
        hasLogo: false,
        hasCover: false,
        media: [],
        postCount: 0,
        lastPostAt: null,
        posts: [],
        attributes: [],
        profile: {
          title: "Northline Roofing",
          phone: "(555) 010-2400",
          websiteUri: "https://northlineroofing.example",
          description: "",
          primaryCategory: "",
          additionalCategories: [],
          address: northAddress,
          regularHours: hoursFor(),
          specialHours: {},
          services: [],
          verificationState: "listed",
          missing: ["category", "description"],
        },
      },
      audit: {
        now,
        title: "Northline Roofing",
        primaryCategory: "",
        additionalCategories: [],
        regularHours: hoursFor(),
        specialHours: {},
        description: "",
        services: [],
        attributes: [],
        photoCount: 0,
        lastPhotoAt: null,
        hasLogo: false,
        hasCover: false,
        postCount: 0,
        lastPostAt: null,
        rating: 3.2,
        reviews: [{ createTime: at(now, 70), hasOwnerReply: false, replyTime: null }],
        phone: "(555) 010-2400",
        address: northAddress,
        websiteHtml: website("Northline Roofing", "(555) 010-9999", "1 Other Road", "Charleston", "SC", "29403"),
      },
    },
  ];
}

export function fixtureByLocation(locationId: string, now?: Date) {
  return gbpFixtures(now).find((row) => row.locationId === locationId) ?? null;
}

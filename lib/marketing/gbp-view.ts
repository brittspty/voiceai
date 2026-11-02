import { omitForbiddenClientFields } from "./client-view";
import { stripForAudience, type CostAudience } from "./channels/cost-strip";
import { gbpFixtures } from "./connectors/gbp-fixtures";
import { scoreBusinessProfile, type AuditCheck } from "./gbp-audit";
import { GBP_MANAGER_EMAIL, BUSINESS_PROFILE_SCOPE } from "./gbp-scope";
import {
  applyGbpAssignment,
  assignedClientId,
  defaultGbpClients,
  fixturesForClient,
  locationChoices,
  readGbpAssignments,
  suggestGbpClient,
  type GbpClientChoice,
  type GbpLocationChoice,
} from "./gbp-mapping";

export type GbpAudience = "staff" | "client" | "share" | "plan";

export type GbpCheckView = {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  fix: string;
  weight: number;
  earned: number;
};

export type GbpClientView = {
  audience: GbpAudience;
  exampleData: boolean;
  clientId: string;
  clientName: string;
  locationTitle: string;
  status: string;
  periodLabel: string;
  calls: number;
  directionRequests: number;
  websiteClicks: number;
  bookings: number;
  searchImpressions: number;
  mapsImpressions: number;
  searchDesktop: number;
  searchMobile: number;
  mapsDesktop: number;
  mapsMobile: number;
  keywords: { keyword: string; label: string }[];
  rating: number | null;
  reviewCount: number;
  newReviews: number;
  responseLabel: string;
  reviews: { date: string; stars: number; replied: string; replyDate: string }[];
  score: number;
  checks: GbpCheckView[];
  empty: boolean;
};

export type GbpSetupLocation = GbpLocationChoice & {
  suggestion: string;
  suggestedClientId: string;
  assignedClientId: string;
  assignedClientName: string;
};

export type GbpSetupView = {
  managerEmail: string;
  scopeLabel: string;
  status: "needs_setup" | "connected";
  exampleData: boolean;
  instructions: string;
  readOnlyNote: string;
  locations: GbpSetupLocation[];
  clients: { id: string; name: string }[];
};

function sum(rows: { calls: number; directionRequests: number; websiteClicks: number; bookings: number; searchDesktop: number; searchMobile: number; mapsDesktop: number; mapsMobile: number }[]) {
  return rows.reduce(
    (total, row) => ({
      calls: total.calls + row.calls,
      directionRequests: total.directionRequests + row.directionRequests,
      websiteClicks: total.websiteClicks + row.websiteClicks,
      bookings: total.bookings + row.bookings,
      searchDesktop: total.searchDesktop + row.searchDesktop,
      searchMobile: total.searchMobile + row.searchMobile,
      mapsDesktop: total.mapsDesktop + row.mapsDesktop,
      mapsMobile: total.mapsMobile + row.mapsMobile,
    }),
    { calls: 0, directionRequests: 0, websiteClicks: 0, bookings: 0, searchDesktop: 0, searchMobile: 0, mapsDesktop: 0, mapsMobile: 0 },
  );
}

function keywordLabel(row: { impressions: number | null; threshold: string }) {
  if (row.impressions != null) return String(row.impressions);
  if (row.threshold) return `Under ${row.threshold}`;
  return "Hidden";
}

function checkView(check: AuditCheck): GbpCheckView {
  return { id: check.id, label: check.label, status: check.status, detail: check.detail, fix: check.fix, weight: check.weight, earned: check.earned };
}

function emptyView(audience: GbpAudience, clientId: string, clientName: string): GbpClientView {
  return {
    audience,
    exampleData: true,
    clientId,
    clientName,
    locationTitle: "",
    status: "needs_setup",
    periodLabel: "Last 7 days",
    calls: 0,
    directionRequests: 0,
    websiteClicks: 0,
    bookings: 0,
    searchImpressions: 0,
    mapsImpressions: 0,
    searchDesktop: 0,
    searchMobile: 0,
    mapsDesktop: 0,
    mapsMobile: 0,
    keywords: [],
    rating: null,
    reviewCount: 0,
    newReviews: 0,
    responseLabel: "No reviews yet",
    reviews: [],
    score: 0,
    checks: [],
    empty: true,
  };
}

export function buildGbpClientView(input: { clientId: string; audience: GbpAudience; now?: Date; assignments?: Record<string, string> }): GbpClientView {
  const now = input.now ?? new Date("2026-11-02T15:00:00.000Z");
  const assignments = input.assignments ?? readGbpAssignments();
  const client = defaultGbpClients().find((row) => row.id === input.clientId);
  const clientName = client?.name || "This client";
  const rows = fixturesForClient(input.clientId, assignments, now);
  const primary = rows[0];
  if (!primary) return emptyView(input.audience, input.clientId, clientName);
  const totals = sum(primary.report.days);
  const audit = scoreBusinessProfile(primary.audit);
  const fresh = primary.audit.reviews.filter((review) => {
    const then = Date.parse(review.createTime);
    return Number.isFinite(then) && now.getTime() - then <= 30 * 86_400_000;
  }).length;
  const replied = primary.report.reviews.filter((review) => review.hasOwnerReply).length;
  return {
    audience: input.audience,
    exampleData: true,
    clientId: input.clientId,
    clientName,
    locationTitle: primary.report.title,
    status: "connected",
    periodLabel: "Last 7 days",
    calls: totals.calls,
    directionRequests: totals.directionRequests,
    websiteClicks: totals.websiteClicks,
    bookings: totals.bookings,
    searchImpressions: totals.searchDesktop + totals.searchMobile,
    mapsImpressions: totals.mapsDesktop + totals.mapsMobile,
    searchDesktop: totals.searchDesktop,
    searchMobile: totals.searchMobile,
    mapsDesktop: totals.mapsDesktop,
    mapsMobile: totals.mapsMobile,
    keywords: primary.report.keywords.map((row) => ({ keyword: row.keyword, label: keywordLabel(row) })),
    rating: primary.report.rating,
    reviewCount: primary.report.reviewCount,
    newReviews: fresh,
    responseLabel: primary.report.reviewCount ? `${replied} of ${primary.report.reviewCount} reviews have a reply` : "No reviews yet",
    reviews: primary.report.reviews.slice(0, 8).map((review) => ({
      date: review.createTime.slice(0, 10),
      stars: review.starRating,
      replied: review.hasOwnerReply ? "Yes" : "No",
      replyDate: review.replyTime ? review.replyTime.slice(0, 10) : "",
    })),
    score: audit.score,
    checks: audit.checks.map(checkView),
    empty: false,
  };
}

export function gbpPayloadForAudience<T>(value: T, audience: GbpAudience): T {
  if (audience === "staff") return omitForbiddenClientFields(value);
  const costAudience: CostAudience = audience === "client" ? "client" : "share";
  return omitForbiddenClientFields(stripForAudience(value, costAudience));
}

export function presentGbpClient(input: { clientId: string; audience: GbpAudience; now?: Date; assignments?: Record<string, string> }) {
  return gbpPayloadForAudience(buildGbpClientView(input), input.audience);
}

export function buildGbpSetup(input: { now?: Date; assignments?: Record<string, string>; clients?: readonly GbpClientChoice[] } = {}): GbpSetupView {
  const now = input.now ?? new Date("2026-11-02T15:00:00.000Z");
  const clients = input.clients ? [...input.clients] : defaultGbpClients();
  const assignments = input.assignments ?? readGbpAssignments();
  const locations = locationChoices(now).map((location) => {
    const suggestion = suggestGbpClient(location, clients);
    const assigned = assignedClientId(assignments, location.locationId);
    const assignedClient = clients.find((client) => client.id === assigned);
    return {
      ...location,
      suggestion: suggestion?.reason || "No suggested client. Choose one yourself.",
      suggestedClientId: suggestion?.clientId || "",
      assignedClientId: assigned,
      assignedClientName: assignedClient?.name || "",
    };
  });
  const pending = locations.some((location) => !location.assignedClientId);
  return {
    managerEmail: GBP_MANAGER_EMAIL,
    scopeLabel: BUSINESS_PROFILE_SCOPE,
    status: pending ? "needs_setup" : "connected",
    exampleData: true,
    instructions: `Add ${GBP_MANAGER_EMAIL} as a Manager on the Google Business Profile. JAI lists the locations that account can see. It does not accept the invite.`,
    readOnlyNote: "Reads stay on. Reply, post, and profile edits are refused in code.",
    locations,
    clients: clients.map((client) => ({ id: client.id, name: client.name })),
  };
}

export function assignFromSetup(input: { locationId: string; marketingClientId: string; assignments?: Record<string, string>; now?: Date }) {
  const setup = buildGbpSetup({ now: input.now, assignments: input.assignments });
  return applyGbpAssignment({
    locations: setup.locations,
    clients: setup.clients,
    assignments: input.assignments ?? readGbpAssignments(),
    locationId: input.locationId,
    marketingClientId: input.marketingClientId,
  });
}

export function canManageGbp(kind: string) {
  return kind === "super_admin" || kind === "account_manager" || kind === "staff";
}

export function canViewGbp(kind: string) {
  return kind === "super_admin" || kind === "account_manager" || kind === "staff" || kind === "all_clients_viewer" || kind === "client_owner" || kind === "client_viewer";
}

export function gbpPdfLines(view: GbpClientView) {
  const lines = [
    "Google Business Profile",
    view.exampleData ? "EXAMPLE DATA" : "",
    view.clientName,
    view.locationTitle || "No location assigned",
    view.periodLabel,
    `Calls ${view.calls}`,
    `Direction requests ${view.directionRequests}`,
    `Website clicks ${view.websiteClicks}`,
    `Bookings ${view.bookings}`,
    `Search impressions ${view.searchImpressions}`,
    `Maps impressions ${view.mapsImpressions}`,
    `Audit score ${view.score}`,
  ];
  for (const row of view.keywords) lines.push(`${row.keyword} ${row.label}`);
  for (const check of view.checks) lines.push(`${check.label} ${check.status}`, check.detail, check.fix);
  return lines.filter((line) => line.trim());
}

export function gbpViewHasReviewerName(view: GbpClientView, plainName: string) {
  return JSON.stringify(view).toLowerCase().includes(plainName.trim().toLowerCase());
}

export function allFixtureLocations(now?: Date) {
  return gbpFixtures(now).map((row) => row.locationId);
}

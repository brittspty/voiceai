import assert from "node:assert/strict";
import test from "node:test";
import { gbpFixtures } from "./connectors/gbp-fixtures";
import { GBP_AUDIT_VERSION, readWebsiteNap, scoreBusinessProfile, type GbpAuditInput } from "./gbp-audit";

const NOW = new Date("2026-11-02T15:00:00.000Z");

function input(patch: Partial<GbpAuditInput> = {}): GbpAuditInput {
  return {
    now: NOW,
    title: "Harbor Dental",
    primaryCategory: "Dentist",
    additionalCategories: ["Cosmetic dentist"],
    regularHours: { periods: [{ openDay: "MONDAY" }] },
    specialHours: {
      specialHourPeriods: [
        { startDate: { year: 2026, month: 11, day: 26 }, closed: true },
        { startDate: { year: 2026, month: 12, day: 25 }, closed: true },
        { startDate: { year: 2027, month: 1, day: 1 }, closed: true },
      ],
    },
    description: "x".repeat(250),
    services: ["Cleaning", "Filling", "Crown", "Whitening", "Visit"].map((name) => ({ name })),
    attributes: [{ answered: true }, { answered: true }, { answered: true }],
    photoCount: 12,
    lastPhotoAt: "2026-10-20T15:00:00.000Z",
    hasLogo: true,
    hasCover: true,
    postCount: 2,
    lastPostAt: "2026-10-25T15:00:00.000Z",
    rating: 4.6,
    reviews: [
      { createTime: "2026-10-20T15:00:00.000Z", hasOwnerReply: true, replyTime: "2026-10-21T15:00:00.000Z" },
      { createTime: "2026-10-18T15:00:00.000Z", hasOwnerReply: true, replyTime: "2026-10-19T15:00:00.000Z" },
    ],
    phone: "(555) 010-2100",
    address: { street: "18 Broughton Street", city: "Savannah", region: "GA", postalCode: "31401" },
    websiteHtml: null,
    ...patch,
  };
}

test("a complete fictional profile scores 100 and a blank profile scores 0", () => {
  const blank = scoreBusinessProfile(input({
    primaryCategory: "",
    additionalCategories: [],
    regularHours: {},
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
    rating: null,
    reviews: [],
    phone: "",
    address: { street: "", city: "", region: "", postalCode: "" },
    websiteHtml: null,
  }));
  assert.equal(blank.version, GBP_AUDIT_VERSION);
  assert.equal(blank.checks.length, 10);
  assert.equal(blank.checks.reduce((sum, check) => sum + check.weight, 0), 100);
  assert.equal(blank.score, blank.checks.reduce((sum, check) => sum + check.earned, 0));
  assert.ok(blank.score < 20);
  const full = scoreBusinessProfile(input({
    description: `${"Savannah family Cleaning Filling Crown Whitening Visit. ".repeat(8)}`,
    websiteHtml: `<script type="application/ld+json">{"@type":"LocalBusiness","name":"Harbor Dental","telephone":"5550102100","address":{"streetAddress":"18 Broughton Street","addressLocality":"Savannah","addressRegion":"GA","postalCode":"31401"}}</script>`,
  }));
  assert.equal(full.score, 100);
  assert.ok(full.checks.every((check) => check.status === "pass"));
  for (const check of full.checks) assert.match(check.fix, /\w/);
});

test("harbor fixture shows pass, warn, and fail without review text", () => {
  const harbor = gbpFixtures(NOW)[0];
  assert.ok(harbor);
  const audit = scoreBusinessProfile(harbor.audit);
  const statuses = new Set(audit.checks.map((check) => check.status));
  assert.equal(statuses.has("pass"), true);
  assert.equal(statuses.has("warn"), true);
  assert.equal(statuses.has("fail"), true);
  assert.equal(audit.score, 83);
  assert.equal(JSON.stringify(harbor.report.reviews).includes("Kind words"), false);
  const site = readWebsiteNap(harbor.websiteHtml);
  assert.equal(site?.name, "Harbor Dental");
  assert.equal(site?.city, "Savannah");
});

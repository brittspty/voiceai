import React from "react";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DemoScreens } from "../../components/demo-screens";
import { homepageModel, homepageProse } from "../homepage-content";
import { moneyText } from "../marketing/spend-access";
import { buildDemoDataset, DEMO_FACTS, DEMO_LIST, DEMO_STALE_LIST } from "./dataset";
import { presentDemo } from "./present";
import { demoBudgetAttempt, demoChannels, demoVendorChecks, demoVerifiedGap, PROBLEM_STATS } from "./story";
import { renderTourSteps } from "./tour";

const BANNED = /totaligent|pmax|performance max|advantage\+|madgicx|smartly|albert\.ai|agencyanalytics|trade desk|tradedesk|typical agency|diy ad platform|vs\.? agencies/i;

const COPY_FILES = [
  "lib/homepage-content.ts",
  "lib/homepage-quiz.ts",
  "lib/demo/story.ts",
  "lib/demo/tour.ts",
  "lib/demo/dataset.ts",
  "components/demo-screens.tsx",
  "components/demo-story-screens.tsx",
  "components/demo-budget-moment.tsx",
  "components/public-homepage.tsx",
  "lib/agency-waitlist.ts",
  "docs/demo-script.md",
];

test("new demo screens use the product rules and stay labeled", () => {
  const gap = demoVerifiedGap();
  assert.ok(gap.reported > gap.verified);
  assert.ok(gap.rows.some((row) => row.reason === "Duplicate conversion."));
  assert.ok(gap.rows.some((row) => row.reason === "Contact check failed."));
  assert.ok(gap.rows.some((row) => row.status === "verified" && row.reason.includes("contact check")));
  assert.ok(gap.rows.some((row) => row.reason.includes("Only a data-market MAID campaign")));

  const attempt = demoBudgetAttempt();
  assert.equal(attempt.blocked, true);
  assert.match(attempt.message, /Bots may only create recommendations/);
  assert.match(attempt.message, /daily_budget/);

  const vendors = demoVendorChecks();
  const honest = vendors.checks.find((check) => check.tone === "clear");
  const flagged = vendors.checks.find((check) => check.tone === "flagged");
  assert.ok(honest?.flags.some((flag) => flag.code === "seed" && flag.message.includes("known fake IDs")));
  assert.ok(flagged?.flags.some((flag) => flag.code === "seed_unreliable" && flag.message.includes("unreliable")));
  assert.match(vendors.holdout.message, /Incremental lift/);
  assert.match(vendors.holdout.note, /not a client result/);

  const channels = demoChannels();
  assert.deepEqual(channels.map((channel) => channel.platform), ["Meta", "Google", "TikTok", "StackAdapt"]);
  assert.equal(new Set(channels.map((channel) => channel.listId)).size, 1);
  assert.ok(channels.every((channel) => channel.status.includes("Not sent")));
  assert.match(channels.find((channel) => channel.platform === "Google")?.note || "", /Customer Match policy risk/);

  assert.ok(Date.parse(DEMO_STALE_LIST.sourcedAt) < Date.parse(DEMO_LIST.sourcedAt));
  assert.equal(PROBLEM_STATS.length, 4);
  assert.ok(PROBLEM_STATS.every((stat) => stat.source && stat.date && stat.scope));

  const staff = presentDemo(buildDemoDataset(), "staff");
  const client = presentDemo(buildDemoDataset(), "client");
  assert.equal(client.audiences.vendor, DEMO_LIST.vendor);
  assert.equal(client.audiences.listId, DEMO_LIST.listId);
  assert.equal(client.audiences.sourcedAt, DEMO_LIST.sourcedAt);
  assert.equal(client.audiences.stale.listId, DEMO_STALE_LIST.listId);
  const strings: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") strings.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(client);
  assert.equal(strings.some((item) => moneyText(item)), false);

  const data = staff;
  const html = ["problem", "audiences", "serving", "verified", "decisions", "vendors", "report", "close", "client", "investor"]
    .map((screen) => renderToStaticMarkup(<DemoScreens screen={screen as "problem"} data={data} tourEnabled />))
    .join("\n");
  assert.match(html, /Thales 2026 Bad Bot Report/);
  assert.match(html, /April 29, 2026/);
  assert.match(html, /Pixalate/);
  assert.match(html, /August 12, 2026/);
  assert.match(html, /45\.1%/);
  assert.match(html, /ANA \/ TAG TrustNet \/ Fiducia/);
  assert.match(html, /DoubleVerify 2026 Global Insights/);
  assert.match(html, /2\.8%/);
  assert.match(html, /0\.6%/);
  assert.match(html, /Pre-serve bot filtering is not connected/);
  assert.equal(html.includes(DEMO_LIST.vendor), true);
  assert.equal(html.includes(DEMO_LIST.listId), true);
  assert.match(html, /Not sourced for this campaign/);
  assert.match(html, /Prepared in this demo\. Not sent\./);
  assert.match(html, /data-budget-lock="blocked"/);
  assert.match(html, /known fake IDs/);
  assert.match(html, /unreliable/);
  assert.match(html, /Holdout lift/);
  assert.match(html, /Forward-looking statements/);
  assert.match(html, /subject to review by securities counsel/);
  assert.match(html, /does not promise any return/);
  assert.match(html, /\[Specificity figure\]/);
  assert.match(html, /Choose the room/);
  assert.match(html, /What you will see each week/);
  assert.equal(BANNED.test(html), false);
  assert.equal(/guaranteed return|IRR|multiple of/i.test(html), false);
});

test("homepage, demo copy, and the presenter script do not name competitors", () => {
  const blobs = [
    homepageProse(homepageModel()),
    renderTourSteps(DEMO_FACTS).map((step) => `${step.title} ${step.body}`).join("\n"),
    renderTourSteps(DEMO_FACTS, "client").map((step) => step.body).join("\n"),
    renderTourSteps(DEMO_FACTS, "investor").map((step) => step.body).join("\n"),
    ...COPY_FILES.map((file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8")),
  ];
  for (const blob of blobs) {
    assert.equal(BANNED.test(blob), false, blob.slice(Math.max(0, blob.search(BANNED) - 40), blob.search(BANNED) + 40));
  }
  const prose = homepageProse(homepageModel());
  assert.equal(/filtered out before a dollar is spent|checks that every ID is a real human|Bots, duplicates and stale IDs/i.test(prose), false);
  assert.match(prose, /deduped, contact-checked conversions/);
});

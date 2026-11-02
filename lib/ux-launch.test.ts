import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { PublicHomepage } from "../components/public-homepage";
import { proxy } from "../proxy";
import { decideAccessRequest, recordPageAccessRequest } from "./access-request";
import { homepageModel } from "./homepage-content";
import { assembleCompareSources, compareTable } from "./marketing/compare-table";
import { money } from "./marketing/staff-money";
import { homeLogosEnabled, homePricingEnabled, homeQuotesEnabled, uxLaunchGapsEnabled } from "./ux-flags";

const ORIGIN = "http://voiceops.test";

function request(pathname: string) {
  return new NextRequest(`${ORIGIN}${pathname}`);
}

function homepageHtml(env: Record<string, string>) {
  return renderToStaticMarkup(createElement(PublicHomepage, { model: homepageModel(env) }));
}

test("money(null), money(NaN), and money(undefined) render n/a", () => {
  assert.equal(money(null), "n/a");
  assert.equal(money(Number.NaN), "n/a");
  assert.equal(money(undefined), "n/a");
  assert.equal(money(12.5), "$12.50");
});

test("homepage flags default off and the rendered page has no placeholder copy", () => {
  assert.equal(homeLogosEnabled({}), false);
  assert.equal(homeQuotesEnabled({}), false);
  assert.equal(homePricingEnabled({}), false);
  assert.equal(uxLaunchGapsEnabled({}), false);
  const html = homepageHtml({ PUBLIC_HOMEPAGE: "on" });
  assert.equal(/TODO/i.test(html), false);
  assert.equal(/jason/i.test(html), false);
  assert.equal(/sign-off/i.test(html), false);
  assert.match(html, /Talk to us about pricing/);
  assert.match(html, /Pricing depends on your channels and audiences/);
  assert.match(html, /href="\/request-access"/);
  assert.match(html, /Request a demo/);
  const revealed = homepageHtml({ PUBLIC_HOMEPAGE: "on", HOME_LOGOS: "on", HOME_QUOTES: "on", HOME_PRICING: "on" });
  assert.match(revealed, /TODO/);
});

test("UX_LAUNCH_GAPS 404s unknown urls and still sends known protected routes to login", async () => {
  const on = { UX_LAUNCH_GAPS: "on" };
  const missing = await proxy(request("/not-a-real-page"), on);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("location"), null);
  assert.match(await missing.text(), /We can't find that page/);
  const known = await proxy(request("/calls/contacts"), on);
  assert.equal(new URL(known.headers.get("location") || "", ORIGIN).pathname, "/login");
  const api = await proxy(request("/api/not-a-route"), on);
  assert.equal(api.status, 401);
  const off = await proxy(request("/not-a-real-page"), {});
  assert.equal(new URL(off.headers.get("location") || "", ORIGIN).pathname, "/login");
});

test("a second access request inside 24 hours does not store or notify again", async () => {
  const now = new Date("2026-11-02T15:00:00Z");
  assert.equal(decideAccessRequest(null, now), "create");
  assert.equal(decideAccessRequest(new Date(now.getTime() - 23 * 60 * 60 * 1000), now), "sent");
  assert.equal(decideAccessRequest(new Date(now.getTime() - 25 * 60 * 60 * 1000), now), "create");
  let created = 0;
  let notified = 0;
  const first = await recordPageAccessRequest({
    now,
    existingAt: null,
    adminIds: ["admin-1"],
    create: async () => {
      created += 1;
    },
    notify: async (adminIds) => {
      notified += adminIds.length;
    },
  });
  const second = await recordPageAccessRequest({
    now,
    existingAt: now,
    adminIds: ["admin-1"],
    create: async () => {
      created += 1;
    },
    notify: async (adminIds) => {
      notified += adminIds.length;
    },
  });
  assert.deepEqual(first, { created: true, sent: true });
  assert.deepEqual(second, { created: false, sent: true });
  assert.equal(created, 1);
  assert.equal(notified, 1);
});

test("compare builds one row per client and labels a missing manager", () => {
  const sources = assembleCompareSources({
    workspaces: [
      { id: "north", name: "North Example" },
      { id: "south", name: "South Example" },
    ],
    managers: [{ workspaceId: "north", name: "Avery Example" }],
    metrics: [
      { workspaceId: "north", spend: 100, leads: 10, booked: 2 },
      { workspaceId: "south", spend: null, leads: 4, booked: 1 },
    ],
    alertWorkspaceIds: ["south"],
    decisionCounts: [{ workspaceId: "north", count: 3 }],
  });
  const table = compareTable(sources);
  assert.equal(table.rows.length, 2);
  assert.equal(table.sort, "spend");
  assert.equal(table.dir, "desc");
  assert.equal(table.rows[0]?.name, "North Example");
  assert.equal(table.rows[0]?.manager, "Avery Example");
  assert.equal(table.rows[0]?.spendLabel, "$100.00");
  assert.equal(table.rows[0]?.cplLabel, "$10.00");
  assert.equal(table.rows[0]?.openDecisions, 3);
  assert.equal(table.rows[1]?.name, "South Example");
  assert.equal(table.rows[1]?.manager, "No manager");
  assert.equal(table.rows[1]?.managerMissing, true);
  assert.equal(table.rows[1]?.spendLabel, "n/a");
  assert.equal(table.rows[1]?.junkLabel, "Yes");
  const onlyMissing = compareTable(sources, { manager: "No manager" });
  assert.deepEqual(onlyMissing.rows.map((row) => row.id), ["south"]);
  const searched = compareTable(sources, { q: "north", sort: "leads", dir: "asc" });
  assert.deepEqual(searched.rows.map((row) => row.name), ["North Example"]);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PortfolioDashboard } from "../components/portfolio-dashboard";
import { proxy } from "../proxy";
import {
  assertPublicAnalytics,
  nextLoginTab,
  buildPublicLoginAnalytics,
  countUpValue,
  createAnalyticsCache,
  createLoginAnalyticsLimiter,
  handlePublicLoginAnalytics,
  loginAnalyticsEnabled,
  loginAnalyticsMinClients,
  loginFrameClass,
  publicAnalyticsViolations,
  roundPublicCount,
  type LoginContribution,
} from "./login-analytics";
import { sparklinePoints } from "../components/login-analytics-screen";
import {
  actionMix,
  assemblePortfolio,
  commandCenterHref,
  defaultPortfolioOrder,
  formatPortfolioSpend,
  matchPresentation,
  pixelHealth,
  portfolioAllowed,
  portfolioHasSpend,
  portfolioWorkspaceIds,
  sortPortfolio,
  type PortfolioFacts,
} from "./portfolio";
import { loginNextField, postLoginPath } from "./public-routing";

const ROOT = path.resolve(import.meta.dirname, "..");

function source(file: string) {
  return readFileSync(path.join(ROOT, file), "utf8");
}

function client(id: string, leads: number, extra: Partial<LoginContribution> = {}): LoginContribution {
  return {
    workspaceId: id,
    name: `${id} Dental`,
    leads: [{ date: "2026-10-10", count: leads }],
    verifiedHuman: [{ date: "2026-10-12", count: Math.ceil(leads / 2) }],
    callsAnswered: [{ date: "2026-10-11", count: Math.ceil(leads / 3) }],
    activeCampaigns: 2,
    ...extra,
  };
}

const NOW = new Date("2026-10-31T18:00:00.000Z");

test("login analytics stays off and the client minimum defaults to 5", () => {
  assert.equal(loginAnalyticsEnabled({}), false);
  assert.equal(loginAnalyticsEnabled({ LOGIN_ANALYTICS: "off" }), false);
  assert.equal(loginAnalyticsEnabled({ LOGIN_ANALYTICS: "on" }), true);
  assert.equal(loginAnalyticsMinClients({}), 5);
  assert.equal(loginAnalyticsMinClients({ LOGIN_ANALYTICS_MIN_CLIENTS: "3" }), 3);
  assert.equal(loginAnalyticsMinClients({ LOGIN_ANALYTICS_MIN_CLIENTS: "0" }), 5);
  assert.equal(loginAnalyticsMinClients({ LOGIN_ANALYTICS_MIN_CLIENTS: "nope" }), 5);
});

test("public totals round, drop a short client list, and omit money and names", () => {
  const few = buildPublicLoginAnalytics({
    contributions: [client("alpha", 40), client("bravo", 20)],
    now: NOW,
    threshold: 5,
    zoneISO: "2026-10-31",
  });
  assert.equal(few.metrics.leads.hidden, true);
  assert.equal("value" in few.metrics.leads, false);
  assert.equal(few.metrics.verifiedHumanConversions.hidden, true);
  assert.equal(few.metrics.callsAnswered.hidden, true);
  assert.equal(few.metrics.activeCampaigns.hidden, true);
  assertPublicAnalytics(few, ["alpha", "bravo", "alpha Dental"]);

  const many = [client("alpha", 14), client("bravo", 11), client("cedar", 8), client("delta", 6), client("echo", 4)];
  const shown = buildPublicLoginAnalytics({ contributions: many, now: NOW, threshold: 5, zoneISO: "2026-10-31" });
  assert.equal(shown.metrics.leads.hidden, false);
  if (!shown.metrics.leads.hidden) {
    assert.equal(shown.metrics.leads.value, roundPublicCount(14 + 11 + 8 + 6 + 4));
    assert.equal(shown.metrics.leads.series.length, 30);
    assert.equal(shown.metrics.leads.series.some((point) => point % 10 !== 0), false);
  }
  const late = buildPublicLoginAnalytics({
    contributions: [client("alpha", 0, { leads: [{ date: "2026-11-02", count: 500 }], verifiedHuman: [], callsAnswered: [], activeCampaigns: 0 })],
    now: NOW,
    threshold: 1,
    zoneISO: "2026-10-31",
  });
  assert.equal(late.metrics.leads.hidden, true);
  assert.deepEqual(publicAnalyticsViolations(shown, ["alpha Dental"]).leaked, []);
  assert.equal(publicAnalyticsViolations({ cpl: 4, cpa: 2, spend: 9, clientName: "Alpha" }).keys.length > 0, true);
  assert.equal(JSON.stringify(shown).includes("alpha"), false);
  assert.equal(JSON.stringify(shown).includes("$"), false);
});

test("a day with fewer than the minimum clients does not appear on the sparkline", () => {
  const rows = ["a", "b", "c", "d", "e"].map((id, index) =>
    client(id, 10, {
      leads: [{ date: index === 0 ? "2026-10-03" : "2026-10-20", count: 10 }],
    }),
  );
  const body = buildPublicLoginAnalytics({ contributions: rows, now: NOW, threshold: 5, zoneISO: "2026-10-31" });
  assert.equal(body.metrics.leads.hidden, false);
  if (!body.metrics.leads.hidden) {
    const spike = body.metrics.leads.series[body.metrics.leads.series.length - (31 - 3) - 1];
    assert.equal(spike, 0);
  }
});

test("the public handler is cached, rate-limited, and empty when the switch is off", async () => {
  let loads = 0;
  const load = async () => {
    loads += 1;
    return ["a", "b", "c", "d", "e"].map((id) => client(id, 20));
  };
  const off = await handlePublicLoginAnalytics({
    env: {},
    now: NOW.getTime(),
    ip: "1.1.1.1",
    limiter: createLoginAnalyticsLimiter(),
    cache: createAnalyticsCache(),
    load,
    zoneISO: () => "2026-10-31",
  });
  assert.equal(off.status, 404);
  assert.equal(loads, 0);

  const limiter = createLoginAnalyticsLimiter(5);
  const cache = createAnalyticsCache();
  const env = { LOGIN_ANALYTICS: "on", LOGIN_ANALYTICS_MIN_CLIENTS: "5" };
  const first = await handlePublicLoginAnalytics({ env, now: NOW.getTime(), ip: "1.1.1.1", limiter, cache, load, zoneISO: () => "2026-10-31" });
  const second = await handlePublicLoginAnalytics({ env, now: NOW.getTime() + 1000, ip: "1.1.1.1", limiter, cache, load, zoneISO: () => "2026-10-31" });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(loads, 1);
  assert.equal((first.body as { metrics: { leads: { hidden: boolean } } }).metrics.leads.hidden, false);
  const tight = createLoginAnalyticsLimiter(1);
  const opened = await handlePublicLoginAnalytics({
    env,
    now: NOW.getTime(),
    ip: "9.9.9.9",
    limiter: tight,
    cache: createAnalyticsCache(),
    load,
    zoneISO: () => "2026-10-31",
  });
  const blocked = await handlePublicLoginAnalytics({
    env,
    now: NOW.getTime(),
    ip: "9.9.9.9",
    limiter: tight,
    cache: createAnalyticsCache(),
    load,
    zoneISO: () => "2026-10-31",
  });
  assert.equal(opened.status, 200);
  assert.equal(blocked.status, 429);

  const broken = await handlePublicLoginAnalytics({
    env,
    now: NOW.getTime(),
    ip: "2.2.2.2",
    limiter: createLoginAnalyticsLimiter(),
    cache: createAnalyticsCache(),
    load: async () => {
      throw new Error("db");
    },
    zoneISO: () => "2026-10-31",
  });
  assert.equal(broken.status, 503);
  assert.equal(JSON.stringify(broken.body).includes("metrics"), false);
});

test("count-up respects reduced motion and the public query stays anonymous", () => {
  assert.equal(countUpValue(0, 100, true), 100);
  assert.equal(countUpValue(900, 100, false), 100);
  assert.equal(countUpValue(0, 100, false), 0);
  assert.equal(roundPublicCount(14), 10);
  assert.equal(roundPublicCount(15), 20);
  assert.equal(roundPublicCount(0), 0);
  const query = source("lib/login-analytics-query.ts");
  const route = source("app/api/public/login-analytics/route.ts");
  assert.match(query, /isolatedWhere\(/);
  assert.match(query, /workspaceReads\(/);
  assert.match(query, /ingestedAt: \{ lte: asOf \}/);
  assert.equal(/spend|cpl|cpa|roas|budget|costCents|valueCents/i.test(query), false);
  assert.equal(/spend|cpl|cpa|roas/i.test(route), false);
  assert.match(source("lib/public-routing.ts"), /api\/public\/login-analytics/);
  assert.equal(loginFrameClass(true).includes("place-items-center"), true);
  assert.equal(loginFrameClass(false).includes("440px"), true);
  assert.match(sparklinePoints([0, 10, 20]), /,/);
  const screen = source("components/login-analytics-screen.tsx");
  assert.match(screen, /aria-live="off"/);
  assert.match(screen, /Client login/);
  assert.match(screen, /Team login/);
  assert.match(screen, /prefers-reduced-motion/);
  assert.match(screen, /Not enough data to show/);
  assert.match(screen, /Continue with company sign-in/);
  assert.match(screen, /Combined totals from all clients/);
  assert.match(screen, /No client names or individual results are shown/);
  assert.match(screen, /autoComplete="username"/);
  assert.match(screen, /autoComplete="current-password"/);
  assert.match(screen, /WORK_EMAIL_ERROR/);
  assert.match(screen, /Contact support/);
  assert.match(screen, /nextLoginTab/);
  assert.equal(screen.includes("STATES"), false);
  assert.equal(/okta|microsoft|saml/i.test(screen), false);
  assert.equal(nextLoginTab("client", "ArrowRight"), "team");
  assert.equal(nextLoginTab("team", "ArrowLeft"), "client");
  assert.equal(nextLoginTab("team", "Home"), "client");
});

test("staff land on the portfolio and guests can read only the public aggregate", async () => {
  const on = { LOGIN_ANALYTICS: "on" };
  assert.equal(postLoginPath("super_admin", on), "/portfolio");
  assert.equal(postLoginPath("account_manager", on), "/portfolio");
  assert.equal(postLoginPath("client_viewer", on), "/marketing/client");
  assert.equal(postLoginPath("owner", on), "/");
  assert.equal(postLoginPath("admin", on), "/");
  assert.equal(postLoginPath("viewer", on), "/");
  assert.equal(postLoginPath("super_admin", { PUBLIC_HOMEPAGE: "on" }), "/marketing");
  assert.deepEqual(loginNextField("super_admin", {}), {});
  assert.equal(loginNextField("super_admin", on).next, "/portfolio");
  assert.equal(loginNextField("owner", on).next, undefined);
  assert.equal(loginNextField("client_viewer", on).next, "/marketing/client");
  const open = await proxy(new NextRequest("http://voiceops.test/api/public/login-analytics"), {});
  assert.equal(open.status, 200);
  assert.equal(open.headers.get("location"), null);
  const locked = await proxy(new NextRequest("http://voiceops.test/api/portfolio"), {});
  assert.equal(locked.status, 401);
});

function facts(id: string, name: string, leads: number, alerts: number, extra: Partial<PortfolioFacts> = {}): PortfolioFacts {
  return {
    id,
    name,
    channels: 2,
    leads,
    conversions: 4,
    qualityScores: [60, 80],
    crmOutcome: true,
    scale: 1,
    learning: 2,
    cut: 0,
    alerts,
    pixelCheckedAt: "2026-10-31T16:00:00.000Z",
    pixelsMissing: false,
    matchMatched: 8,
    matchTotal: 10,
    speedSeconds: [30, 50],
    callOutcomes: { answered: 3, booked: 1, noAnswer: 2, voicemail: 0, other: 0 },
    spend: leads * 10,
    ...extra,
  };
}

test("portfolio scope rejects client roles and hides spend without permission", () => {
  assert.equal(portfolioAllowed("super_admin"), true);
  assert.equal(portfolioAllowed("account_manager"), true);
  assert.equal(portfolioAllowed("staff"), false);
  assert.equal(portfolioAllowed("client_owner"), false);
  assert.equal(portfolioAllowed("client_viewer"), false);
  assert.equal(portfolioAllowed("none"), false);
  assert.deepEqual(portfolioWorkspaceIds({ kind: "client_viewer", knownIds: ["org", "gulf"], assignedIds: [] }), []);
  assert.deepEqual(portfolioWorkspaceIds({ kind: "staff", knownIds: ["org", "gulf"], assignedIds: [] }), []);
  assert.deepEqual(portfolioWorkspaceIds({ kind: "super_admin", knownIds: ["org", "gulf"], assignedIds: ["gulf"] }), ["org", "gulf"]);
  assert.deepEqual(portfolioWorkspaceIds({ kind: "account_manager", knownIds: ["org", "gulf", "harbor"], assignedIds: ["gulf"] }), ["gulf"]);
  assert.deepEqual(portfolioWorkspaceIds({ kind: "account_manager", knownIds: ["org", "gulf"], assignedIds: [] }), ["org", "gulf"]);

  const model = assemblePortfolio({
    facts: [facts("org", "Specificity Inc", 100, 1), facts("gulf", "Gulf Coast", 40, 4), facts("other", "Other Co", 9, 9)],
    allowedIds: ["gulf"],
    showMoney: false,
    now: NOW,
  });
  assert.deepEqual(model.clients.map((client) => client.id), ["gulf"]);
  assert.equal(model.showMoney, false);
  assert.equal(model.budgetWrites, false);
  assert.equal(model.autoPause, "dry_run");
  assert.equal(portfolioHasSpend(model), false);
  assert.equal(JSON.stringify(model).includes("Specificity"), false);
  assert.equal(JSON.stringify(model).includes("Other Co"), false);
  assert.match(model.clients[0].detail, /Speed 40s/);
  assert.match(model.clients[0].detail, /answered/);
  assert.equal(model.clients[0].href.includes("client=gulf"), true);

  const staff = assemblePortfolio({
    facts: [facts("org", "Specificity Inc", 10, 0), facts("gulf", "Gulf Coast", 50, 2, { spend: 19100 })],
    allowedIds: ["org", "gulf"],
    showMoney: true,
    now: NOW,
  });
  assert.equal(staff.clients[0].id, "gulf");
  assert.equal(staff.clients[0].spend, 19100);
  assert.equal(staff.totals.spend, 19100 + 100);
  assert.equal(formatPortfolioSpend(19100), "$19.1k");
  assert.equal(staff.roleLine.includes("Spend visible"), true);
});

test("portfolio sort, pixel, match hold, and provisional quality", () => {
  const rows = [
    facts("a", "Alpha", 10, 0),
    facts("b", "Bravo", 4, 3, { pixelCheckedAt: "2026-10-31T08:00:00.000Z", matchMatched: 1, matchTotal: 10 }),
  ];
  const ordered = defaultPortfolioOrder(assemblePortfolio({ facts: rows, allowedIds: ["a", "b"], showMoney: true, now: NOW }).clients);
  assert.equal(ordered[0].id, "b");
  assert.match(ordered[0].alertLabel, /pixel stale/);
  const resorted = sortPortfolio(ordered, "leads", "desc");
  assert.equal(resorted[0].id, "a");
  assert.equal(pixelHealth("2026-10-31T10:00:00.000Z", NOW, false).label, "Stale 8h");
  assert.equal(matchPresentation(2, 10).onHold, true);
  assert.equal(matchPresentation(2, 10).label, "20% · On hold: low match rate");
  const provisional = assemblePortfolio({
    facts: [facts("a", "Alpha", 5, 0, { crmOutcome: false, qualityScores: [79] })],
    allowedIds: ["a"],
    showMoney: true,
    now: NOW,
  });
  assert.equal(provisional.clients[0].provisional, true);
  assert.equal(provisional.clients[0].quality, 79);
  assert.deepEqual(actionMix([{ type: "budget_change", status: "verified" }, { type: "performance", status: "verified" }, { type: "creative_fatigue", status: "accepted" }, { type: "traffic", status: "draft" }], ["clearly_helping"]), {
    scale: 2,
    learning: 1,
    cut: 1,
  });
  assert.equal(commandCenterHref("gulf", {}).includes("/?client=gulf") || commandCenterHref("gulf", { PUBLIC_HOMEPAGE: "on" }).startsWith("/app?client=gulf"), true);
  assert.equal(commandCenterHref("gulf", { PUBLIC_HOMEPAGE: "on" }), "/app?client=gulf");
});

test("portfolio reads are isolated and do not write budgets or pause ads", () => {
  const query = source("lib/portfolio-query.ts");
  const page = source("app/portfolio/page.tsx");
  const route = source("app/api/portfolio/route.ts");
  const view = source("components/portfolio-dashboard.tsx");
  assert.match(query, /isolatedWhere\(/);
  assert.match(query, /workspaceReads\(/);
  assert.match(query, /showMoney \? \{ spend: true \} : \{\}/);
  assert.match(query, /portfolioAllowed\(access\.kind\)/);
  assert.equal(query.includes("findMany()"), false);
  assert.equal(page.includes("setCampaignBudget"), false);
  assert.equal(route.includes("setCampaignBudget"), false);
  assert.equal(/method=["']post["']/i.test(view), false);
  assert.match(view, /budgetNote/);
  assert.match(source("lib/portfolio.ts"), /recommendations only/i);
  assert.match(view, /aria-sort/);
  assert.match(view, /scope="col"/);
  assert.match(view, /Scale/);
  assert.match(view, /min-\[701px\]:hidden/);
  assert.match(view, /refreshed/);
  const html = renderToStaticMarkup(
    createElement(PortfolioDashboard, {
      initial: assemblePortfolio({
        facts: [facts("gulf", "Gulf Coast Senior Insurance", 6120, 2)],
        allowedIds: ["gulf"],
        showMoney: true,
        now: NOW,
        env: {},
      }),
    }),
  );
  assert.match(html, /Portfolio/);
  assert.match(html, /Gulf Coast Senior Insurance/);
  assert.match(html, /Spend MTD/);
  assert.match(html, /href="\/\?client=gulf"/);
  assert.equal(html.includes("method=\"post\""), false);
});

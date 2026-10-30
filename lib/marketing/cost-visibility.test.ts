import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { accessFromUser } from "./access";
import { buildClientShare, clientShareCsv, clientShareHasMoney } from "./client-view";
import {
  alertWhere,
  campaignSelect,
  dailyMetricSelect,
  metricSum,
  recommendationSelect,
  recommendationWhere,
  redactMarketingPage,
  searchTermSelect,
} from "./cost-visibility";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SCOPE = [{ workspaceId: "org", scopeKind: "client" as const, adAccountId: null, campaignId: null }];
const COST_KEY = /^(spend|budgetType|budgetAmount|budgetCurrency|budgetSetAt|reportedBudgetType|reportedBudgetAmount|cpc|cpm|cpa|cpl|roas|cost|costPerLead|costPerBooked|conversionValue|revenue|currentBudgetAmount|currentBudgetPeriod|proposedBudgetAmount|proposedBudgetPeriod|proposedCurrency)$/;
const COST_TEXT = /cost|spend|cpc|cpm|cpa|cpl|roas|\bbudget\b|\$/i;

function accessFor(role: string) {
  const assignments = role === "account_manager" || role === "client_viewer" ? SCOPE : [];
  return accessFromUser({ id: role, email: `${role}@example.com`, role }, assignments, {});
}

function fixture() {
  return {
    accounts: [{ id: "a", name: "Main", currency: "USD" }],
    campaigns: [
      {
        id: "c",
        name: "Leads",
        account: "Main",
        budgetType: "daily",
        budgetAmount: 50,
        budgetCurrency: "USD",
        budgetSetAt: "2026-10-01",
        reportedBudgetType: "daily",
        reportedBudgetAmount: 40,
        currency: "USD",
        adGroups: 1,
      },
    ],
    rows: [{ id: "m", ad: "Ad", currency: "USD", spend: 12.5, impressions: 1000, clicks: 40, reach: 800, leads: 4 }],
    searchTerms: [{ id: "s", term: "roof repair", matchType: "Phrase", currency: "USD", spend: 4.2, impressions: 10, clicks: 1, conversions: 0 }],
    totals: [{ currency: "USD", spend: 12.5, impressions: 1000, clicks: 40, leads: 4 }],
    alerts: [
      { id: "cost", code: "cpc_off", metric: "cpc", title: "Spring promo costs more", summary: "This ad costs more than your other ads." },
      { id: "clicks", code: "ctr_off", metric: "ctr", title: "Fewer clicks than your other ads", summary: "This is a note, not a change." },
    ],
    recommendations: [
      {
        id: "b",
        type: "budget_change",
        metric: "budget",
        title: "Consider a lower daily budget",
        summary: "from 50.00 USD to 40.00 USD",
        rationale: "Efficiency is worse.",
        currentBudgetAmount: 50,
        proposedBudgetAmount: 40,
        proposedCurrency: "USD",
        proposedBudgetPeriod: "daily",
      },
      {
        id: "roi",
        type: "roi",
        metric: "roi",
        title: "Keep the ad inside its daily budget",
        summary: "Stay inside the daily budget.",
        rationale: "Capped by the budget a person set.",
      },
      {
        id: "cpc",
        type: "performance",
        metric: "cpc",
        title: "This ad costs more",
        summary: "This ad costs more than your other ads.",
        rationale: "Compared on cost.",
      },
      {
        id: "t",
        type: "traffic",
        metric: "ctr",
        title: "Fewer clicks than your other ads",
        summary: "This is a note, not a change.",
        rationale: "Compared with your other ads on clicks.",
        baseline: "0.0500",
        observed: "0.0200",
      },
    ],
    digests: [
      {
        id: "d",
        createdAt: "2026-10-29T12:00:00.000Z",
        delivery: "not_sent",
        payload: {
          alerts: [
            { title: "Spend is high", summary: "CPC is $2.40" },
            { title: "Fewer clicks than your other ads", summary: "Compared with similar ads." },
          ],
          recommendations: [{ title: "Lower the budget", summary: "$50 per day" }],
        },
      },
      {
        id: "quiet-hour",
        createdAt: "2026-10-29T13:00:00.000Z",
        delivery: "not_sent",
        payload: { alerts: [{ title: "Spend jumped", summary: "$9" }], recommendations: [] },
      },
    ],
  };
}

function leaks(value: unknown, found: string[] = [], trail = ""): string[] {
  if (Array.isArray(value)) {
    value.forEach((item, index) => leaks(item, found, `${trail}[${index}]`));
    return found;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (COST_KEY.test(key)) found.push(`${trail}.${key}`);
      leaks(child, found, `${trail}.${key}`);
    }
  }
  return found;
}

test("cost queries omit spend and budget columns unless the viewer is staff", () => {
  assert.equal("spend" in dailyMetricSelect(false), false);
  assert.equal("conversionValue" in dailyMetricSelect(false), false);
  assert.equal("currency" in dailyMetricSelect(false), false);
  assert.equal(dailyMetricSelect(true).spend, true);
  assert.equal(dailyMetricSelect(true).conversionValue, true);
  assert.equal("budgetAmount" in campaignSelect(false), false);
  assert.equal("reportedBudgetAmount" in campaignSelect(false), false);
  assert.equal(campaignSelect(true).budgetAmount, true);
  assert.equal("spend" in metricSum(false), false);
  assert.equal(metricSum(true).spend, true);
  assert.equal("currentBudgetAmount" in recommendationSelect(false), false);
  assert.equal("proposedBudgetAmount" in recommendationSelect(false), false);
  assert.equal(recommendationSelect(true).currentBudgetAmount, true);
  assert.deepEqual(recommendationWhere(false).type, { notIn: ["budget_change", "roi", "pacing"] });
  assert.ok(alertWhere(false).code && "notIn" in alertWhere(false).code && alertWhere(false).code.notIn?.includes("cpc_off"));
  assert.ok(alertWhere(false).metric && "notIn" in alertWhere(false).metric && alertWhere(false).metric.notIn?.includes("cpa"));
  const queries = readFileSync(path.join(ROOT, "lib/marketing/queries.ts"), "utf8");
  assert.match(queries, /dailyMetricSelect\(seesCost\)/);
  assert.match(queries, /campaignSelect\(seesCost\)/);
  assert.match(queries, /metricSum\(seesCost\)/);
  assert.match(queries, /recommendationSelect\(seesCost\)/);
  assert.match(queries, /alertWhere\(seesCost\)/);
  assert.match(queries, /recommendationWhere\(seesCost\)/);
  assert.match(queries, /redactMarketingPage\(/);
  assert.match(queries, /searchTermSelect\(seesCost\)/);
  assert.equal(queries.includes("spend: true"), false);
  assert.equal("spend" in searchTermSelect(false), false);
  assert.equal("currency" in searchTermSelect(false), false);
  assert.equal(searchTermSelect(true).spend, true);
  const compare = readFileSync(path.join(ROOT, "app/api/marketing/compare/route.ts"), "utf8");
  assert.ok(compare.indexOf('kind !== "super_admin"') >= 0);
  assert.ok(compare.indexOf('kind !== "super_admin"') < compare.indexOf("spend: true"));
});

test("only super admins and account managers receive cost fields", () => {
  const staff = ["super_admin", "account_manager"];
  const blocked = ["owner", "admin", "viewer", "client_viewer"];
  for (const role of staff) {
    const access = accessFor(role);
    assert.equal(access.seesCost, true, role);
    const page = redactMarketingPage(fixture(), access.seesCost);
    assert.equal(page.rows[0]?.spend, 12.5, role);
    assert.equal(page.searchTerms?.[0]?.spend, 4.2, role);
    assert.equal(page.campaigns[0]?.budgetAmount, 50, role);
    assert.equal(page.recommendations.some((row) => row.type === "budget_change"), true, role);
    assert.equal(page.totals[0]?.spend, 12.5, role);
  }
  for (const role of blocked) {
    const access = accessFor(role);
    assert.equal(access.seesCost, false, role);
    const page = redactMarketingPage(fixture(), access.seesCost);
    const text = JSON.stringify(page);
    assert.deepEqual(leaks(page), [], role);
    assert.equal(COST_TEXT.test(text), false, `${role}: ${text}`);
    assert.equal(page.rows[0]?.impressions, 1000, role);
    assert.equal(page.rows[0]?.clicks, 40, role);
    assert.equal(page.rows[0]?.leads, 4, role);
    assert.equal("spend" in (page.rows[0] ?? {}), false, role);
    assert.equal("spend" in (page.searchTerms?.[0] ?? {}), false, role);
    assert.equal(page.searchTerms?.[0]?.term, "roof repair", role);
    assert.equal(page.searchTerms?.[0]?.clicks, 1, role);
    assert.equal(page.recommendations.map((row) => row.type).join(), "traffic", role);
    assert.equal(page.alerts.map((row) => row.id).join(), "clicks", role);
    assert.equal(page.digests.length, 1, role);
    assert.equal(page.digests[0]?.id, "d", role);
    const payload = page.digests[0]?.payload as { alerts: { title: string }[]; recommendations: unknown[] };
    assert.equal(payload.alerts.length, 1);
    assert.equal(payload.alerts[0]?.title, "Fewer clicks than your other ads");
    assert.equal(payload.recommendations.length, 0);
    assert.equal(page.accounts[0]?.currency, "USD");
  }
});

test("share link payloads and csv never include cost", () => {
  const view = buildClientShare({
    client: "Acme",
    adViews: 1200,
    leads: 8,
    booked: 3,
    campaigns: [{ name: "Leads", channel: "Meta", leads: 8, booked: 3 }],
  });
  assert.equal(clientShareHasMoney(view), false);
  const csv = clientShareCsv(view);
  assert.equal(COST_TEXT.test(csv), false);
  assert.equal(csv.includes("Spend"), false);
  assert.equal(leaks(view).join(), "");
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { audienceDetailBody, audienceListBody, audienceResolutionBody } from "./audience-data/for-viewer";
import { exampleCtvPull } from "./ctv/fixtures";
import { buildCtvView, ctvPayloadForViewer } from "./ctv/report";
import { jarvisHomeBody } from "./jarvis-home";
import { forSpendViewer } from "./spend-access";

const ROOT = path.resolve(import.meta.dirname, "../..");
const ON = { JARVIS_UI_V2: "on", AUDIENCE_DATA: "on", RESOLUTION_DATA: "on", ALL_CLIENTS_VIEWER_SEES_COST: "on" };
const OFF = { JARVIS_UI_V2: "on", AUDIENCE_DATA: "on", RESOLUTION_DATA: "on" };
const MONEY = ["spend", "budget", "cost", "cpl", "cpql", "cpa", "roas", "bid", "datacpm", "datacostcpm", "cpm"];

function moneyKeys(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) moneyKeys(item, found);
    return found;
  }
  if (!value || typeof value !== "object") return found;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const token = key.toLowerCase().replace(/[_-]/g, "");
    if (MONEY.some((name) => token === name || token.endsWith(name))) found.push(key);
    moneyKeys(child, found);
  }
  return found;
}

const viewer = { kind: "all_clients_viewer", role: "all_clients_viewer", workspaceId: "org" };
const staff = { kind: "super_admin", role: "super_admin", workspaceId: "org" };

test("jarvis home hides spend from the all-clients viewer unless the switch is on", () => {
  const hidden = jarvisHomeBody({ access: viewer, env: OFF });
  const shown = jarvisHomeBody({ access: viewer, env: ON });
  const kept = jarvisHomeBody({ access: staff, env: OFF });
  assert.equal(hidden.status, 200);
  assert.deepEqual(moneyKeys(hidden.body), []);
  assert.equal(JSON.stringify(hidden.body).includes("8300"), false);
  assert.equal((hidden.body as { leads?: number }).leads, 212);
  assert.equal((shown.body as { spend?: number }).spend, 8300);
  assert.equal((kept.body as { spend?: number }).spend, 8300);
  assert.ok(moneyKeys(kept.body).includes("spend"));
});

test("audience data hides spend, cpa, cpl, roas, and data cost from the all-clients viewer", () => {
  const hidden = audienceListBody({ access: viewer, env: OFF });
  const shown = audienceListBody({ access: viewer, env: ON });
  const kept = audienceListBody({ access: staff, env: OFF });
  assert.equal(hidden.status, 200);
  assert.deepEqual(moneyKeys(hidden.body), []);
  const hiddenRows = (hidden.body as { rows: { leads?: number }[] }).rows;
  const shownRows = (shown.body as { rows: { id: string; spend?: number; cpa?: number; dataCostCpm?: number }[] }).rows;
  const staffRows = (kept.body as { rows: { spend?: number }[] }).rows;
  assert.ok(hiddenRows.length > 0);
  assert.equal(typeof hiddenRows[0]?.leads, "number");
  assert.equal(typeof shownRows[0]?.spend, "number");
  assert.equal(typeof shownRows[0]?.cpa, "number");
  assert.equal(typeof shownRows[0]?.dataCostCpm, "number");
  assert.equal(typeof staffRows[0]?.spend, "number");
  const detail = audienceDetailBody({ access: viewer, sourceId: shownRows[0].id, env: OFF });
  const detailOn = audienceDetailBody({ access: viewer, sourceId: shownRows[0].id, env: ON });
  assert.equal(detail.status, 200);
  assert.deepEqual(moneyKeys(detail.body), []);
  assert.ok(moneyKeys(detailOn.body).length > 0);
  const resolution = audienceResolutionBody({ access: viewer, sourceId: shownRows[0].id, env: OFF });
  const resolutionOn = audienceResolutionBody({ access: viewer, sourceId: shownRows[0].id, env: ON });
  assert.equal(resolution.status, 200);
  assert.deepEqual(moneyKeys(resolution.body), []);
  assert.equal(JSON.stringify(resolution.body).toLowerCase().includes("spend"), false);
  assert.equal(resolutionOn.status, 200);
});

test("ctv, plan, and digest copy stay free of budget figures for the all-clients viewer", () => {
  const view = ctvPayloadForViewer(buildCtvView(exampleCtvPull()), "staff_nocost");
  assert.deepEqual(moneyKeys(view), []);
  assert.equal(JSON.stringify(view).toLowerCase().includes("budget"), false);
  assert.equal(view.platformLabel, "CTV (StackAdapt)");
  assert.equal(view.segments[0]?.vendorId.length > 0, true);
  const page = readFileSync(path.join(ROOT, "components/ctv-attribution-view.tsx"), "utf8");
  assert.match(page, /showMoney \? "Unflagged conversions are excluded\. No third-party vendor\. Recommendations never change a budget\."/);
  const plan = readFileSync(path.join(ROOT, "app/plan/[code]/page.tsx"), "utf8");
  const preview = readFileSync(path.join(ROOT, "app/(app)/plans/[id]/preview/page.tsx"), "utf8");
  assert.match(plan, /showCost: false/);
  assert.match(preview, /showCost: false/);
  const strippedPlan = forSpendViewer({ showCost: true, spend: 40, leads: 3, budget: 100 }, viewer, OFF);
  assert.equal(strippedPlan.showCost, false);
  assert.equal("spend" in strippedPlan, false);
  assert.equal(strippedPlan.leads, 3);
  const digest = forSpendViewer(
    { notes: ["Spend is $80 on this campaign", "Three new leads came in"], alerts: [{ title: "Tired ad", summary: "CPA rose to $40" }] },
    viewer,
    OFF,
  );
  assert.deepEqual(digest.notes, ["Three new leads came in"]);
  assert.equal(digest.alerts?.[0]?.title, "Tired ad");
  assert.equal(digest.alerts?.[0]?.summary, undefined);
  const staffDigest = forSpendViewer(
    { notes: ["Spend is $80 on this campaign"] },
    { kind: "account_manager", role: "account_manager" },
    OFF,
  );
  assert.deepEqual(staffDigest.notes, ["Spend is $80 on this campaign"]);
  const persist = readFileSync(path.join(ROOT, "lib/marketing/persist.ts"), "utf8");
  assert.match(persist, /forSpendViewer\(draft\.payload/);
});

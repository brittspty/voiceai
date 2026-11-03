import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { forbiddenClientKeys } from "./client-view";
import { marketingClientSwitcherEnabled } from "./config";
import { emptyAudiencePayload, realChannelLinks, realHomeFromRows } from "./real-view";

const ROOT = path.resolve(import.meta.dirname, "../..");
const MONEY = ["spend", "cost", "cpa", "cpl", "cpx", "roas", "budget", "bid"];

const clients = [
  { id: "client_north", name: "Northwind Studio" },
  { id: "client_cedar", name: "Cedar Lane Studio" },
];

const campaigns = [
  { id: "camp-stack", name: "Cedar prospecting", platform: "stackadapt", status: "active", clientId: "client_cedar" },
  { id: "camp-meta", name: "Oak line", platform: "meta", status: "active", clientId: "client_north" },
];

const metrics = [
  { campaignId: "camp-stack", impressions: 1000, clicks: 25, leads: 2, calls: 1, spend: 12.5 },
  { campaignId: "camp-meta", impressions: 400, clicks: 10, leads: 4, calls: 0, spend: 88.5 },
];

test("real home stays off until the client switcher is on", () => {
  assert.equal(marketingClientSwitcherEnabled({}), false);
  assert.equal(realHomeFromRows({ enabled: false, staff: true, showMoney: true, requestedId: "client_cedar", clients, campaigns, metrics }), null);
});

test("a client-mode StackAdapt row keeps leads and leaks no money", () => {
  const model = realHomeFromRows({
    enabled: true,
    staff: false,
    showMoney: false,
    requestedId: "client_north",
    clients,
    campaigns,
    metrics,
  });
  assert.ok(model);
  const stack = model.channels.find((row) => row.platform === "stackadapt");
  assert.equal(stack?.connected, true);
  assert.equal(stack?.leads, 2);
  assert.equal(stack?.campaigns[0]?.name, "Cedar prospecting");
  assert.equal(stack?.campaigns[0]?.spend, undefined);
  assert.equal(model.showMoney, false);
  assert.equal(model.canPickClient, false);
  assert.deepEqual(model.clients, []);
  assert.equal(model.clientId, null);
  const printed = JSON.stringify(model).toLowerCase();
  for (const word of MONEY) assert.equal(printed.includes(word), false, word);
  assert.equal(printed.includes("$"), false);
  assert.equal(printed.includes("12.5"), false);
  assert.equal(printed.includes("88.5"), false);
  assert.equal(printed.includes("northwind"), false);
  assert.equal(printed.includes("example data"), false);
  assert.deepEqual(forbiddenClientKeys(model), []);
  const google = model.channels.find((row) => row.platform === "google_ads");
  assert.equal(google?.status, "Not connected yet");
});

test("a client param from a non-staff user does not select another client", () => {
  const model = realHomeFromRows({
    enabled: true,
    staff: false,
    showMoney: true,
    requestedId: "client_north",
    clients,
    campaigns,
    metrics,
  });
  assert.ok(model);
  assert.equal(model.clientId, null);
  assert.equal(model.clientName, "Your campaigns");
  assert.equal(model.channels.find((row) => row.platform === "meta")?.leads, 4);
  assert.equal(model.channels.find((row) => row.platform === "stackadapt")?.leads, 2);
  assert.equal(model.showMoney, false);
  const printed = JSON.stringify(model);
  assert.equal(printed.includes("Northwind Studio"), false);
  assert.equal(printed.includes("client_north"), false);
  for (const word of MONEY) assert.equal(printed.toLowerCase().includes(word), false, word);
});

test("staff can scope the real home to one client and keep spend", () => {
  const model = realHomeFromRows({
    enabled: true,
    staff: true,
    showMoney: true,
    requestedId: "client_cedar",
    clients,
    campaigns,
    metrics,
    updatedLabel: "2026-11-03",
  });
  assert.ok(model);
  assert.equal(model.clientId, "client_cedar");
  assert.equal(model.clientName, "Cedar Lane Studio");
  assert.equal(model.channels.find((row) => row.platform === "stackadapt")?.leads, 2);
  assert.equal(model.channels.find((row) => row.platform === "stackadapt")?.spend, 12.5);
  assert.equal(model.channels.find((row) => row.platform === "meta")?.status, "Not connected yet");
  assert.equal(model.channels.find((row) => row.platform === "meta")?.leads, 0);
  assert.deepEqual(realChannelLinks("staff", "client_cedar").map((row) => row.href), [
    "/c/client_cedar/meta",
    "/c/client_cedar/google-ads",
    "/c/client_cedar/stackadapt",
  ]);
  const empty = realHomeFromRows({
    enabled: true,
    staff: true,
    showMoney: true,
    requestedId: "missing",
    clients,
    campaigns: [],
    metrics: [],
  });
  assert.equal(empty?.clientId, null);
  assert.equal(empty?.channels.every((row) => row.status === "Not connected yet"), true);
  assert.equal(JSON.stringify(emptyAudiencePayload()).toLowerCase().includes("example data"), false);
});

test("production jarvis pages consult the switch before example clients", () => {
  const home = readFileSync(path.join(ROOT, "app/(app)/app/page.tsx"), "utf8");
  const layout = readFileSync(path.join(ROOT, "app/(app)/layout.tsx"), "utf8");
  const channel = readFileSync(path.join(ROOT, "app/(app)/c/[...slug]/page.tsx"), "utf8");
  const audience = readFileSync(path.join(ROOT, "app/(app)/audience-data/page.tsx"), "utf8");
  const homeBody = home.slice(home.indexOf("export default"));
  const layoutBody = layout.slice(layout.indexOf("export default"));
  assert.ok(homeBody.indexOf("marketingClientSwitcherEnabled") < homeBody.indexOf("exampleRegistryState"));
  assert.ok(layoutBody.indexOf("loadRealClientChoices") < layoutBody.indexOf("exampleRegistryState"));
  assert.match(channel, /loadRealHome/);
  assert.match(channel, /marketingClientSwitcherEnabled/);
  assert.match(audience, /No data yet/);
  assert.match(home, /RealHome/);
});

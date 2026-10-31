import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { collectsCostKeys } from "./cost-strip";
import { jarvisNav } from "./nav";
import { forbiddenClientKeys } from "../client-view";
import { channelRegistryEnabled } from "../config";
import { readLinkedInSample } from "../connectors/linkedin-client";
import {
  SEED_CONNECTIONS,
  SEED_REGISTRY,
  applyConnectionTest,
  approvePlatformWrites,
  capabilityCheck,
  connectionFor,
  decidePlatformRequest,
  disconnectConnection,
  exampleRegistryState,
  filterCatalog,
  handleChannelRegistryHttp,
  platformByKey,
  presentCatalog,
  presentClientChannels,
  projectSurfaces,
  recommendBudgetChange,
  runConnectionTest,
  submitPlatformRequest,
  overlayStaffReport,
  type PlatformRegistryRow,
} from "./registry";

const ROOT = path.resolve(import.meta.dirname, "../../..");

const staff = { kind: "super_admin", role: "super_admin", email: "jason@specificityinc.example", name: "Jason", seesCost: true };
const manager = { kind: "account_manager", role: "account_manager", email: "dana@specificityinc.example", name: "Dana", seesCost: true };
const otherStaff = { kind: "staff", role: "admin", email: "ada@specificityinc.example", name: "Ada", seesCost: false };
const client = { kind: "client_owner", role: "owner", email: "owner@harbor.example", name: "Harbor Owner", seesCost: false };
const viewer = { kind: "client_viewer", role: "client_viewer", email: "view@harbor.example", name: "Viewer", seesCost: false };

function linkedin() {
  const row = SEED_REGISTRY.find((item) => item.key === "linkedin");
  assert.ok(row);
  return row;
}

test("CHANNEL_REGISTRY defaults off", () => {
  assert.equal(channelRegistryEnabled({}), false);
  assert.equal(channelRegistryEnabled({ CHANNEL_REGISTRY: "off" }), false);
  assert.equal(channelRegistryEnabled({ CHANNEL_REGISTRY: "on" }), true);
  const example = readFileSync(path.join(ROOT, ".env.example"), "utf8");
  assert.match(example, /CHANNEL_REGISTRY=off/);
  const nav = jarvisNav({ audience: "staff", showAis2l: false, decisionCount: 0, showLive: false });
  assert.deepEqual(
    nav.filter((item) => item.group === "Channels").map((item) => item.label),
    ["Meta", "Google Ads", "StackAdapt", "Google Business Profile"],
  );
  const clientNav = jarvisNav({ audience: "client", showAis2l: false, decisionCount: 1, showLive: false });
  assert.equal(clientNav.some((item) => item.group === "Channels"), false);
});

test("LinkedIn is seeded read-only and writes stay off", () => {
  const row = linkedin();
  assert.equal(row.staffLabel, "LinkedIn");
  assert.equal(row.clientLabel, "LinkedIn ads");
  assert.equal(row.channelType, "social");
  assert.equal(row.vendor, "LinkedIn");
  assert.equal(row.auth, "oauth");
  assert.deepEqual(row.idUpload, { maid: false, email: true, phone: true, ipv4: false, ipv6: false });
  assert.equal(row.matchRateSource, "linkedin_matched_audiences");
  assert.deepEqual(row.metrics, ["leads", "lead_form_fills", "ctr"]);
  assert.equal(row.hierarchy, "Campaign group > Campaign > Ad");
  assert.equal(row.colourToken, "#B33E00");
  assert.equal(row.writesEnabled, false);
  assert.equal(row.contracted, false);
  for (const item of SEED_REGISTRY) assert.equal(item.writesEnabled, false, item.key);
  for (const item of SEED_CONNECTIONS) assert.equal(item.writesEnabled, false, item.platformKey);
  const state = exampleRegistryState();
  const blocked = approvePlatformWrites(state, { name: "Brittany", email: "brittany@specificityinc.example" }, "linkedin");
  assert.equal(blocked.ok, false);
  assert.equal(platformByKey(blocked.state, "linkedin")?.writesEnabled, false);
  const approved = approvePlatformWrites(state, { name: "Jason", email: "jason@specificityinc.example" }, "linkedin");
  assert.equal(approved.ok, true);
  assert.equal(platformByKey(approved.state, "linkedin")?.writesEnabled, true);
  assert.equal(approved.state.connections.every((item) => item.writesEnabled === false), true);
  assert.equal(approved.state.approvals[0]?.approver, "jason@specificityinc.example");
  assert.equal(recommendBudgetChange({ platformKey: "linkedin", note: "Lower the daily recommendation." }).executes, false);
});

test("clients never see vendor, cost, or catalog endpoints", () => {
  const state = exampleRegistryState();
  const harbor = presentClientChannels(state, "harbor");
  const json = JSON.stringify(harbor);
  assert.equal(json.toLowerCase().includes("stackadapt"), false);
  assert.equal(json.toLowerCase().includes("gohighlevel"), false);
  assert.equal(json.includes("vendor"), false);
  assert.equal(json.includes("LinkedIn"), false);
  assert.equal(collectsCostKeys(harbor).length, 0);
  assert.equal(forbiddenClientKeys(harbor).length, 0);
  assert.equal(harbor.channels.some((row) => row.label === "Connected TV ads"), true);
  assert.equal(harbor.channels.some((row) => row.label === "Facebook & Instagram ads"), true);
  const gulf = presentClientChannels(state, "gulf");
  assert.equal(gulf.channels.length, 0);
  const owned = structuredClone(state);
  owned.connections.push({
    clientId: "gulf",
    platformKey: "linkedin",
    accountId: "act_gulf",
    state: "connected",
    lastTestAt: null,
    lastSyncAt: null,
    tokenRef: null,
    writesEnabled: false,
    disconnectedAt: null,
  });
  assert.equal(presentClientChannels(owned, "gulf").channels.some((row) => row.label === "LinkedIn ads"), true);
  assert.equal(presentClientChannels(owned, "harbor").channels.some((row) => row.label === "LinkedIn ads"), false);
  for (const actor of [client, viewer]) {
    const response = handleChannelRegistryHttp({ method: "GET", enabled: true, actor, state });
    assert.equal(response.status, 403);
    assert.equal(JSON.stringify(response.body).toLowerCase().includes("stackadapt"), false);
    assert.equal(JSON.stringify(response.body).includes("vendor"), false);
  }
  const denied = handleChannelRegistryHttp({ method: "POST", enabled: true, actor: client, body: { action: "decide", id: "x", decision: "approve" }, state });
  assert.equal(denied.status, 403);
  const source = readFileSync(path.join(ROOT, "lib/marketing/channels/registry.ts"), "utf8");
  assert.match(source, /stripForAudience/);
  assert.match(source, /omitForbiddenClientFields/);
});

test("the catalog lists every non-hidden platform, including ones with no contract", () => {
  const state = exampleRegistryState();
  const cards = presentCatalog(state, "harbor");
  assert.equal(cards.some((card) => card.key === "internal_probe"), false);
  const linked = cards.find((card) => card.key === "linkedin");
  assert.ok(linked);
  assert.equal(linked.contracted, false);
  assert.equal(linked.status, "Added needs setup");
  const loose: PlatformRegistryRow = {
    ...linkedin(),
    key: "reddit",
    staffLabel: "Reddit",
    clientLabel: "Reddit ads",
    vendor: "Reddit",
    contracted: false,
    status: "available",
    parentKey: null,
    matchRateSource: null,
  };
  const withLoose = presentCatalog({ ...state, registry: [...state.registry, loose] }, "harbor");
  const reddit = withLoose.find((card) => card.key === "reddit");
  assert.ok(reddit);
  assert.equal(reddit.status, "Not connected");
  assert.equal(reddit.contracted, false);
  const hidden = filterCatalog(cards, { showConnected: false });
  assert.equal(hidden.some((card) => card.status === "Connected"), false);
  assert.equal(hidden.some((card) => card.key === "linkedin"), true);
  assert.equal(filterCatalog(cards, { query: "connected tv", showConnected: true }).some((card) => card.key === "ctv"), true);
  const opened = handleChannelRegistryHttp({ method: "GET", enabled: true, actor: staff, state });
  assert.equal(opened.status, 200);
  assert.match(JSON.stringify(opened.body), /stackadapt/);
  const off = handleChannelRegistryHttp({ method: "GET", enabled: false, actor: staff, state });
  assert.equal(off.status, 404);
});

test("only a super admin can approve or decline an unlisted platform", () => {
  const state = exampleRegistryState();
  const queued = submitPlatformRequest(state, { name: "Pinterest", category: "social", clientId: "harbor", why: "The client asked", id: "req-pin", docsLink: "https://example.com/docs" });
  assert.equal(queued.ok, true);
  assert.equal(queued.externalSend, false);
  assert.equal(queued.request?.status, "queued");
  const badDocs = submitPlatformRequest(state, { name: "Snap", category: "social", clientId: "harbor", why: "Need it", docsLink: "not a url" });
  assert.equal(badDocs.ok, false);
  for (const actor of [manager, otherStaff, client]) {
    const response = handleChannelRegistryHttp({
      method: "POST",
      enabled: true,
      actor,
      body: { action: "decide", id: "req-pin", decision: "approve" },
      state: queued.state,
    });
    assert.equal(response.status, 403, actor.kind);
    assert.equal(presentCatalog(response.state, "harbor").some((card) => card.name === "Pinterest"), false);
  }
  const approved = handleChannelRegistryHttp({
    method: "POST",
    enabled: true,
    actor: { ...staff, name: "Brittany", email: "brittany@specificityinc.example" },
    body: { action: "decide", id: "req-pin", decision: "approve" },
    state: queued.state,
  });
  assert.equal(approved.status, 200);
  const pin = presentCatalog(approved.state, "harbor").find((card) => card.name === "Pinterest");
  assert.ok(pin);
  assert.equal(pin.contracted, false);
  assert.equal(pin.status, "Not connected");
  assert.equal(presentClientChannels(approved.state, "harbor").channels.some((row) => row.label === "Pinterest ads"), false);
  const declinedRequest = submitPlatformRequest(state, { name: "Snapchat", category: "social", clientId: "harbor", why: "Later", id: "req-snap" });
  const declined = decidePlatformRequest(declinedRequest.state, staff, { id: "req-snap", decision: "decline" });
  assert.equal(declined.status, 200);
  assert.equal(presentCatalog(declined.state, "harbor").some((card) => card.name === "Snapchat"), false);
  const closed = handleChannelRegistryHttp({
    method: "POST",
    enabled: false,
    actor: staff,
    body: { action: "decide", id: "req-pin", decision: "approve" },
    state: queued.state,
  });
  assert.equal(closed.status, 404);
});

test("a new registry row shows on every surface without a per-platform branch", () => {
  const state = exampleRegistryState();
  const extra: PlatformRegistryRow = {
    ...linkedin(),
    key: "nextdoor",
    staffLabel: "Nextdoor",
    clientLabel: "Nextdoor ads",
    vendor: "Nextdoor",
    channelType: "social",
    parentKey: null,
    contracted: false,
    status: "available",
    matchRateSource: "nextdoor_match",
    writesEnabled: false,
    aliases: ["nd"],
  };
  const next = {
    ...state,
    registry: [...state.registry, extra],
    connections: [...state.connections, {
      clientId: "harbor",
      platformKey: "nextdoor",
      accountId: "act_harbor",
      state: "connected" as const,
      lastTestAt: null,
      lastSyncAt: null,
      tokenRef: null,
      writesEnabled: false,
      disconnectedAt: null,
    }],
    matchRates: { ...state.matchRates, nextdoor: 0.44 },
  };
  const surfaces = projectSurfaces(next, { audience: "staff", clientId: "harbor" });
  assert.equal(surfaces.nav.some((item) => item.label === "Nextdoor"), true);
  assert.equal(surfaces.settings.rows.some((item) => item.label === "Nextdoor"), true);
  const rows = [...surfaces.commandCenter.main, ...surfaces.commandCenter.more];
  assert.equal(rows.some((item) => item.name === "Nextdoor"), true);
  assert.equal(surfaces.audience.lines.some((item) => item.label === "Nextdoor"), true);
  assert.equal(surfaces.resolution.rows.some((item) => item.label === "Nextdoor"), true);
  assert.match(surfaces.report.blended, /Nextdoor/);
  assert.equal(surfaces.report.channels.some((item) => item.staffName === "Nextdoor" && item.clientName === "Nextdoor ads"), true);
  const seen = presentClientChannels(next, "harbor");
  assert.equal(seen.channels.some((item) => item.label === "Nextdoor ads"), true);
  assert.equal(JSON.stringify(seen).includes("vendor"), false);
  const source = readFileSync(path.join(ROOT, "lib/marketing/channels/registry.ts"), "utf8");
  assert.equal(source.includes('key === "nextdoor"'), false);
  const linked = jarvisNav({
    audience: "staff",
    showAis2l: false,
    decisionCount: 1,
    showLive: false,
    channelLinks: surfaces.nav,
  });
  assert.equal(linked.some((item) => item.label === "Nextdoor"), true);
});

test("settings health, LinkedIn setup, and the on-hold denominator", () => {
  const surfaces = projectSurfaces(exampleRegistryState(), { audience: "staff", clientId: "harbor" });
  assert.equal(surfaces.settings.headline, "7 of 9 connections are healthy. LinkedIn and conversion feedback need setup.");
  assert.equal(surfaces.commandCenter.moreLabel, "More channels (3)");
  const linkedinRow = surfaces.commandCenter.more.find((row) => row.key === "linkedin");
  assert.ok(linkedinRow);
  assert.equal(linkedinRow.spend, "—");
  assert.equal(linkedinRow.leads, "—");
  assert.equal(linkedinRow.cpl, "—");
  assert.equal(linkedinRow.status, "Needs setup");
  assert.equal(surfaces.audience.onHoldLabel, "1 of 5");
  assert.equal(surfaces.audience.held, 1);
  assert.equal(surfaces.audience.total, 5);
  const line = surfaces.audience.lines.find((item) => item.key === "linkedin");
  assert.equal(line?.text, "Not connected yet");
  assert.equal(line?.counted, false);
  const report = overlayStaffReport({
    subhead: "Oct 1–30 vs Sep 1–30 · Blended across Meta",
    flags: [],
    channels: [],
  });
  assert.match(report.subhead, /Blended across Meta, Google Ads/);
  assert.equal(report.flags.some((flag) => flag.title === "LinkedIn added, needs setup"), true);
  const cap = capabilityCheck(linkedin());
  assert.equal(cap.items.find((item) => item.name === "MAID upload")?.result, "not supported");
  assert.equal(cap.items.find((item) => item.name === "Hashed email and phone upload")?.result, "supported");
  assert.equal(cap.items.find((item) => item.name === "IPv4 and IPv6 household upload")?.result, "not supported");
  assert.equal(cap.items.find((item) => item.name === "Writes")?.result, "partial");
  assert.match(cap.matchNote, /Match rate/);
});

test("connection tests stay mocked and a failure saves nothing", async () => {
  let called = false;
  const sample = await readLinkedInSample({
    env: { INTEGRATIONS_MODE: "mock" },
    fetchImpl: () => {
      called = true;
      throw new Error("network");
    },
  });
  assert.equal(called, false);
  assert.equal(sample.readOnly, true);
  const source = readFileSync(path.join(ROOT, "lib/marketing/channels/registry.ts"), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.match(readFileSync(path.join(ROOT, "lib/marketing/connectors/linkedin-client.ts"), "utf8"), /assertNoAdBudgetWrite/);
  assert.match(readFileSync(path.join(ROOT, "lib/marketing/channels/registry-store.ts"), "utf8"), /isolatedWhere/);
  const state = exampleRegistryState();
  const secret = "super-secret-token";
  const failed = applyConnectionTest(state, { clientId: "harbor", platformKey: "linkedin", accountId: "act_harbor", secret, outcome: "error" }, { INTEGRATIONS_MODE: "mock" });
  assert.equal(failed.result?.saved, false);
  assert.equal(failed.state, state);
  assert.equal(connectionFor(state, "harbor", "linkedin")?.state, "needs_setup");
  assert.equal(JSON.stringify(state).includes(secret), false);
  const limited = runConnectionTest({ platformKey: "linkedin", outcome: "rate_limited" }, { INTEGRATIONS_MODE: "mock" });
  assert.match(limited.retry || "", /retry automatically/);
  assert.equal(limited.saved, false);
  const saved = applyConnectionTest(state, { clientId: "harbor", platformKey: "linkedin", accountId: "act_harbor", secret, outcome: "success" }, { INTEGRATIONS_MODE: "mock" });
  assert.equal(saved.result?.saved, true);
  assert.equal(saved.result?.access, "Read only");
  assert.match(saved.result?.sync || "", /first full sync within 24 h/);
  const linked = connectionFor(saved.state, "harbor", "linkedin");
  assert.equal(linked?.state, "connected");
  assert.equal(linked?.writesEnabled, false);
  assert.equal(String(linked?.tokenRef).includes(secret), false);
  assert.match(linked?.tokenRef || "", /^v1\./);
  const expired = applyConnectionTest(saved.state, { clientId: "harbor", platformKey: "linkedin", accountId: "act_harbor", outcome: "token_expired" }, { INTEGRATIONS_MODE: "mock" });
  assert.equal(connectionFor(expired.state, "harbor", "linkedin")?.state, "needs_reconnect");
  const wrong = disconnectConnection(saved.state, { clientId: "harbor", platformKey: "linkedin", confirmName: "linkedin", dateLabel: "Oct 31, 2026" });
  assert.equal(wrong.ok, false);
  const gone = disconnectConnection(saved.state, { clientId: "harbor", platformKey: "linkedin", confirmName: "LinkedIn", dateLabel: "Oct 31, 2026" });
  assert.equal(gone.ok, true);
  assert.equal(connectionFor(gone.state, "harbor", "linkedin")?.tokenRef, null);
  assert.equal(connectionFor(gone.state, "harbor", "linkedin")?.disconnectedAt, "Oct 31, 2026");
  const after = projectSurfaces(gone.state, { audience: "staff", clientId: "harbor" });
  assert.equal(after.audience.lines.some((line) => line.key === "linkedin"), false);
  assert.equal(after.resolution.rows.some((line) => line.key === "linkedin"), false);
  assert.equal(presentClientChannels(gone.state, "harbor").channels.some((row) => row.label === "LinkedIn ads"), false);
});

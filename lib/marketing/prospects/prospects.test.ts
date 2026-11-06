import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { jarvisNav } from "../channels/nav";
import { decideProspectSync } from "../config";
import { clientViewerAllowed } from "../client-gate";
import { apolloRequest, assertApolloRead, mapApolloContact } from "./apollo";
import { connectionNameOf, extraKeyEnv, planNamedKeyConnections } from "./connections";
import { ProspectWriteBlockedError } from "./guard";
import { presentProspect, prospectEmptyState, stripProspectCost, canOpenProspects } from "./present";
import { probeKey, publicProbeLine } from "./probe";
import { assertProspectSyncWorkspace, prospectReadWhere, prospectsInWorkspace } from "./query";
import { assignPulledProspects, planApolloPulls, planTraxyPulls, type ApolloScopeClient, type TraxyScopeClient } from "./scope";
import { mockProspectDraft, persistProspectDrafts, runApolloSync, runTraxySync, type ProspectStore } from "./sync";
import { assertTraxyRead, mapTraxyLead, traxyCountTotal, traxyLeadsUrl, traxyRequest } from "./traxy";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const PROFILE_A = "00000000-0000-4000-8000-000000000011";
const PROFILE_B = "00000000-0000-4000-8000-000000000022";
const LEAD_A = "00000000-0000-4000-8000-0000000000a1";
const LEAD_B = "00000000-0000-4000-8000-0000000000b2";
const LIST_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const LIST_B = "bbbbbbbbbbbbbbbbbbbbbbbb";
const KEY = "super-secret-key";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

function traxyClient(id: string, extra: Partial<TraxyScopeClient> = {}): TraxyScopeClient {
  return {
    id,
    traxyLiveRead: true,
    traxyConnectionName: "",
    traxyMonitoredProfileIds: [],
    traxyLeadTiers: [],
    traxyMinIcpMatchPercent: null,
    ...extra,
  };
}

function apolloClient(id: string, extra: Partial<ApolloScopeClient> = {}): ApolloScopeClient {
  return {
    id,
    apolloLiveRead: true,
    apolloConnectionName: "",
    apolloListIds: [],
    apolloSavedSearchIds: [],
    ...extra,
  };
}

function traxyLead(id: string) {
  return {
    id,
    icpMatchPercent: 81,
    intentScore: 0.4,
    leadTier: "QUALIFIED",
    authorization: KEY,
    profile: {
      displayName: "Casey North",
      headline: "Operations lead",
      location: "Austin, TX",
      currentCompany: "Harbor Point Marine",
      profileUrl: "https://example.test/in/casey-north",
    },
    contact: { workEmail: "casey.north@example.test", personalEmail: null, contactPhone: "+15555550100" },
    signal: { summary: "Asked about a demo", occurredAt: "2026-11-01T15:00:00.000Z" },
  };
}

function memoryStore() {
  const rows = new Map<string, { id: string; clientId: string; workspaceId: string; firstSeenAt: Date; lastSeenAt: Date }>();
  let seq = 0;
  const store: ProspectStore = {
    async find(key) {
      const row = rows.get(`${key.workspaceId}:${key.source}:${key.externalId}`);
      return row ? { id: row.id, clientId: row.clientId, firstSeenAt: row.firstSeenAt, lastSeenAt: row.lastSeenAt } : null;
    },
    async create(row) {
      rows.set(`${row.workspaceId}:${row.source}:${row.externalId}`, {
        id: `row-${seq += 1}`,
        clientId: row.clientId,
        workspaceId: row.workspaceId,
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
      });
    },
    async update(id, row) {
      for (const [key, existing] of rows) {
        if (existing.id === id) rows.set(key, { ...existing, firstSeenAt: row.firstSeenAt, lastSeenAt: row.lastSeenAt });
      }
    },
  };
  return { store, rows };
}

test("write and reveal calls never reach the network", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse({});
  };
  assert.throws(() => assertTraxyRead({ method: "POST", url: "https://api.traxy.ai/api/v1/customer/leads" }), ProspectWriteBlockedError);
  assert.throws(() => assertTraxyRead({ method: "GET", url: "https://api.traxy.ai/api/v1/customer/leads?organizationId=other" }), /workspace/i);
  assert.throws(() => assertTraxyRead({ method: "GET", url: "https://api.traxy.ai/api/v1/customer/leads?workspaceId=other" }), ProspectWriteBlockedError);
  assert.throws(() => assertApolloRead({ method: "DELETE", url: "https://api.apollo.io/api/v1/contacts/aaaaaaaaaaaaaaaaaaaaaaaa" }), ProspectWriteBlockedError);
  await assert.rejects(() => apolloRequest({ method: "POST", url: "https://api.apollo.io/api/v1/people/match", apiKey: KEY, body: { reveal_personal_emails: true }, fetchImpl }), (error: unknown) => {
    assert.equal(error instanceof ProspectWriteBlockedError, true);
    assert.equal(error instanceof Error && error.message.includes(KEY), false);
    return true;
  });
  await assert.rejects(() => apolloRequest({ method: "POST", url: "https://api.apollo.io/api/v1/contacts", apiKey: KEY, body: { first_name: "Casey" }, fetchImpl }));
  await assert.rejects(() => apolloRequest({
    method: "POST",
    url: "https://api.apollo.io/api/v1/contacts/search",
    apiKey: KEY,
    body: { contact_label_ids: [LIST_A], reveal_phone_number: true },
    fetchImpl,
  }));
  await assert.rejects(() => apolloRequest({
    method: "POST",
    url: "https://api.apollo.io/api/v1/emailer_campaigns/add",
    apiKey: KEY,
    body: {},
    fetchImpl,
  }));
  await assert.rejects(() => traxyRequest({ apiKey: KEY, url: "https://api.traxy.ai/api/v1/webhooks", fetchImpl }));
  assert.equal(calls, 0);
  const allowed = traxyLeadsUrl({ monitoredProfileIds: [PROFILE_A], leadTiers: ["QUALIFIED"], minIcpMatchPercent: 70 });
  assert.equal(allowed.includes("organizationId"), false);
  assert.equal(allowed.includes("workspaceId"), false);
  await traxyRequest({
    apiKey: KEY,
    url: allowed,
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({ data: [], page: { nextCursor: null } });
    },
  });
  assert.equal(calls, 1);
});

test("extra connection names map to their own keys", () => {
  const traxy = planNamedKeyConnections(
    { TRAXY_EXTRA_CONNECTIONS: "befound", TRAXY_API_KEY: "primary-key-value", TRAXY_BEFOUND_API_KEY: "befound-key-value" },
    { listEnv: "TRAXY_EXTRA_CONNECTIONS", primaryEnv: "TRAXY_API_KEY", prefix: "TRAXY" },
  );
  assert.deepEqual(traxy.connections.map((row) => [row.name, row.apiKeyEnv, row.apiKey]), [
    ["primary", "TRAXY_API_KEY", "primary-key-value"],
    ["befound", "TRAXY_BEFOUND_API_KEY", "befound-key-value"],
  ]);
  assert.equal(extraKeyEnv("TRAXY", "befound"), "TRAXY_BEFOUND_API_KEY");
  const missing = planNamedKeyConnections(
    { TRAXY_EXTRA_CONNECTIONS: "BeFound, not a name", TRAXY_API_KEY: "primary-key-value" },
    { listEnv: "TRAXY_EXTRA_CONNECTIONS", primaryEnv: "TRAXY_API_KEY", prefix: "TRAXY" },
  );
  assert.deepEqual(missing.connections.map((row) => row.name), ["primary"]);
  assert.match(missing.skipped.map((row) => row.reason).join(" "), /TRAXY_BEFOUND_API_KEY/);
  assert.equal(missing.skipped.some((row) => row.reason.includes("primary-key-value")), false);
  const apollo = planNamedKeyConnections(
    { APOLLO_EXTRA_CONNECTIONS: "befound", APOLLO_API_KEY: "primary-apollo", APOLLO_BEFOUND_API_KEY: "befound-apollo" },
    { listEnv: "APOLLO_EXTRA_CONNECTIONS", primaryEnv: "APOLLO_API_KEY", prefix: "APOLLO" },
  );
  assert.equal(apollo.connections[1]?.apiKeyEnv, "APOLLO_BEFOUND_API_KEY");
  assert.equal(apollo.connections[1]?.apiKey, "befound-apollo");
  assert.equal(connectionNameOf(""), "primary");
  assert.equal(connectionNameOf("BeFound"), "befound");
});

test("TRAXY_SYNC and APOLLO_SYNC default off and ignore INTEGRATIONS_MODE", () => {
  assert.deepEqual(decideProspectSync({}, "TRAXY_SYNC"), { action: "skip", reason: "TRAXY_SYNC is off" });
  assert.deepEqual(decideProspectSync({ APOLLO_SYNC: "off", INTEGRATIONS_MODE: "live" }, "APOLLO_SYNC"), { action: "skip", reason: "APOLLO_SYNC is off" });
  assert.equal(decideProspectSync({ TRAXY_SYNC: "on", INTEGRATIONS_MODE: "mock", MARKETING_SYNC_MODE: "auto" }, "TRAXY_SYNC").action, "live");
  assert.equal(decideProspectSync({ TRAXY_SYNC: "on", INTEGRATIONS_MODE: "live", MARKETING_SYNC_MODE: "mock" }, "TRAXY_SYNC").action, "mock");
  assert.equal(decideProspectSync({ APOLLO_SYNC: "on", MARKETING_SYNC_MODE: "off" }, "APOLLO_SYNC").action, "skip");
  const closed = probeKey({ TRAXY_SYNC: "on", MARKETING_SYNC_MODE: "mock", TRAXY_API_KEY: KEY }, "traxy", "primary");
  assert.deepEqual(closed, { ok: false, reason: "MARKETING_SYNC_MODE=mock" });
});

test("live read off pulls nothing, and client A never receives client B", async () => {
  let calls = 0;
  const closed = await runTraxySync({
    env: { TRAXY_SYNC: "on", MARKETING_SYNC_MODE: "live", TRAXY_API_KEY: KEY, INTEGRATIONS_MODE: "mock" },
    clients: [traxyClient("a", { traxyLiveRead: false, traxyMonitoredProfileIds: [PROFILE_A] })],
    fetchImpl: async () => {
      calls += 1;
      throw new Error("network");
    },
  });
  assert.equal(closed.status, "skipped");
  assert.equal(calls, 0);

  const { store, rows } = memoryStore();
  const synced = await runTraxySync({
    env: { TRAXY_SYNC: "on", MARKETING_SYNC_MODE: "live", TRAXY_API_KEY: KEY, INTEGRATIONS_MODE: "live" },
    clients: [
      traxyClient("client-a", { traxyMonitoredProfileIds: [PROFILE_A] }),
      traxyClient("client-b", { traxyMonitoredProfileIds: [PROFILE_B] }),
    ],
    store,
    fetchImpl: async (url) => {
      calls += 1;
      const id = String(url).includes(PROFILE_A) ? LEAD_A : LEAD_B;
      assert.equal(String(url).includes("organizationId"), false);
      return jsonResponse({ data: [traxyLead(id)], page: { limit: 100, nextCursor: null } });
    },
  });
  assert.equal(synced.status, "succeeded");
  assert.equal(calls, 2);
  assert.equal(rows.size, 2);
  assert.equal([...rows.values()].find((row) => row.id.endsWith("1"))?.clientId, "client-a");
  const owners = [...rows.values()].map((row) => row.clientId).sort();
  assert.deepEqual(owners, ["client-a", "client-b"]);

  const overlap = await runTraxySync({
    env: { TRAXY_SYNC: "on", MARKETING_SYNC_MODE: "auto", TRAXY_API_KEY: KEY },
    clients: [
      traxyClient("client-a", { traxyMonitoredProfileIds: [PROFILE_A] }),
      traxyClient("client-b", { traxyMonitoredProfileIds: [PROFILE_B] }),
    ],
    store: memoryStore().store,
    fetchImpl: async () => jsonResponse({ data: [traxyLead(LEAD_A)], page: { nextCursor: null } }),
  });
  assert.equal(overlap.written, 0);
  assert.equal(overlap.conflicts, 1);
});

test("the same external id is not moved onto another client", async () => {
  const { store, rows } = memoryStore();
  const now = new Date("2026-11-01T15:00:00.000Z");
  const first = mockProspectDraft("apollo", "client-a", now);
  await persistProspectDrafts(store, [first]);
  const moved = await persistProspectDrafts(store, [{ ...first, clientId: "client-b" }]);
  assert.equal(moved.conflicts, 1);
  assert.equal(moved.written, 0);
  assert.equal([...rows.values()][0]?.clientId, "client-a");
  await assert.rejects(() => persistProspectDrafts(store, [{ ...first, workspaceId: "demo" }]));
  assert.equal(rows.size, 1);
});

test("client scoping refuses shared unfiltered connections and live-read stays off", () => {
  const off = planTraxyPulls([traxyClient("a", { traxyLiveRead: false })], ["primary"]);
  assert.equal(off.pulls.length, 0);
  assert.match(off.skipped[0]?.reason || "", /live read is off/i);
  const shared = planTraxyPulls([traxyClient("a"), traxyClient("b")], ["primary"]);
  assert.equal(shared.pulls.length, 0);
  const split = planTraxyPulls([
    traxyClient("a", { traxyMonitoredProfileIds: [PROFILE_A] }),
    traxyClient("b", { traxyConnectionName: "befound", traxyMonitoredProfileIds: [PROFILE_B] }),
  ], ["primary", "befound"]);
  assert.deepEqual(split.pulls.map((pull) => pull.connectionName).sort(), ["befound", "primary"]);
  const apolloShared = planApolloPulls([
    apolloClient("a", { apolloListIds: [LIST_A] }),
    apolloClient("b", { apolloListIds: [LIST_A] }),
  ], ["primary"]);
  assert.equal(apolloShared.pulls.length, 0);
  const savedOnly = planApolloPulls([
    apolloClient("a"),
    apolloClient("b", { apolloSavedSearchIds: [LIST_B] }),
  ], ["primary"]);
  assert.equal(savedOnly.pulls.length, 0);
  const lists = planApolloPulls([
    apolloClient("a", { apolloLiveRead: false, apolloListIds: [LIST_A] }),
    apolloClient("b", { apolloConnectionName: "befound", apolloListIds: [LIST_B] }),
  ], ["befound"]);
  assert.deepEqual(lists.pulls.map((pull) => pull.clientId), ["b"]);
  const assigned = assignPulledProspects([
    { clientId: "a", people: [{ externalId: "one" }, { externalId: "shared" }] },
    { clientId: "b", people: [{ externalId: "two" }, { externalId: "shared" }] },
  ]);
  assert.deepEqual(assigned.conflicts, ["shared"]);
  assert.deepEqual(assigned.kept.map((row) => row.clientId).sort(), ["a", "b"]);
});

test("mock mode writes a fixture and does not call the network", async () => {
  let calls = 0;
  const { store, rows } = memoryStore();
  const result = await runApolloSync({
    env: { APOLLO_SYNC: "on", MARKETING_SYNC_MODE: "mock", INTEGRATIONS_MODE: "live", APOLLO_EXTRA_CONNECTIONS: "befound" },
    clients: [apolloClient("client-a", { apolloConnectionName: "befound", apolloListIds: [LIST_A] })],
    store,
    fetchImpl: async () => {
      calls += 1;
      throw new Error("network");
    },
  });
  assert.equal(calls, 0);
  assert.equal(result.status, "succeeded");
  assert.equal(result.requests, 0);
  const row = [...rows.values()][0];
  assert.equal(row?.workspaceId, "org");
  assert.equal(row?.clientId, "client-a");
  const fixture = mockProspectDraft("traxy", "client-a", new Date("2026-11-02T00:00:00.000Z"));
  assert.match(fixture.emails[0] || "", /@example\.test$/);
  assert.equal(fixture.workspaceId, "org");
});

test("apollo contacts keep the mapped client and refuse an unfiltered people search", async () => {
  const mapped = mapApolloContact({
    id: LIST_A,
    name: "Casey North",
    title: "Operations lead",
    organization_name: "Harbor Point Marine",
    email: "casey.north@example.test",
    linkedin_url: "https://example.test/in/casey-north",
    created_at: "2026-11-01T15:00:00.000Z",
    api_key: KEY,
  });
  assert.equal(mapped?.displayName, "Casey North");
  assert.equal(JSON.stringify(mapped?.raw).includes(KEY), false);
  let calls = 0;
  await assert.rejects(() => apolloRequest({
    method: "POST",
    url: "https://api.apollo.io/api/v1/mixed_people/api_search",
    apiKey: KEY,
    body: { page: 1, per_page: 10 },
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({});
    },
  }));
  assert.equal(calls, 0);
  const { store } = memoryStore();
  const synced = await runApolloSync({
    env: { APOLLO_SYNC: "on", MARKETING_SYNC_MODE: "live", APOLLO_BEFOUND_API_KEY: KEY, APOLLO_EXTRA_CONNECTIONS: "befound" },
    clients: [apolloClient("client-b", { apolloConnectionName: "befound", apolloListIds: [LIST_B], apolloLiveRead: true })],
    store,
    fetchImpl: async (_url, init) => {
      calls += 1;
      const body = JSON.parse(String(init?.body || "{}")) as { contact_label_ids?: string[] };
      assert.deepEqual(body.contact_label_ids, [LIST_B]);
      assert.equal(JSON.stringify(body).includes("reveal"), false);
      return jsonResponse({
        contacts: [{ id: LIST_B, name: "Casey North", organization_name: "Harbor Point Marine", created_at: "2026-11-03T00:00:00.000Z" }],
        pagination: { total_entries: 1, total_pages: 1 },
      });
    },
  });
  assert.equal(synced.written, 1);
  assert.ok(calls >= 1);
});

test("spend fields stay off the prospect view and contacts stay off client and share views", () => {
  const input = {
    id: "p1",
    clientId: "client-a",
    source: "traxy",
    displayName: "Casey North",
    company: "Harbor Point Marine",
    icpMatchPercent: 81,
    emails: ["casey.north@example.test"],
    phones: ["+15555550100"],
    profileUrl: "https://example.test/in/casey-north",
    spend: 12,
    cpa: 4,
    budget: 9,
    raw: { cost: 5, roas: 2 },
  };
  const client = presentProspect(input, "client");
  const share = presentProspect(input, "share");
  const staff = presentProspect(input, "staff");
  for (const view of [client, share, staff]) {
    const encoded = JSON.stringify(view);
    assert.equal(encoded.includes("spend"), false);
    assert.equal(encoded.includes("cpa"), false);
    assert.equal(encoded.includes("budget"), false);
    assert.equal(encoded.includes("\"cost\""), false);
    assert.equal(encoded.includes("roas"), false);
    assert.equal(view.icpMatchPercent, 81);
    assert.equal(view.company, "Harbor Point Marine");
  }
  assert.deepEqual(client.emails, []);
  assert.deepEqual(share.phones, []);
  assert.equal(share.profileUrl, "");
  assert.deepEqual(staff.emails, ["casey.north@example.test"]);
  const stripped = stripProspectCost({ icpMatchPercent: 70, spend: 1, nested: { cpl: 2, company: "Harbor" } }) as { icpMatchPercent: number; nested: { company: string } };
  assert.equal(stripped.icpMatchPercent, 70);
  assert.equal("spend" in (stripped as object), false);
  assert.equal(stripped.nested.company, "Harbor");
  assert.equal("cpl" in stripped.nested, false);
});

test("demo prospects never mix with the deployment workspace", () => {
  assert.deepEqual(prospectReadWhere("org"), { workspaceId: "org" });
  assert.deepEqual(prospectReadWhere("demo", { source: "traxy" }), { source: "traxy", workspaceId: "demo" });
  assert.throws(() => prospectReadWhere("org", { workspaceId: "demo" }));
  assert.throws(() => assertProspectSyncWorkspace("demo"));
  assert.deepEqual(assertProspectSyncWorkspace("org"), { workspaceId: "org" });
  const rows = [
    { workspaceId: "org", clientId: "client-a", name: "real" },
    { workspaceId: "demo", clientId: "client-a", name: "demo" },
    { workspaceId: "org", clientId: "client-b", name: "other" },
  ];
  assert.deepEqual(prospectsInWorkspace(rows, "org", "client-a").map((row) => row.name), ["real"]);
  assert.deepEqual(prospectsInWorkspace(rows, "demo").map((row) => row.name), ["demo"]);
});

test("the prospects page is staff-gated and says when a source is not connected", () => {
  assert.equal(clientViewerAllowed("/marketing/prospects"), false);
  assert.equal(clientViewerAllowed("/marketing/prospects?client=a"), false);
  assert.equal(canOpenProspects("client_viewer"), false);
  assert.equal(canOpenProspects("none"), false);
  assert.equal(canOpenProspects("super_admin"), true);
  assert.equal(canOpenProspects("client_owner"), true);
  const staff = jarvisNav({ audience: "staff", showAis2l: false, decisionCount: 0, showLive: false });
  const client = jarvisNav({ audience: "client", showAis2l: false, decisionCount: 0, showLive: false });
  assert.equal(staff.some((item) => item.href === "/marketing/prospects"), true);
  assert.equal(client.some((item) => item.href === "/marketing/prospects"), false);
  const shell = readFileSync(path.join(ROOT, "components/shell.tsx"), "utf8");
  const clientNav = shell.slice(shell.indexOf("const CLIENT_NAV"), shell.indexOf("export function AppShell"));
  assert.equal(clientNav.includes("/marketing/prospects"), false);
  assert.match(shell, /\/marketing\/prospects/);
  const screen = readFileSync(path.join(ROOT, "components/prospects-screen.tsx"), "utf8");
  assert.match(screen, /btn-brand/);
  assert.equal(/#[0-9a-fA-F]{6}/.test(screen.replaceAll("#FF5800", "")), false);
  const empty = prospectEmptyState({
    source: "traxy",
    clientSelected: true,
    rowCount: 0,
    traxyLiveRead: false,
    apolloLiveRead: false,
    apolloSavedOnly: false,
  });
  assert.match(empty?.title || "", /Traxy is not connected/);
  const sync = readFileSync(path.join(ROOT, "lib/marketing/prospects/sync.ts"), "utf8");
  assert.equal(/graph\.facebook|googleads|stackadapt|uploadClickConversions|people\/match/i.test(sync), false);
  const mapped = mapTraxyLead(traxyLead(LEAD_A));
  assert.equal(mapped?.displayName, "Casey North");
  assert.equal(JSON.stringify(mapped?.raw).includes(KEY), false);
  assert.equal(traxyCountTotal({ total: 4, QUALIFIED: 3 }), 4);
  assert.equal(traxyCountTotal({ QUALIFIED: 2, PRIORITY: 1 }), 3);
  assert.throws(() => publicProbeLine({
    connection: KEY,
    source: "traxy",
    count: 1,
    dateFrom: null,
    dateTo: null,
    truncated: false,
  }, [KEY]));
});

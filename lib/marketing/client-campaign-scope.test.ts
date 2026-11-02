import assert from "node:assert/strict";
import test from "node:test";
import {
  applyClientCampaignScopes,
  applyGoogleAdsClientScopes,
  applyStackAdaptClientScopes,
  clientForCampaign,
  clientForGoogleAdsCampaign,
  clientForStackAdaptCampaign,
  googleAdsCustomersToRead,
  liveGoogleAdsCustomerIds,
  liveStackAdaptAdvertiserIds,
  planCampaignClients,
  planGoogleAdsAccounts,
  planGoogleAdsClients,
  planStackAdaptClients,
  type ClientCampaignRule,
  type GoogleAdsClientRule,
  type StackAdaptClientRule,
} from "./client-campaign-scope";
import { assertMetaReadOnly } from "./connectors/meta-client";

const rule = (over: Partial<ClientCampaignRule>): ClientCampaignRule => ({
  id: "c1",
  metaCampaignIds: [],
  metaCampaignNameContains: "",
  metaLiveRead: true,
  ...over,
});

test("id list wins over the name rule", () => {
  const r = rule({ metaCampaignIds: ["111"], metaCampaignNameContains: "pools" });
  assert.equal(clientForCampaign([r], { externalId: "111", name: "Other" }), "c1");
  assert.equal(clientForCampaign([r], { externalId: "222", name: "Pools spring" }), null);
});

test("name rule is case-insensitive and needs 3+ characters", () => {
  assert.equal(clientForCampaign([rule({ metaCampaignNameContains: "acme" })], { externalId: "1", name: "zzz-ACME Hiring" }), "c1");
  assert.equal(clientForCampaign([rule({ metaCampaignNameContains: "ac" })], { externalId: "1", name: "acme" }), null);
});

test("live read off links nothing", () => {
  assert.equal(clientForCampaign([rule({ metaCampaignIds: ["1"], metaLiveRead: false })], { externalId: "1", name: "x" }), null);
});

test("ambiguous matches stay unassigned", () => {
  const rules = [rule({ id: "a", metaCampaignNameContains: "shared" }), rule({ id: "b", metaCampaignNameContains: "shared" })];
  assert.equal(clientForCampaign(rules, { externalId: "1", name: "shared camp" }), null);
});

test("other campaigns in a shared account are never attributed", () => {
  const rules = [rule({ metaCampaignIds: ["10", "11"] })];
  const changes = planCampaignClients(rules, [
    { id: "x10", externalId: "10", name: "Client A", clientId: null },
    { id: "x12", externalId: "12", name: "Another client", clientId: null },
    { id: "x13", externalId: "13", name: "Moved", clientId: "c1" },
  ]);
  assert.deepEqual(changes, [
    { id: "x10", clientId: "c1" },
    { id: "x13", clientId: null },
  ]);
});

test("apply writes only local campaign rows", async () => {
  const updates: unknown[] = [];
  const result = await applyClientCampaignScopes(
    {
      marketingClient: { findMany: async () => [rule({ metaCampaignIds: ["10"] })] },
      campaign: {
        findMany: async () => [{ id: "x10", externalId: "10", name: "A", clientId: null }],
        update: async (args) => updates.push(args),
      },
    },
    "org",
  );
  assert.deepEqual(result, { linked: 1, cleared: 0 });
  assert.deepEqual(updates, [{ where: { id: "x10" }, data: { clientId: "c1" } }]);
});

const stackRule = (over: Partial<StackAdaptClientRule>): StackAdaptClientRule => ({
  id: "cedar",
  stackadaptAdvertiserIds: ["1001"],
  stackadaptLiveRead: true,
  ...over,
});

test("stackadapt live read requests only mapped advertisers", () => {
  const rules = [
    stackRule({ id: "cedar", stackadaptAdvertiserIds: ["1001", "1001", "abc"] }),
    stackRule({ id: "other", stackadaptAdvertiserIds: ["2002"], stackadaptLiveRead: false }),
  ];
  assert.deepEqual(liveStackAdaptAdvertiserIds(rules), ["1001"]);
  assert.equal(clientForStackAdaptCampaign(rules, { namingParsed: { stackadaptAdvertiserId: "1001" } }), "cedar");
  assert.equal(clientForStackAdaptCampaign(rules, { namingParsed: { stackadaptAdvertiserId: "2002" } }), null);
  assert.equal(clientForStackAdaptCampaign([stackRule({ stackadaptLiveRead: false })], { namingParsed: { stackadaptAdvertiserId: "1001" } }), null);
});

test("two clients claiming one advertiser stay unassigned", () => {
  const rules = [stackRule({ id: "a" }), stackRule({ id: "b" })];
  assert.equal(clientForStackAdaptCampaign(rules, { namingParsed: { stackadaptAdvertiserId: "1001" } }), null);
  const changes = planStackAdaptClients(rules, [
    { id: "row", clientId: "a", namingParsed: { stackadaptAdvertiserId: "1001" } },
    { id: "kept", clientId: "outside", namingParsed: {} },
  ]);
  assert.deepEqual(changes, [{ id: "row", clientId: null }]);
});

test("stackadapt scope writes only local campaign rows", async () => {
  const updates: unknown[] = [];
  const result = await applyStackAdaptClientScopes(
    {
      marketingClient: { findMany: async () => [stackRule({})] },
      campaign: {
        findMany: async () => [{ id: "row", clientId: null, namingParsed: { stackadaptAdvertiserId: "1001" } }],
        update: async (args) => updates.push(args),
      },
    },
    "org",
  );
  assert.deepEqual(result, { linked: 1, cleared: 0 });
  assert.deepEqual(updates, [{ where: { id: "row" }, data: { clientId: "cedar" } }]);
});

const googleRule = (over: Partial<GoogleAdsClientRule>): GoogleAdsClientRule => ({
  id: "cedar",
  googleAdsCustomerIds: ["1111111111"],
  googleAdsLiveRead: true,
  ...over,
});

test("google ads live read requests only mapped customers", () => {
  const rules = [
    googleRule({ id: "cedar", googleAdsCustomerIds: ["111-111-1111", "1111111111", "short"] }),
    googleRule({ id: "other", googleAdsCustomerIds: ["2222222222"], googleAdsLiveRead: false }),
  ];
  assert.deepEqual(liveGoogleAdsCustomerIds(rules), ["1111111111"]);
  assert.deepEqual(googleAdsCustomersToRead(rules, []), ["1111111111"]);
  assert.deepEqual(googleAdsCustomersToRead(rules, ["2222222222", "1111111111"]), ["1111111111"]);
  assert.deepEqual(googleAdsCustomersToRead(rules, ["3333333333"]), []);
  assert.equal(clientForGoogleAdsCampaign(rules, { namingParsed: { googleAdsCustomerId: "1111111111" } }), "cedar");
  assert.equal(clientForGoogleAdsCampaign(rules, { namingParsed: {}, accountExternalId: "1111111111" }), "cedar");
  assert.equal(clientForGoogleAdsCampaign(rules, { namingParsed: { googleAdsCustomerId: "2222222222" } }), null);
  assert.equal(clientForGoogleAdsCampaign([googleRule({ googleAdsLiveRead: false })], { namingParsed: { googleAdsCustomerId: "1111111111" } }), null);
});

test("two clients claiming one Google Ads customer stay unassigned", () => {
  const rules = [googleRule({ id: "a" }), googleRule({ id: "b" })];
  assert.equal(clientForGoogleAdsCampaign(rules, { namingParsed: { googleAdsCustomerId: "1111111111" } }), null);
  const changes = planGoogleAdsClients(rules, [
    { id: "row", clientId: "a", namingParsed: { googleAdsCustomerId: "1111111111" } },
    { id: "kept", clientId: "outside", namingParsed: {} },
  ]);
  assert.deepEqual(changes, [{ id: "row", clientId: null }]);
  const accounts = planGoogleAdsAccounts(rules, [
    { id: "acct", clientId: "a", externalId: "1111111111" },
    { id: "other", clientId: "outside", externalId: "9999999999" },
  ]);
  assert.deepEqual(accounts, [{ id: "acct", clientId: null }]);
});

test("google ads scope writes local campaign and account rows", async () => {
  const campaigns: unknown[] = [];
  const accounts: unknown[] = [];
  const result = await applyGoogleAdsClientScopes(
    {
      marketingClient: { findMany: async () => [googleRule({})] },
      campaign: {
        findMany: async () => [{ id: "row", clientId: null, namingParsed: { googleAdsCustomerId: "1111111111" }, adAccount: { externalId: "1111111111" } }],
        update: async (args) => campaigns.push(args),
      },
      adAccount: {
        findMany: async () => [{ id: "acct", clientId: null, externalId: "1111111111" }],
        update: async (args) => accounts.push(args),
      },
    },
    "org",
  );
  assert.deepEqual(result, { linked: 1, cleared: 0, accountsLinked: 1, accountsCleared: 0 });
  assert.deepEqual(campaigns, [{ where: { id: "row" }, data: { clientId: "cedar" } }]);
  assert.deepEqual(accounts, [{ where: { id: "acct" }, data: { clientId: "cedar" } }]);
});

test("Meta connector refuses every write except the insights report job", () => {
  assertMetaReadOnly("GET", "act_1/campaigns");
  assertMetaReadOnly("POST", "act_1/insights");
  assert.throws(() => assertMetaReadOnly("POST", "120214634012330188"));
  assert.throws(() => assertMetaReadOnly("POST", "act_1/campaigns"));
  assert.throws(() => assertMetaReadOnly("DELETE", "act_1"));
});

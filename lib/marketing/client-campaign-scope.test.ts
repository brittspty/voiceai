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
  linkableMetaAdAccountIds,
  liveGoogleAdsCustomerIds,
  liveStackAdaptAdvertiserIds,
  planCampaignClients,
  planGoogleAdsAccounts,
  planGoogleAdsClients,
  planStackAdaptClients,
  SHARED_META_AD_ACCOUNT_ID,
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
  metaAdAccountIds: [],
  ...over,
});

function captureWarn(run: () => void) {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((part) => String(part)).join(" "));
  };
  try {
    run();
  } finally {
    console.warn = original;
  }
  return warnings;
}

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
  const warnings = captureWarn(() => {
    assert.equal(clientForCampaign(rules, { externalId: "1", name: "shared camp" }), null);
  });
  assert.match(warnings.join("\n"), /matches clients a, b; leaving it unassigned/);
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

test("an empty Meta ad-account list links nothing extra", () => {
  const rules = [rule({ metaCampaignIds: ["10"], metaAdAccountIds: [] })];
  assert.equal(clientForCampaign(rules, { externalId: "10", name: "Kept", accountExternalId: "act_695605706002199" }), "c1");
  assert.equal(clientForCampaign(rules, { externalId: "11", name: "Later", accountExternalId: "act_695605706002199" }), null);
});

test("a Meta ad account links every campaign on it, including ones created later", () => {
  const rules = [rule({ id: "homestead", metaAdAccountIds: ["695605706002199"] })];
  assert.equal(clientForCampaign(rules, { externalId: "1", name: "HomeStead RV - prospecting", accountExternalId: "act_695605706002199" }), "homestead");
  assert.equal(clientForCampaign(rules, { externalId: "2", name: "Created later", accountExternalId: "act_695605706002199" }), "homestead");
  assert.equal(clientForCampaign(rules, { externalId: "3", name: "Other account", accountExternalId: "act_1496438035088250" }), null);
  assert.equal(clientForCampaign([rule({ metaAdAccountIds: ["act_695605706002199"], metaLiveRead: false })], { externalId: "1", name: "Home", accountExternalId: "act_695605706002199" }), null);
});

test("the shared Meta account is never auto-linked, while campaign ids and name filters still match", () => {
  const shared = SHARED_META_AD_ACCOUNT_ID;
  assert.equal(shared, "act_532471207924121");
  const whole = rule({ id: "home", metaAdAccountIds: [shared, "act_695605706002199"] });
  assert.equal(clientForCampaign([whole], { externalId: "1", name: "Shared camp", accountExternalId: shared }), null);
  assert.equal(clientForCampaign([whole], { externalId: "9", name: "Later", accountExternalId: "ACT_695605706002199" }), "home");

  const byId = rule({ id: "shared-client", metaCampaignIds: ["55"], metaAdAccountIds: [shared] });
  assert.equal(clientForCampaign([byId], { externalId: "55", name: "Kept", accountExternalId: shared }), "shared-client");
  assert.equal(clientForCampaign([byId], { externalId: "56", name: "Other on the shared account", accountExternalId: shared }), null);

  const byName = rule({ id: "named", metaCampaignNameContains: "pools", metaAdAccountIds: [shared] });
  assert.equal(clientForCampaign([byName], { externalId: "1", name: "Pools spring", accountExternalId: shared }), "named");
  assert.equal(clientForCampaign([byName], { externalId: "2", name: "Unrelated", accountExternalId: shared }), null);
});

test("two clients matching one Meta campaign stay unassigned and warn", () => {
  const account = "act_1496438035088250";
  const rules = [
    rule({ id: "by-account", metaAdAccountIds: [account] }),
    rule({ id: "by-id", metaCampaignIds: ["10"] }),
  ];
  const warnings = captureWarn(() => {
    assert.equal(clientForCampaign(rules, { externalId: "10", name: "Sunshine", accountExternalId: account }), null);
  });
  assert.match(warnings.join("\n"), /matches clients by-account, by-id; leaving it unassigned/);
  assert.equal(clientForCampaign(rules, { externalId: "11", name: "Created later", accountExternalId: account }), "by-account");
  let changes: { id: string; clientId: string | null }[] = [];
  captureWarn(() => {
    changes = planCampaignClients(rules, [
      { id: "row", externalId: "10", name: "Sunshine", clientId: "by-id", accountExternalId: account },
      { id: "later", externalId: "11", name: "Created later", clientId: null, accountExternalId: account },
    ]);
  });
  assert.deepEqual(changes, [
    { id: "row", clientId: null },
    { id: "later", clientId: "by-account" },
  ]);
});

test("two clients listing the same Meta ad account stay unassigned", () => {
  const rules = [
    rule({ id: "a", metaAdAccountIds: ["act_1714295587204364"] }),
    rule({ id: "b", metaAdAccountIds: ["1714295587204364"] }),
  ];
  const warnings = captureWarn(() => {
    assert.equal(clientForCampaign(rules, { externalId: "1", name: "Pinnacle", accountExternalId: "act_1714295587204364" }), null);
  });
  assert.equal(warnings.length, 1);
});

test("linkable Meta ad account ids normalize and refuse the shared account", () => {
  assert.deepEqual(linkableMetaAdAccountIds(["695605706002199", "act_695605706002199", "act_1543770834173499"]), ["act_695605706002199", "act_1543770834173499"]);
  assert.throws(() => linkableMetaAdAccountIds(["act_532471207924121"]), /cannot be linked as a whole/);
  assert.throws(() => linkableMetaAdAccountIds(["not-an-account"]), /act_123/);
});

test("a non-shared account from another Meta business can be linked as a whole", () => {
  const account = "act_2897217887308756";
  assert.deepEqual(linkableMetaAdAccountIds([account]), [account]);
  assert.equal(
    clientForCampaign([rule({ id: "befound", metaAdAccountIds: [account] })], {
      externalId: "1",
      name: "Be Found",
      accountExternalId: account,
    }),
    "befound",
  );
  assert.equal(
    clientForCampaign([rule({ id: "befound", metaAdAccountIds: [account] })], {
      externalId: "2",
      name: "Shared account campaign",
      accountExternalId: SHARED_META_AD_ACCOUNT_ID,
    }),
    null,
  );
  assert.throws(() => linkableMetaAdAccountIds([SHARED_META_AD_ACCOUNT_ID]), /cannot be linked as a whole/);
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

test("apply links a whole Meta ad account from the stored account id", async () => {
  const updates: unknown[] = [];
  let selected = "";
  const result = await applyClientCampaignScopes(
    {
      marketingClient: {
        findMany: async (args) => {
          selected = JSON.stringify(args);
          return [rule({ id: "homestead", metaAdAccountIds: ["act_695605706002199"] })];
        },
      },
      campaign: {
        findMany: async () => [
          { id: "later", externalId: "999", name: "Created later", clientId: null, adAccount: { externalId: "act_695605706002199" } },
        ],
        update: async (args) => updates.push(args),
      },
    },
    "org",
  );
  assert.equal(selected.includes("metaAdAccountIds"), true);
  assert.deepEqual(result, { linked: 1, cleared: 0 });
  assert.deepEqual(updates, [{ where: { id: "later" }, data: { clientId: "homestead" } }]);
});

const stackRule = (over: Partial<StackAdaptClientRule>): StackAdaptClientRule => ({
  id: "cedar",
  stackadaptAdvertiserIds: ["1001"],
  stackadaptLiveRead: true,
  stackadaptCampaignNameContains: "",
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

test("a StackAdapt name filter splits a shared advertiser and leaves the rest unassigned", () => {
  const rules = [
    stackRule({ id: "nashville", stackadaptAdvertiserIds: ["95590"], stackadaptCampaignNameContains: "Nashville" }),
    stackRule({ id: "pittsburgh", stackadaptAdvertiserIds: ["95590"], stackadaptCampaignNameContains: "Pittsburgh" }),
  ];
  const campaign = (name: string) => ({ name, namingParsed: { stackadaptAdvertiserId: "95590" } });
  assert.equal(clientForStackAdaptCampaign(rules, campaign("Precision Garage Doors Nashville - prospecting")), "nashville");
  assert.equal(clientForStackAdaptCampaign(rules, campaign("precision garage doors PITTSBURGH")), "pittsburgh");
  assert.equal(clientForStackAdaptCampaign(rules, campaign("Brand awareness")), null);
  assert.equal(clientForStackAdaptCampaign(rules, campaign("Nashville Pittsburgh overlap")), null);
  assert.equal(clientForStackAdaptCampaign(rules, { name: "Nashville", namingParsed: { stackadaptAdvertiserId: "1001" } }), null);
  const changes = planStackAdaptClients(rules, [
    { id: "nash", clientId: null, name: "Nashville CTV", namingParsed: { stackadaptAdvertiserId: "95590" } },
    { id: "other", clientId: "nashville", name: "Brand awareness", namingParsed: { stackadaptAdvertiserId: "95590" } },
  ]);
  assert.deepEqual(changes, [
    { id: "nash", clientId: "nashville" },
    { id: "other", clientId: null },
  ]);
});

test("a StackAdapt name filter is checked before the plain advertiser match", () => {
  const rules = [
    stackRule({ id: "filtered", stackadaptAdvertiserIds: ["95590"], stackadaptCampaignNameContains: "Nashville" }),
    stackRule({ id: "plain", stackadaptAdvertiserIds: ["95590"], stackadaptCampaignNameContains: "" }),
  ];
  assert.equal(clientForStackAdaptCampaign(rules, { name: "Nashville doors", namingParsed: { stackadaptAdvertiserId: "95590" } }), "filtered");
  assert.equal(clientForStackAdaptCampaign(rules, { name: "Other doors", namingParsed: { stackadaptAdvertiserId: "95590" } }), "plain");
  assert.equal(
    clientForStackAdaptCampaign(
      [stackRule({ stackadaptLiveRead: false, stackadaptCampaignNameContains: "Nashville" })],
      { name: "Nashville", namingParsed: { stackadaptAdvertiserId: "1001" } },
    ),
    null,
  );
});

test("an empty StackAdapt name filter keeps single-advertiser linking", () => {
  assert.equal(
    clientForStackAdaptCampaign([stackRule({ stackadaptCampaignNameContains: "" })], { name: "Anything", namingParsed: { stackadaptAdvertiserId: "1001" } }),
    "cedar",
  );
  assert.equal(
    clientForStackAdaptCampaign([stackRule({ stackadaptCampaignNameContains: "ab" })], { name: "ab campaign", namingParsed: { stackadaptAdvertiserId: "1001" } }),
    "cedar",
  );
  assert.equal(
    clientForStackAdaptCampaign(
      [
        stackRule({ id: "cedar" }),
        stackRule({ id: "other", stackadaptAdvertiserIds: ["2002"], stackadaptCampaignNameContains: "Nashville" }),
      ],
      { name: "Nashville", namingParsed: { stackadaptAdvertiserId: "1001" } },
    ),
    "cedar",
  );
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

test("stackadapt scope reads the name filter and campaign name", async () => {
  const updates: unknown[] = [];
  let clientSelect = "";
  let campaignSelect = "";
  const result = await applyStackAdaptClientScopes(
    {
      marketingClient: {
        findMany: async (args) => {
          clientSelect = JSON.stringify(args);
          return [stackRule({ stackadaptAdvertiserIds: ["95590"], stackadaptCampaignNameContains: "Nashville" })];
        },
      },
      campaign: {
        findMany: async (args) => {
          campaignSelect = JSON.stringify(args);
          return [{ id: "row", clientId: null, name: "Nashville CTV", namingParsed: { stackadaptAdvertiserId: "95590" } }];
        },
        update: async (args) => updates.push(args),
      },
    },
    "org",
  );
  assert.equal(clientSelect.includes("stackadaptCampaignNameContains"), true);
  assert.equal(campaignSelect.includes("\"name\":true") || campaignSelect.includes("name"), true);
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

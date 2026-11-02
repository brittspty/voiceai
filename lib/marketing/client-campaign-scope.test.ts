import assert from "node:assert/strict";
import test from "node:test";
import { applyClientCampaignScopes, clientForCampaign, planCampaignClients, type ClientCampaignRule } from "./client-campaign-scope";
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

test("Meta connector refuses every write except the insights report job", () => {
  assertMetaReadOnly("GET", "act_1/campaigns");
  assertMetaReadOnly("POST", "act_1/insights");
  assert.throws(() => assertMetaReadOnly("POST", "120214634012330188"));
  assert.throws(() => assertMetaReadOnly("POST", "act_1/campaigns"));
  assert.throws(() => assertMetaReadOnly("DELETE", "act_1"));
});

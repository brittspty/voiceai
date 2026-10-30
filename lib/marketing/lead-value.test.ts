import assert from "node:assert/strict";
import test from "node:test";
import { canEditLeadValue, estimatedRoas, parseLeadDollars, saveClientLeadValue, type LeadValueStore } from "./lead-value";

test("only super admins and account managers can set lead value", () => {
  for (const kind of ["super_admin", "account_manager"] as const) assert.equal(canEditLeadValue({ kind }), true);
  for (const kind of ["staff", "client_viewer", "none"] as const) assert.equal(canEditLeadValue({ kind }), false);
});

test("estimated ROAS uses lead value and the call value when one is set", () => {
  assert.equal(estimatedRoas({ leads: 10, calls: 2, spend: 100, leadCents: null, callCents: null }), null);
  assert.equal(estimatedRoas({ leads: 10, calls: 2, spend: 100, leadCents: 8500, callCents: null }), (12 * 8500) / 100 / 100);
  const withCall = (10 * 8500 + 2 * 14000) / 100 / 100;
  assert.equal(estimatedRoas({ leads: 10, calls: 2, spend: 100, leadCents: 8500, callCents: 14000 }), withCall);
  assert.equal(estimatedRoas({ leads: 1, calls: 0, spend: 0, leadCents: 8500, callCents: null }), null);
});

test("blank call value stays null and a zero lead is refused", () => {
  const parsed = parseLeadDollars("85.00", "");
  assert.equal(parsed.ok && parsed.leadCents, 8500);
  assert.equal(parsed.ok && parsed.callCents, null);
  const both = parseLeadDollars("$85.00", "140");
  assert.equal(both.ok && both.callCents, 14000);
  assert.equal(parseLeadDollars("0", "").ok, false);
  assert.equal(parseLeadDollars("10", "-5").ok, false);
});

test("saving a lead value writes an audit row and does not touch a budget", async () => {
  const writes: unknown[] = [];
  const audits: unknown[] = [];
  let current: { leadValueCents: number | null; callValueCents: number | null } | null = null;
  const store: LeadValueStore = {
    async read() {
      return current;
    },
    async write(_workspaceId, row) {
      writes.push(row);
      current = { leadValueCents: row.leadValueCents, callValueCents: row.callValueCents };
    },
    async audit(row) {
      audits.push(row);
    },
  };
  await assert.rejects(() => saveClientLeadValue({ kind: "owner", workspaceId: "org", userId: "u1" }, { leadCents: 8500, callCents: null }, store), /account manager/);
  await assert.rejects(() => saveClientLeadValue({ kind: "client_viewer", workspaceId: "org", userId: "u1" }, { leadCents: 8500, callCents: null }, store), /account manager/);
  const saved = await saveClientLeadValue({ kind: "super_admin", workspaceId: "org", userId: "u1" }, { leadCents: 8500, callCents: 14000 }, store);
  assert.equal(saved.changed, true);
  assert.equal(writes.length, 1);
  assert.deepEqual(audits[0], {
    workspaceId: "org",
    oldLeadCents: null,
    newLeadCents: 8500,
    oldCallCents: null,
    newCallCents: 14000,
    userId: "u1",
    setAt: (audits[0] as { setAt: Date }).setAt,
  });
  const again = await saveClientLeadValue({ kind: "account_manager", workspaceId: "org", userId: "u2" }, { leadCents: 8500, callCents: 14000 }, store);
  assert.equal(again.changed, false);
  assert.equal(audits.length, 1);
  assert.equal("writeBudget" in store, false);
});

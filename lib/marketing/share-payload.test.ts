import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { forbiddenClientKeys, REPORT_COST_TEXT } from "./client-view";
import { presentForAudience } from "./share-payload";

const BANNED = ["spend", "cost", "cpl", "cpql", "cpa", "roas", "budget"];

test("the share payload contract drops spend, cost, CPL, CPQL, CPA, ROAS, and budget", () => {
  const raw = {
    spend: 12,
    cost: 3,
    cpl: 4,
    cpql: 5,
    cpa: 6,
    roas: 2,
    budget: 80,
    currency: "USD",
    nested: { dailySpend: 1, costPerLead: 2, note: "ROAS is 2 and the CPA is $" },
    leads: 9,
    headline: "48 qualified leads",
  };
  for (const audience of ["client", "share"] as const) {
    const payload = presentForAudience(raw, audience);
    const text = JSON.stringify(payload);
    assert.equal(payload.leads, 9, audience);
    assert.equal(payload.headline, "48 qualified leads", audience);
    assert.deepEqual(forbiddenClientKeys(payload), [], audience);
    assert.equal(REPORT_COST_TEXT.test(text), false, text);
    for (const word of BANNED) assert.equal(text.toLowerCase().includes(word), false, `${audience} ${word}`);
  }
  const staff = presentForAudience(raw, "staff");
  assert.equal(staff.spend, 12);
  assert.equal(staff.roas, 2);
  const route = readFileSync(new URL("../../app/api/share/[token]/route.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("../../app/api/marketing/client/route.ts", import.meta.url), "utf8");
  assert.match(route, /presentForAudience/);
  assert.match(route, /noindex/);
  assert.match(client, /presentForAudience/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { REPORT_COST_TEXT } from "../marketing/client-view";
import { insightViewFromSynced, presentInsightView, type SyncedMetric } from "./live";

test("insights use the labeled example set only when no synced rows exist", () => {
  const empty = presentInsightView(insightViewFromSynced([]));
  assert.equal(empty.origin, "example");
  assert.equal(empty.label, "EXAMPLE DATA");
  assert.match(empty.note, /example set/);
  assert.match(empty.items[0]?.basedOn || "", /Sep 1, 2026–Oct 31, 2026/);
  const synced = presentInsightView(insightViewFromSynced([
    { clientId: "acct_harbor", clientName: "Harbor Dental", vertical: "Dental", channel: "Meta", creative: "Video", source: "Lookalike", leads: 10, qualified: 4, date: "2026-10-01" },
    { clientId: "acct_gulf", clientName: "Gulf Pest", vertical: "Dental", channel: "Meta", creative: "Video", source: "Lookalike", leads: 5, qualified: 1, date: "2026-10-02" },
    { clientId: "acct_harbor", vertical: "Dental", channel: "Google Ads", creative: "Image", source: "Keyword", leads: 8, qualified: 6, date: "2026-10-03" },
  ] as Array<SyncedMetric & { clientName?: string }>));
  assert.equal(synced.origin, "synced");
  assert.equal(synced.label, "Synced data");
  const text = JSON.stringify(synced);
  assert.equal(text.includes("Harbor"), false);
  assert.equal(text.includes("Gulf"), false);
  assert.equal(text.includes("EXAMPLE DATA"), false);
  assert.equal(text.includes("acct_harbor"), false);
  const card = synced.items.find((item) => item.vertical === "Dental");
  assert.match(card?.recommendation || "", /Google Ads/);
  assert.match(card?.reason || "", /qualified 6 of 8/);
  assert.match(card?.basedOn || "", /Oct 1, 2026–Oct 3, 2026 · n=2/);
  assert.equal(REPORT_COST_TEXT.test(text), false);
});

test("a synced row without a lead count does not fall back to example numbers", () => {
  const view = insightViewFromSynced([
    { clientId: "acct_1", vertical: "", channel: "Meta", creative: "", source: "", leads: null, qualified: null, date: "2026-10-04" },
  ]);
  assert.equal(view.origin, "synced");
  assert.equal(view.label, "Synced data");
  assert.deepEqual(view.items, []);
  assert.match(view.note, /lead count/);
  assert.equal(JSON.stringify(view).includes("48"), false);
  assert.equal(JSON.stringify(view).includes("EXAMPLE"), false);
});

test("missing qualified counts are not reported as zero", () => {
  const view = insightViewFromSynced([
    { clientId: "a", vertical: "Dental", channel: "Meta", creative: "Video", source: "", leads: 4, qualified: null, date: "2026-09-01" },
    { clientId: "b", vertical: "Dental", channel: "Google Ads", creative: "Image", source: "", leads: 9, qualified: null, date: "2026-09-02" },
  ]);
  const text = JSON.stringify(view);
  assert.match(view.items[0]?.reason || "", /recorded 9 leads/);
  assert.equal(text.includes("qualified 0"), false);
  assert.match(view.items[0]?.basedOn || "", /channels/);
  assert.equal(view.items[0]?.basedOn.includes("audience sources"), false);
});

test("the metric read does not select spend or client names", () => {
  const source = readFileSync(new URL("./load.ts", import.meta.url), "utf8");
  assert.equal(source.includes("spend"), false);
  assert.equal(source.includes("client.name"), false);
  assert.equal(source.includes("entityName"), false);
  assert.match(source, /platformLeads/);
  assert.match(source, /qualifiedLeads/);
});

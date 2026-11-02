import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { REPORT_COST_TEXT } from "../marketing/client-view";
import { EXAMPLE_INSIGHT_OBSERVATIONS, buildInsights, insightsEnabled, insightsHttpStatus, insightsPayload } from "./learn";

test("INSIGHTS defaults off and client roles and share links get 403", () => {
  assert.equal(insightsEnabled({}), false);
  assert.equal(insightsEnabled({ INSIGHTS: "off" }), false);
  assert.equal(insightsEnabled({ INSIGHTS: "on" }), true);
  assert.equal(insightsHttpStatus({ enabled: false, signedIn: true, kind: "super_admin", share: false }), 404);
  assert.equal(insightsHttpStatus({ enabled: true, signedIn: false, kind: null, share: false }), 401);
  assert.equal(insightsHttpStatus({ enabled: true, signedIn: true, kind: "super_admin", share: false }), 200);
  assert.equal(insightsHttpStatus({ enabled: true, signedIn: true, kind: "account_manager", share: false }), 200);
  for (const kind of ["client_viewer", "client_owner", "owner", "admin", "viewer", "staff", "all_clients_viewer", "none"]) {
    assert.equal(insightsHttpStatus({ enabled: true, signedIn: true, kind, share: false }), 403, kind);
  }
  assert.equal(insightsHttpStatus({ enabled: true, signedIn: true, kind: "super_admin", share: true }), 403);
  const route = readFileSync(new URL("../../app/api/insights/route.ts", import.meta.url), "utf8");
  const share = readFileSync(new URL("../../app/api/share/[token]/insights/route.ts", import.meta.url), "utf8");
  assert.match(route, /insightsHttpStatus/);
  assert.match(share, /insightsHttpStatus/);
  assert.match(share, /share: true/);
});

test("insights are anonymized recommendations with a Based on line and no cost fields", () => {
  const cards = buildInsights(EXAMPLE_INSIGHT_OBSERVATIONS);
  assert.equal(cards.length >= 2, true);
  for (const card of cards) {
    assert.match(card.recommendation, /recommendation only|favor/i);
    assert.match(card.reason, /recommendation only/i);
    assert.match(card.basedOn, /^Based on audience sources, creatives, and channels · Sep 1, 2026–Oct 31, 2026 · n=\d+$/);
    assert.equal(card.basedOn.includes("Harbor"), false);
    assert.equal(card.recommendation.includes("Harbor"), false);
    assert.equal(REPORT_COST_TEXT.test(JSON.stringify(card)), false, card.id);
  }
  const dental = cards.find((card) => card.vertical === "Dental");
  assert.match(dental?.recommendation || "", /Google Ads/);
  assert.match(dental?.basedOn || "", /n=3/);
  const payload = insightsPayload();
  assert.equal(payload.label, "EXAMPLE DATA");
  assert.equal(payload.recommendationsOnly, true);
  const text = JSON.stringify(payload);
  assert.equal(REPORT_COST_TEXT.test(text), false);
  assert.equal(text.includes("Harbor"), false);
  assert.equal(text.includes("clientKey"), false);
});

import assert from "node:assert/strict";
import test from "node:test";
import { forbiddenClientKeys, REPORT_COST_TEXT } from "./client-view";
import { collectsCostKeys } from "./channels/cost-strip";
import { moneyText } from "./spend-access";
import { canManageGbp, canViewGbp, gbpPayloadForAudience, gbpPdfLines, gbpViewHasReviewerName, presentGbpClient } from "./gbp-view";

const NOW = new Date("2026-11-02T15:00:00.000Z");

test("clients, viewers, share links, and plan pages never see spend on the GBP tab", () => {
  assert.equal(canManageGbp("client_viewer"), false);
  assert.equal(canManageGbp("client_owner"), false);
  assert.equal(canManageGbp("none"), false);
  assert.equal(canManageGbp("super_admin"), true);
  assert.equal(canManageGbp("account_manager"), true);
  assert.equal(canManageGbp("staff"), true);
  assert.equal(canViewGbp("client_viewer"), true);
  assert.equal(canViewGbp("none"), false);
  const poisoned = {
    ...presentGbpClient({ clientId: "harbor", audience: "staff", now: NOW, assignments: { "501": "harbor" } }),
    spend: 12,
    budget: 3,
    bid: 1,
    cpl: 4,
    roas: 2,
    note: "CPA is $40",
  };
  for (const audience of ["client", "share", "plan"] as const) {
    const view = presentGbpClient({ clientId: "harbor", audience, now: NOW, assignments: { "501": "harbor" } });
    const hidden = gbpPayloadForAudience(poisoned, audience);
    assert.equal(view.empty, false, audience);
    assert.equal(view.calls > 0, true, audience);
    assert.equal(view.score, 83, audience);
    assert.deepEqual(forbiddenClientKeys(view), [], audience);
    assert.deepEqual(collectsCostKeys(view), [], audience);
    assert.equal(REPORT_COST_TEXT.test(JSON.stringify(view)), false, audience);
    assert.equal(moneyText(JSON.stringify(view)), false, audience);
    assert.equal(gbpViewHasReviewerName(view, "fixture reviewer"), false);
    assert.equal(gbpPdfLines(view).some((line) => REPORT_COST_TEXT.test(line) || moneyText(line)), false);
    assert.equal("spend" in hidden, false);
    assert.equal(hidden.calls > 0, true, audience);
    assert.equal(JSON.stringify(hidden).includes("$40"), false);
  }
  const staff = presentGbpClient({ clientId: "harbor", audience: "staff", now: NOW, assignments: { "501": "harbor" } });
  assert.equal(staff.score, 83);
  assert.deepEqual(forbiddenClientKeys(staff), []);
  const other = presentGbpClient({ clientId: "gulf", audience: "client", now: NOW, assignments: { "501": "harbor" } });
  assert.equal(other.empty, true);
  assert.equal(other.calls, 0);
});

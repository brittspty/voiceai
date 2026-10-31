import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PlanClosed } from "../../components/plan-closed";
import { PlanDocument } from "../../components/plan-document";
import { clientPlansEnabled } from "./flags";
import { sanitizeLogo } from "./logo";
import {
  DEFAULT_PLAN_LINK_DAYS,
  PLAN_CONTACT_HREF,
  PLAN_RENEW_LABEL,
  PLAN_START_LABEL,
  approvePlan,
  assertOwnBaseline,
  blankPlan,
  canEditPlans,
  createPlanToken,
  dashboardFromMetrics,
  metricSelect,
  metricsWhereForPlan,
  parsePlanCode,
  planLinkDays,
  planViewRecord,
  resolvePublicPlan,
  revokePlan,
  sendToPreview,
  sharePath,
  type PlanRecord,
} from "./plan";

function ready(plan: PlanRecord) {
  return sendToPreview(plan);
}

test("client plans default off, last 30 days, and start at the contact form", () => {
  assert.equal(clientPlansEnabled({}), false);
  assert.equal(clientPlansEnabled({ CLIENT_PLANS: "on" }), true);
  assert.equal(planLinkDays({}), DEFAULT_PLAN_LINK_DAYS);
  assert.equal(DEFAULT_PLAN_LINK_DAYS, 30);
  assert.equal(planLinkDays({ CLIENT_PLAN_LINK_DAYS: "14" }), 14);
  const plan = blankPlan("p1", "Harbor Point Marine");
  assert.equal(plan.ctaLabel, PLAN_START_LABEL);
  assert.equal(plan.ctaHref, PLAN_CONTACT_HREF);
  assert.equal(plan.showCost, false);
  assert.equal(plan.status, "draft");
  assert.equal(canEditPlans("super_admin"), true);
  assert.equal(canEditPlans("account_manager"), true);
  assert.equal(canEditPlans("admin"), false);
});

test("share tokens have at least 128 bits and links wait for approval", () => {
  const first = createPlanToken();
  const second = createPlanToken();
  assert.ok(first.bits >= 128);
  assert.match(first.token, /^[a-f0-9]{32,}$/);
  assert.notEqual(first.token, second.token);
  assert.equal(parsePlanCode(`harbor-point-${first.token}`)?.token, first.token);
  assert.equal(parsePlanCode("harbor-short"), null);
  assert.throws(() => createPlanToken(Buffer.alloc(15)), /128/);

  const draft = blankPlan("p1", "Harbor Point Marine");
  assert.equal(sharePath(draft, first.token), null);
  assert.throws(() => approvePlan(draft, "user", new Date(), first), /preview/);
  const preview = ready(draft);
  const now = new Date("2026-10-30T12:00:00Z");
  const approved = approvePlan(preview, "sam", now, first, 30);
  assert.equal(approved.plan.approvedById, "sam");
  assert.equal(approved.plan.approvedAt, now.toISOString());
  assert.equal(approved.plan.status, "approved");
  const expires = new Date(approved.plan.expiresAt || 0).getTime() - now.getTime();
  assert.equal(expires, 30 * 24 * 60 * 60 * 1000);
  assert.equal(sharePath(approved.plan, approved.token, now), `/plan/harbor-point-marine-${approved.token}`);
  assert.equal(sharePath(preview, approved.token, now), null);
});

test("expired, revoked, and unknown plans stay closed", () => {
  const token = createPlanToken();
  const now = new Date("2026-10-30T12:00:00Z");
  const approved = approvePlan(ready(blankPlan("p1", "Gulf Dental")), "sam", now, token, 30).plan;
  assert.equal(resolvePublicPlan(null, token.token, now), "unknown");
  assert.equal(resolvePublicPlan(approved, "f".repeat(64), now), "unknown");
  assert.equal(resolvePublicPlan({ ...approved, status: "preview" }, token.token, now), "unknown");
  assert.equal(resolvePublicPlan(approved, token.token, now), "ok");
  const later = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000);
  assert.equal(resolvePublicPlan(approved, token.token, later), "expired");
  const revoked = revokePlan(approved, now);
  assert.equal(resolvePublicPlan(revoked, token.token, now), "revoked");
  const html = renderToStaticMarkup(<PlanClosed state="expired" />);
  assert.match(html, /This link has expired/);
  assert.match(html, new RegExp(PLAN_RENEW_LABEL));
  assert.match(html, /href="\/contact"/);
  assert.match(renderToStaticMarkup(<PlanClosed state="revoked" />), /This link was revoked/);
});

test("cost is stripped unless the plan opts in", () => {
  const rows = [{ impressions: 10, clicks: 2, leads: 1, spendCents: 2500, conversionValueCents: 5000 }];
  const hidden = dashboardFromMetrics(rows, false);
  assert.equal("spendCents" in hidden, false);
  assert.equal("roas" in hidden, false);
  assert.equal(JSON.stringify(hidden).includes("2500"), false);
  const shown = dashboardFromMetrics(rows, true);
  assert.equal(shown.spendCents, 2500);
  assert.equal(shown.roas, 2);
  assert.deepEqual(metricSelect(false), { impressions: true, clicks: true, platformLeads: true });
  assert.equal("spend" in metricSelect(true), true);
  const markup = renderToStaticMarkup(
    <PlanDocument
      plan={{
        clientName: "Gulf Coast Dental",
        logoSrc: null,
        goals: "More booked visits",
        channels: ["Meta"],
        audiences: ["Verified humans"],
        segments: ["New patients"],
        timeline: "Week 1",
        weekly: "A short note",
        ctaLabel: "Let's start",
        ctaHref: "/contact",
        dashboard: hidden,
        showCost: false,
      }}
    />,
  );
  assert.match(markup, /Let(?:'|&#x27;)s start/);
  assert.match(markup, /href="\/contact"/);
  assert.equal(markup.includes("ROAS"), false);
  assert.equal(markup.includes("Spend"), false);
});

test("baseline metrics stay on that client's workspace", () => {
  const plan = { ...blankPlan("p1", "Gulf"), dashboardSource: "baseline" as const, baselineWorkspaceId: "gulf" };
  assert.deepEqual(metricsWhereForPlan(plan), { workspaceId: "gulf" });
  assert.deepEqual(assertOwnBaseline("gulf", "gulf"), { workspaceId: "gulf" });
  assert.throws(() => assertOwnBaseline("gulf", "org"), /mismatch/);
  assert.throws(() => metricsWhereForPlan({ dashboardSource: "baseline", baselineWorkspaceId: "demo" }), /demo/);
  assert.deepEqual(metricsWhereForPlan({ dashboardSource: "demo", baselineWorkspaceId: "org" }), { workspaceId: "demo" });
});

test("plan views stay anonymous and logos are sanitized", () => {
  const view = planViewRecord("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", new Date("2026-10-30T12:00:00Z"));
  assert.deepEqual(Object.keys(view).sort(), ["userAgentCoarse", "viewedAt"]);
  assert.equal(view.userAgentCoarse, "mobile");
  assert.equal(planViewRecord("someone@example.com Mozilla", new Date()).userAgentCoarse, "unknown");
  const svg = sanitizeLogo(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#fff"/></svg>'), "image/svg+xml");
  assert.equal(svg.ok, true);
  const script = sanitizeLogo(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "image/svg+xml");
  assert.equal(script.ok, false);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  assert.equal(sanitizeLogo(png, "image/png").ok, true);
  assert.equal(sanitizeLogo(png, "image/gif").ok, false);
});

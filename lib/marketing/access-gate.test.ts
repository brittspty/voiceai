import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { canOpenOperatorSettings } from "../auth";
import { passwordIssues, roleLabel } from "./access";
import { shownIntegrationStatus } from "../adapters";
import { publicHttpsBase } from "../env";
import { readinessItems, type ReadinessInput } from "../readiness";
import { clientViewerAllowed } from "./client-gate";
import { clientViewersEnabled } from "./config";
import { plainCardLine } from "./decision-ui";
import { budgetCardCopy, budgetNeedsSuperAdmin } from "./decision-ui";
import { buildClientShare, clientShareHasMoney } from "./client-view";
import { checkSharePasscode, defaultShareExpiry, hashPasscode, SHARE_LINK_DEFAULT_MS } from "./share-link";

const ROOT = path.resolve(import.meta.dirname, "../..");

function routes(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) found.push(...routes(full));
    else if (name === "page.tsx" || name === "route.ts") {
      const rel = path.relative(path.join(ROOT, "app"), full).split(path.sep);
      const parts = rel.filter((part) => part !== "page.tsx" && part !== "route.ts" && !part.startsWith("("));
      const url = `/${parts.map((part) => (part.startsWith("[") ? "x" : part)).join("/")}`;
      found.push(url === "/" ? "/" : url.replace(/\/$/, ""));
    }
  }
  return found;
}

const BLOCKED = [
  "/",
  "/calls",
  "/calls/contacts",
  "/calls/calendar",
  "/calls/crm",
  "/calls/voice",
  "/calls/appointments",
  "/calls/do-not-call",
  "/settings/calling",
  "/settings/users",
  "/settings/production",
  "/settings/integrations",
  "/settings/agent",
  "/knowledge",
  "/docs",
  "/marketing",
  "/marketing/compare",
  "/marketing/skills",
  "/marketing/links",
  "/api/live",
  "/api/integrations/check",
  "/api/calls/x",
  "/api/calls/x/recording",
  "/api/marketing/compare",
  "/api/marketing/share-links",
  "/api/marketing/client-viewers",
];

test("a client viewer is blocked from every internal route", () => {
  for (const route of BLOCKED) {
    assert.equal(clientViewerAllowed(route), false, route);
  }
  assert.equal(clientViewerAllowed("/marketing/client"), true);
  assert.equal(clientViewerAllowed("/api/marketing/client"), true);
  assert.equal(clientViewerAllowed("/api/marketing/client/export"), true);
  assert.equal(clientViewerAllowed("/api/auth/logout"), true);
  const discovered = routes(path.join(ROOT, "app"));
  const allowed = new Set(["/login", "/api/health", "/marketing/client", "/api/marketing/client", "/api/marketing/client/export", "/api/auth/logout"]);
  for (const route of discovered) {
    if (route.startsWith("/share") || route.startsWith("/api/share")) {
      assert.equal(clientViewerAllowed(route), true, route);
      continue;
    }
    assert.equal(clientViewerAllowed(route), allowed.has(route), route);
  }
});

test("operator settings stay with the owner and super admin", () => {
  assert.equal(canOpenOperatorSettings("owner"), true);
  assert.equal(canOpenOperatorSettings("super_admin"), true);
  assert.equal(canOpenOperatorSettings("account_manager"), false);
  assert.equal(canOpenOperatorSettings("admin"), false);
  assert.equal(canOpenOperatorSettings("viewer"), false);
  assert.equal(canOpenOperatorSettings("client_viewer"), false);
  assert.equal(roleLabel("super_admin"), "Super admin");
  assert.equal(roleLabel("account_manager"), "Account manager");
});

test("client viewer invites are off until the flag is on and the password is strong", () => {
  assert.equal(clientViewersEnabled({}), false);
  assert.ok(passwordIssues("short", "ada@example.com").length > 0);
  assert.deepEqual(passwordIssues("Correct-Horse-9", "ada@example.com"), []);
  assert.ok(passwordIssues("AdaExample-99", "ada@example.com").some((issue) => issue.includes("email")));
});

test("share links expire in 30 days and a passcode locks after five tries", () => {
  const now = new Date("2026-10-29T12:00:00.000Z");
  assert.equal(defaultShareExpiry(now).getTime() - now.getTime(), SHARE_LINK_DEFAULT_MS);
  const hash = hashPasscode("246810");
  for (let i = 0; i < 4; i += 1) {
    const attempt = checkSharePasscode("link-a", "000000", hash, now.getTime());
    assert.equal(attempt.locked, false);
  }
  const locked = checkSharePasscode("link-a", "000000", hash, now.getTime());
  assert.equal(locked.locked, true);
  assert.equal(checkSharePasscode("link-a", "246810", hash, now.getTime()).ok, false);
});

test("public links use https and integrations are not healthy without a live check", () => {
  assert.equal(publicHttpsBase({ APP_URL: "http://127.0.0.1:43109" }), null);
  assert.equal(publicHttpsBase({ APP_URL: "http://voiceai.specificityinc.com" }), "https://voiceai.specificityinc.com");
  assert.equal(shownIntegrationStatus({ status: "healthy", keysSet: false, live: false }), "Not connected");
  assert.equal(shownIntegrationStatus({ status: "healthy", keysSet: true, live: true }), "Healthy");
  const hints = readinessItems({
    testMode: true,
    scheduleEnabled: false,
    integrationsMode: "mock",
    hasGhlKey: false,
    hasGhlLocation: false,
    hasElevenKey: false,
    hasElevenAgent: false,
    hasTwilioSid: false,
    hasTwilioToken: false,
    hasTwilioNumber: false,
    agentPublished: false,
    voicePublished: false,
    rulesPublished: false,
    requireConsent: true,
    enforceDnc: true,
    enforceHours: true,
    liveKnowledge: false,
    officeReady: false,
    anyTotp: false,
    webhookSecrets: false,
  } satisfies ReadinessInput).map((item) => item.hint).join(" ");
  assert.equal(/[A-Z][A-Z0-9_]{2,}=|[A-Z][A-Z0-9]*_[A-Z0-9_]+/.test(hints), false);
  const line = plainCardLine({ metric: "ctr", title: "Weak click rate vs siblings", summary: "Half baseline", baseline: "0.04", observed: "0.02" });
  assert.equal(/siblings|baseline/i.test(line), false);
  assert.match(line, /Fewer clicks than your other ads/);
});

test("a budget card shows dollars and still does not write a budget", () => {
  const copy = budgetCardCopy({
    id: "1",
    type: "budget_change",
    status: "verified",
    title: "Raise the daily budget",
    summary: "It runs out by lunch.",
    rationale: "",
    metric: "budget",
    baseline: "50",
    observed: "50",
    windowStart: "2026-10-22",
    windowEnd: "2026-10-29",
    sampleSize: 2000,
    sourceCount: 3,
    currentBudgetAmount: 50,
    proposedBudgetAmount: 80,
    proposedCurrency: "USD",
    proposedBudgetPeriod: "daily",
    setByName: "Dana R.",
  });
  assert.equal(copy.current, "$50/day");
  assert.equal(copy.recommended, "$80/day");
  assert.equal(copy.setBy, "set by Dana R.");
  assert.match(copy.fixed, /will not change this budget/);
  assert.equal(budgetNeedsSuperAdmin(80, 50), true);
  assert.equal(budgetNeedsSuperAdmin(40, 50), false);
  const share = buildClientShare({ client: "Bayou", adViews: 10, leads: 1, booked: 0, campaigns: [], updated: "Updated 10:15 AM ET" });
  assert.equal(clientShareHasMoney(share), false);
  assert.match(share.updated, /^Updated /);
});

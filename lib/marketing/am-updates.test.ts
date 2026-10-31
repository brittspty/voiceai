import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { canOpenOperatorSettings, permissionStatus } from "../auth";
import { accessFromUser, canApproveMarketing, roleLabel } from "./access";
import { allClientsViewerSeesCost } from "./config";
import { forbiddenClientKeys, presentWithoutCost, stripClientViewCost } from "./client-view";
import { buildManagerDigest, digestDeliveryPlan, digestItemAllowed, fatigueChoice } from "./digest";
import { digestDispatchPlan, digestEmail, selectDigestTransport } from "./digest-send";
import { alertFeedCopy, assignmentWhere, feedRecipients, feedSseChunk, feedVisible, metricNoteCopy, realtimeDeliveryPlan, unreadBadge } from "./feed";
import { homeScope, seesEveryClient } from "./isolation";
import { assignRolePlan } from "./roles";
import { skillDecisionRecord, skillFanoutPlan, skillOfferRecipients } from "./skill-approval";

const ROOT = path.resolve(import.meta.dirname, "../..");
const NOW = new Date("2026-10-31T12:00:00.000Z");

const GULF_ONE = { workspaceId: "gulf", scopeKind: "campaign" as const, adAccountId: "act_1", campaignId: "c1" };
const ORG_CLIENT = { workspaceId: "org", scopeKind: "client" as const, adAccountId: null, campaignId: null };

test("hourly send stays off until MARKETING_DIGEST_SEND, and test mail stays in the log", () => {
  assert.equal(digestDeliveryPlan({}).send, false);
  assert.equal(digestDeliveryPlan({ MARKETING_DIGEST: "on" }).send, false);
  assert.equal(digestDeliveryPlan({ MARKETING_DIGEST: "on", MARKETING_DIGEST_DELIVERY: "on" }).send, false);
  assert.equal(digestDeliveryPlan({ MARKETING_DIGEST_SEND: "on" }).send, false);
  const live = digestDeliveryPlan({ MARKETING_DIGEST: "on", MARKETING_DIGEST_SEND: "on" });
  assert.equal(live.send, true);
  assert.equal(digestDispatchPlan({ MARKETING_DIGEST: "on" }, false).deliver, false);
  assert.equal(digestDispatchPlan({ MARKETING_DIGEST: "on", MARKETING_DIGEST_SEND: "on" }, true).transport, "log");
  assert.equal(selectDigestTransport({ NODE_ENV: "test", INTEGRATIONS_MODE: "live", RESEND_API_KEY: "k", MAIL_FROM: "a@b.c" }, false), "log");
  assert.equal(selectDigestTransport({ INTEGRATIONS_MODE: "live", RESEND_API_KEY: "k", MAIL_FROM: "a@b.c" }, true), "log");
  assert.equal(selectDigestTransport({ INTEGRATIONS_MODE: "mock", RESEND_API_KEY: "k", MAIL_FROM: "a@b.c" }, false), "log");
  assert.equal(selectDigestTransport({ INTEGRATIONS_MODE: "live", RESEND_API_KEY: "k", MAIL_FROM: "a@b.c" }, false), "resend");
  const text = readFileSync(path.join(ROOT, "lib/marketing/digest.ts"), "utf8");
  assert.equal(text.includes("fetch("), false);
  assert.equal(text.includes("nodemailer"), false);
  assert.equal(readFileSync(path.join(ROOT, "prisma/seed.ts"), "utf8").includes("all_clients_viewer"), false);
});

test("an account manager summary keeps only assigned campaigns and the fatigue yes or no", () => {
  const pause = fatigueChoice({ reasons: ["frequency"], severity: "critical", metric: "frequency" });
  const rotate = fatigueChoice({ reasons: ["ctr_decay"], severity: "warning", metric: "ctr" });
  assert.equal(pause.prompt, "pause");
  assert.match(pause.reason, /Pause it/);
  assert.equal(rotate.prompt, "rotate");
  assert.match(rotate.reason, /Rotate in a new version/);
  assert.equal(/cost|spend|\$/.test(pause.reason + rotate.reason), false);
  const mine = { id: "1", title: "Leak campaign", summary: "Clicks fell.", accountId: "act_1", campaignId: "c1", workspaceId: "gulf" };
  const other = { id: "2", title: "Other campaign", summary: "Ignore me.", accountId: "act_1", campaignId: "c2", workspaceId: "gulf" };
  const otherClient = { id: "3", title: "Org campaign", summary: "Not mine.", accountId: "act_9", campaignId: "c9", workspaceId: "org" };
  assert.equal(digestItemAllowed([GULF_ONE], mine), true);
  assert.equal(digestItemAllowed([GULF_ONE], other), false);
  assert.equal(digestItemAllowed([GULF_ONE], otherClient), false);
  assert.equal(digestItemAllowed([ORG_CLIENT], { ...otherClient, workspace: true, workspaceId: "org" }), true);
  const digest = buildManagerDigest({
    userId: "am",
    accountIds: ["act_1"],
    assignments: [GULF_ONE],
    alerts: [mine, other, otherClient],
    recommendations: [],
    decisions: [
      { ...mine, title: "Tired ad", prompt: pause.prompt, reason: pause.reason },
      { ...other, title: "Other ad", prompt: rotate.prompt, reason: rotate.reason },
    ],
    periodStart: NOW,
    periodEnd: NOW,
    env: { MARKETING_DIGEST: "on", MARKETING_DIGEST_SEND: "on" },
  });
  assert.equal(digest?.delivery, "queued");
  assert.equal(digest?.payload.alerts.length, 1);
  assert.equal(digest?.payload.alerts[0]?.title, "Leak campaign");
  assert.equal(digest?.payload.decisions?.length, 1);
  assert.equal(digest?.payload.decisions?.[0]?.prompt, "pause");
  const mail = digestEmail({ name: "Sam", payload: digest!.payload });
  assert.match(mail.text, /assigned to you/);
  assert.match(mail.text, /Leak campaign/);
  assert.match(mail.text, /Pause\?/);
  assert.equal(mail.text.includes("Other campaign"), false);
  assert.equal(mail.text.includes("Org campaign"), false);
  const stored = buildManagerDigest({
    userId: "am",
    accountIds: ["act_1"],
    alerts: [mine],
    recommendations: [],
    periodStart: NOW,
    periodEnd: NOW,
    env: { MARKETING_DIGEST: "on" },
  });
  assert.equal(stored?.delivery, "not_sent");
});

test("super admins see every client and the read-only role cannot approve or open settings", () => {
  const known = ["org", "gulf", "bayou"];
  const admin = homeScope({ roleKind: "super_admin", workspaceId: "org", requestedId: null, knownIds: known });
  const viewer = homeScope({ roleKind: "all_clients_viewer", workspaceId: "org", requestedId: null, knownIds: known });
  assert.equal(seesEveryClient("super_admin"), true);
  assert.equal(seesEveryClient("all_clients_viewer"), true);
  assert.equal(seesEveryClient("account_manager"), false);
  assert.equal(admin.kind, "aggregate");
  assert.equal(viewer.kind, "aggregate");
  if (admin.kind === "aggregate") assert.deepEqual(admin.workspaceIds, known);
  if (viewer.kind === "aggregate") assert.deepEqual(viewer.workspaceIds, known);
  const picked = homeScope({ roleKind: "super_admin", workspaceId: "org", requestedId: "bayou", knownIds: known });
  assert.deepEqual(picked, { kind: "one", workspaceId: "bayou" });
  const access = accessFromUser({ id: "v", email: "view@example.com", role: "all_clients_viewer" }, [], {});
  assert.equal(access.kind, "all_clients_viewer");
  assert.equal(access.accounts, "all");
  assert.equal(access.seesCost, false);
  assert.equal(access.canEditBudget, false);
  assert.equal(access.canCreateShareLink, false);
  assert.equal(canApproveMarketing(access), false);
  assert.equal(canOpenOperatorSettings("all_clients_viewer"), false);
  assert.equal(permissionStatus("all_clients_viewer"), 403);
  assert.equal(roleLabel("all_clients_viewer"), "All clients");
  assert.equal(allClientsViewerSeesCost({}), false);
  assert.equal(allClientsViewerSeesCost({ ALL_CLIENTS_VIEWER_SEES_COST: "on" }), true);
  const opened = accessFromUser({ id: "v2", email: "view@example.com", role: "all_clients_viewer" }, [], { ALL_CLIENTS_VIEWER_SEES_COST: "on" });
  assert.equal(opened.seesCost, true);
  assert.equal(accessFromUser({ id: "sa", email: "sa@example.com", role: "super_admin" }, [], {}).seesCost, true);
  assert.equal(accessFromUser({ id: "am", email: "am@example.com", role: "account_manager" }, [ORG_CLIENT], {}).seesCost, true);
  const query = readFileSync(path.join(ROOT, "lib/marketing/home-query.ts"), "utf8");
  assert.match(query, /all_clients_viewer/);
  assert.equal(query.includes("workspaceId: { in"), false);
});

test("an all-clients viewer loses spend unless the opt-in switch is on", () => {
  const payload = {
    name: "Gulf Coast",
    leads: 4,
    spend: 12.5,
    budgetAmount: 50,
    cpc: 1.2,
    alerts: [
      { title: "Spend is high", summary: "CPC is $2.40" },
      { title: "Fewer clicks", summary: "Compared with similar ads." },
    ],
  };
  const hidden = stripClientViewCost(payload);
  assert.equal(hidden.name, "Gulf Coast");
  assert.equal(hidden.leads, 4);
  assert.equal("spend" in hidden, false);
  assert.equal("budgetAmount" in hidden, false);
  assert.equal("cpc" in hidden, false);
  assert.deepEqual(hidden.alerts.map((row) => row.title), ["Fewer clicks"]);
  assert.equal(forbiddenClientKeys(hidden).some((key) => /spend|budget|cpc|cost/i.test(key)), false);
  assert.equal(JSON.stringify(hidden).includes("$"), false);
  const kept = presentWithoutCost(payload, true);
  assert.equal(kept.spend, 12.5);
  assert.equal(presentWithoutCost(payload, false).spend, undefined);
  const home = readFileSync(path.join(ROOT, "lib/marketing/home-query.ts"), "utf8");
  const queries = readFileSync(path.join(ROOT, "lib/marketing/queries.ts"), "utf8");
  assert.match(home, /presentWithoutCost\(/);
  assert.match(queries, /presentWithoutCost\(/);
});

test("role assignment is off by default and does not create people", () => {
  const users = [
    { id: "sa", role: "super_admin" },
    { id: "am", role: "account_manager" },
  ];
  assert.equal(assignRolePlan({ actorKind: "super_admin", enabled: false, users, targetId: "am", nextRole: "all_clients_viewer" }).ok, false);
  assert.equal(assignRolePlan({ actorKind: "owner", enabled: true, users, targetId: "am", nextRole: "viewer" }).ok, false);
  assert.equal(assignRolePlan({ actorKind: "super_admin", enabled: true, users, targetId: "missing", nextRole: "viewer" }).ok, false);
  assert.equal(assignRolePlan({ actorKind: "super_admin", enabled: true, users: [{ id: "sa", role: "super_admin" }], targetId: "sa", nextRole: "viewer" }).ok, false);
  const plan = assignRolePlan({ actorKind: "super_admin", enabled: true, users, targetId: "am", nextRole: "all_clients_viewer" });
  assert.equal(plan.ok, true);
  if (plan.ok) assert.equal(plan.role, "all_clients_viewer");
  assert.equal(users.length, 2);
});

test("every super admin can answer a skill offer, and a plain owner cannot", () => {
  const people = [
    { id: "owner", email: "owner@example.com", role: "owner", name: "Owner" },
    { id: "sa1", email: "a@example.com", role: "super_admin", name: "A" },
    { id: "sa2", email: "b@example.com", role: "super_admin", name: "B" },
    { id: "listed", email: "c@example.com", role: "admin", name: "C" },
  ];
  const env = { MARKETING_SUPER_ADMIN_EMAILS: "c@example.com" };
  const recipients = skillOfferRecipients(people, env);
  assert.deepEqual(recipients.map((person) => person.id), ["sa1", "sa2", "listed"]);
  assert.equal(skillFanoutPlan(people, env).enabled, false);
  const fanout = skillFanoutPlan(people, { ...env, MARKETING_SKILL_APPROVAL: "on" });
  assert.equal(fanout.enabled, true);
  if (fanout.enabled) {
    assert.equal(fanout.notices.length, 3);
    assert.equal(fanout.notices.some((notice) => notice.userId === "owner"), false);
  }
  const record = skillDecisionRecord({ userId: "sa2", choice: "yes", at: NOW });
  assert.equal(record.userId, "sa2");
  assert.equal(record.choice, "yes");
  assert.equal(record.skillName.length > 0, true);
});

test("the live feed is off by default and stays inside assigned campaigns", () => {
  assert.equal(realtimeDeliveryPlan({}).live, false);
  assert.equal(realtimeDeliveryPlan({}).notify, false);
  const on = realtimeDeliveryPlan({ AM_REALTIME_FEED: "on" });
  assert.equal(on.live, true);
  assert.equal(on.notify, true);
  const gulf = { workspaceId: "gulf", adAccountId: "act_1", campaignId: "c1" };
  const other = { workspaceId: "gulf", adAccountId: "act_1", campaignId: "c2" };
  const org = { workspaceId: "org", adAccountId: "act_9", campaignId: "c9" };
  const scope = { kind: "assigned" as const, assignments: [GULF_ONE] };
  assert.equal(feedVisible(scope, gulf), true);
  assert.equal(feedVisible(scope, other), false);
  assert.equal(feedVisible(scope, org), false);
  assert.equal(feedVisible({ kind: "all" }, org), true);
  assert.deepEqual(assignmentWhere("gulf", [GULF_ONE]), { workspaceId: "gulf", campaignId: { in: ["c1"] } });
  assert.deepEqual(assignmentWhere("org", [ORG_CLIENT]), { workspaceId: "org" });
  assert.throws(() => assignmentWhere(" ", [GULF_ONE]), /workspace/);
  const note = metricNoteCopy({ campaignName: "Leak", clicks: 10, leads: 0, impressions: 100, previousClicks: 40 });
  assert.equal(note?.kind, "anomaly");
  assert.match(note?.reason || "", /fell/);
  const chance = metricNoteCopy({ campaignName: "Leak", clicks: 40, leads: 3, impressions: 100, previousClicks: 10 });
  assert.equal(chance?.kind, "opportunity");
  const quiet = metricNoteCopy({ campaignName: "Leak", clicks: 12, leads: 1, impressions: 80, previousClicks: 10 });
  assert.equal(quiet?.kind, "metric_note");
  assert.match(`${quiet?.body} ${quiet?.reason}`, /what|Clicks|latest|previous/i);
  const flag = alertFeedCopy({ title: "Clicks dropped", summary: "Fewer people tapped the ad.", code: "ctr_off", severity: "warning" });
  assert.equal(flag.kind, "anomaly");
  assert.equal(flag.reason, "Fewer people tapped the ad.");
  const users = [
    { id: "am", email: "am@example.com", role: "account_manager", assignments: [GULF_ONE] },
    { id: "other", email: "other@example.com", role: "account_manager", assignments: [{ workspaceId: "gulf", scopeKind: "campaign" as const, adAccountId: "act_1", campaignId: "c2" }] },
    { id: "sa", email: "sa@example.com", role: "super_admin", assignments: [] },
    { id: "owner", email: "owner@example.com", role: "owner", assignments: [] },
    { id: "viewer", email: "view@example.com", role: "all_clients_viewer", assignments: [] },
  ];
  assert.deepEqual(feedRecipients(gulf, users, { MARKETING_SUPER_ADMIN_EMAILS: "sa@example.com" }), ["am", "sa"]);
  assert.equal(unreadBadge(0), "");
  assert.equal(unreadBadge(3), "3");
  assert.equal(unreadBadge(12), "9+");
  assert.match(feedSseChunk({ id: "e1", title: "Leak", kind: "anomaly" }), /data: /);
  const job = readFileSync(path.join(ROOT, "lib/marketing/feed-job.ts"), "utf8");
  assert.match(job, /isolatedWhere\(/);
  assert.match(job, /assignmentWhere\(/);
  assert.equal(job.includes("workspaceId: { in"), false);
  assert.match(job, /AM_REALTIME_FEED is off|realtimeDeliveryPlan/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { buildClientShare } from "./client-view";
import { speedToLeadEnabled } from "./config";
import { decideRecommendation } from "./recommendations";
import {
  DEFAULT_TARGET_SECONDS,
  businessWindow,
  canNotify,
  clockSourceLabel,
  dedupeKey,
  describeLead,
  median,
  planSpeedToLead,
  readLandingStamp,
  resolveClock,
  telHref,
  touchSeconds,
  undoStillOpen,
  type SpeedLead,
} from "./speed-to-lead";
import { zonedTimeToUtc } from "../time";

const TZ = "America/New_York";
const wall = (value: string) => zonedTimeToUtc(value, TZ);

function lead(overrides: Partial<SpeedLead> = {}): SpeedLead {
  const start = wall("2026-10-29T11:00:00");
  return {
    id: "lead_1",
    workspaceId: "org",
    name: "Dana R.",
    phone: "+19195550144",
    leadSource: "Facebook form",
    clockStartAt: start,
    clockSource: "landing",
    slaStartAt: start,
    afterHours: false,
    firstTouchAt: null,
    channel: null,
    seconds: null,
    mutedUntil: null,
    landedAt: start,
    submittedAt: new Date(start.getTime() + 15_000),
    callStartedAt: null,
    alerts: [],
    ...overrides,
  };
}

test("the speed-to-lead flag defaults off and the target defaults to 30 seconds", () => {
  assert.equal(speedToLeadEnabled({}), false);
  assert.equal(speedToLeadEnabled({ MARKETING_SPEED_TO_LEAD: "off" }), false);
  assert.equal(speedToLeadEnabled({ MARKETING_SPEED_TO_LEAD: "on" }), true);
  assert.equal(DEFAULT_TARGET_SECONDS, 30);
  const worker = readFileSync(path.join(import.meta.dirname, "../../worker/index.ts"), "utf8");
  assert.match(worker, /if \(!speedToLeadEnabled\(\)\) return/);
  const client = readFileSync(path.join(import.meta.dirname, "client-view.ts"), "utf8");
  assert.match(client, /Not measured yet/);
  const shareRoute = readFileSync(path.join(import.meta.dirname, "../../app/api/share/[token]/route.ts"), "utf8");
  assert.equal(shareRoute.includes("speedToLead"), false);
  const clientRoute = readFileSync(path.join(import.meta.dirname, "../../app/api/marketing/client/route.ts"), "utf8");
  assert.equal(clientRoute.includes("speedToLead"), false);
});

test("the clock starts at page landing and labels the fallback", () => {
  const now = wall("2026-10-29T11:05:00");
  const landed = wall("2026-10-29T11:00:00");
  const submitted = wall("2026-10-29T11:00:20");
  const called = wall("2026-10-29T11:00:40");
  const fromLanding = resolveClock({ landedAt: landed.toISOString(), submittedAt: submitted, callStartedAt: called, now });
  assert.equal(fromLanding.clockSource, "landing");
  assert.equal(fromLanding.clockStartAt.toISOString(), landed.toISOString());
  assert.equal(clockSourceLabel("landing"), null);

  const fromForm = resolveClock({ submittedAt: submitted.toISOString(), callStartedAt: called, now });
  assert.equal(fromForm.clockSource, "form_submit");
  assert.equal(clockSourceLabel(fromForm.clockSource), "from form submit");

  const fromCall = resolveClock({ callStartedAt: called.toISOString(), now });
  assert.equal(fromCall.clockSource, "call_start");
  assert.equal(clockSourceLabel(fromCall.clockSource), "from call start");

  const ignored = resolveClock({ landedAt: "not-a-time", submittedAt: submitted, now });
  assert.equal(ignored.clockSource, "form_submit");
});

test("a hidden landing field and a session event are read", () => {
  const now = wall("2026-10-29T11:05:00");
  const landed = wall("2026-10-29T11:00:12");
  const hidden = readLandingStamp(
    { contact: { customFields: [{ key: "landed_at", value: landed.toISOString() }], source: "Facebook form", sessionId: "sess_9" } },
    now,
  );
  assert.equal(hidden.landedAt?.toISOString(), landed.toISOString());
  assert.equal(hidden.sessionKey, "sess_9");
  assert.equal(hidden.leadSource, "Facebook form");
  const future = readLandingStamp({ landedAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString() }, now);
  assert.equal(future.landedAt, null);
});

test("a contacted lead shows Contacted in 22s", () => {
  const start = wall("2026-10-29T11:00:00");
  const touched = new Date(start.getTime() + 22_000);
  const described = describeLead(
    lead({ firstTouchAt: touched, channel: "voice_ai", seconds: 22, clockSource: "landing" }),
    { targetSeconds: 30, criticalSeconds: 900, openTime: "08:00", closeTime: "21:00", timeZone: TZ },
    new Date(start.getTime() + 60_000),
  );
  assert.equal(described.view.line, "Contacted in 22s");
  assert.equal(described.view.spoken, "contacted in 22 seconds");
  assert.equal(described.view.bandLabel, "OK");
  assert.equal(described.fires.length, 0);
});

test("a form without a landing time is labeled from form submit", () => {
  const start = wall("2026-10-29T11:00:00");
  const described = describeLead(
    lead({ clockSource: "form_submit", landedAt: null, clockStartAt: start, slaStartAt: start, seconds: 22, firstTouchAt: new Date(start.getTime() + 22_000), channel: "human" }),
    { targetSeconds: 30, criticalSeconds: 900, openTime: "08:00", closeTime: "21:00", timeZone: TZ },
    new Date(start.getTime() + 30_000),
  );
  assert.equal(described.view.line, "Contacted in 22s · from form submit");
  assert.match(described.view.spoken, /contacted in 22 seconds, from form submit/);
});

test("missing the 30 second target raises one warning and 15 minutes raises critical", () => {
  const start = wall("2026-10-29T11:00:00");
  const sla = { targetSeconds: 30, criticalSeconds: 900, openTime: "08:00", closeTime: "21:00", timeZone: TZ };
  const row = lead({ clockStartAt: start, slaStartAt: start });
  assert.equal(planSpeedToLead([row], sla, new Date(start.getTime() + 29_000)).plans[0].fires.length, 0);
  const late = planSpeedToLead([row], sla, new Date(start.getTime() + 30_000)).plans[0];
  assert.equal(late.fires.length, 1);
  assert.equal(late.fires[0].severity, "warning");
  assert.equal(late.fires[0].dedupeKey, dedupeKey("org", "lead_1"));
  assert.match(late.view.spoken, /waiting 30 seconds/);
  assert.equal(late.view.bandLabel, "Late");

  const custom = planSpeedToLead([row], { ...sla, targetSeconds: 10 }, new Date(start.getTime() + 10_000)).plans[0];
  assert.equal(custom.fires[0].severity, "warning");
  assert.equal(planSpeedToLead([row], { ...sla, targetSeconds: 10 }, new Date(start.getTime() + 9_000)).plans[0].fires.length, 0);

  const warned = lead({ alerts: [{ severity: "warning", state: "open" }] });
  assert.equal(planSpeedToLead([warned], sla, new Date(start.getTime() + 899_000)).plans[0].fires.length, 0);
  const critical = planSpeedToLead([warned], sla, new Date(start.getTime() + 900_000)).plans[0];
  assert.deepEqual(critical.fires.map((fire) => fire.severity), ["critical"]);
  assert.equal(critical.view.bandLabel, "Very late");

  const both = planSpeedToLead([row], sla, new Date(start.getTime() + 900_000)).plans[0];
  assert.deepEqual(both.fires.map((fire) => fire.severity), ["warning", "critical"]);
  const done = lead({
    alerts: [
      { severity: "warning", state: "open" },
      { severity: "critical", state: "open" },
    ],
  });
  assert.equal(planSpeedToLead([done], sla, new Date(start.getTime() + 1200_000)).plans[0].fires.length, 0);
});

test("contact resolves open alerts and a mute or quiet hours holds a warning", () => {
  const start = wall("2026-10-29T11:00:00");
  const sla = { targetSeconds: 30, criticalSeconds: 900, openTime: "08:00", closeTime: "21:00", timeZone: TZ };
  const touched = describeLead(
    lead({ firstTouchAt: new Date(start.getTime() + 22_000), seconds: 22, channel: "human", alerts: [{ severity: "warning", state: "open" }] }),
    sla,
    new Date(start.getTime() + 40_000),
  );
  assert.equal(touched.resolve, true);
  assert.equal(touched.fires.length, 0);

  const muted = describeLead(lead({ mutedUntil: new Date(start.getTime() + 86_400_000) }), sla, new Date(start.getTime() + 45_000));
  assert.equal(muted.fires.length, 0);
  assert.equal(muted.view.bandLabel, "Muted");

  const evening = wall("2026-10-29T20:59:40");
  const quietLead = lead({ clockStartAt: evening, slaStartAt: evening, landedAt: evening });
  const held = planSpeedToLead([quietLead], sla, new Date(evening.getTime() + 35_000)).plans[0];
  assert.equal(held.fires.length, 0);
  const broke = planSpeedToLead([quietLead], sla, new Date(evening.getTime() + 900_000)).plans[0];
  assert.deepEqual(broke.fires.map((fire) => fire.severity), ["critical"]);
});

test("after-hours leads wait until 8 AM before the target clock runs", () => {
  const night = wall("2026-10-29T22:10:00");
  const window = businessWindow(night, TZ);
  assert.equal(window.afterHours, true);
  assert.equal(window.slaStartAt.toISOString(), wall("2026-10-30T08:00:00").toISOString());
  const row = lead({
    clockStartAt: night,
    slaStartAt: window.slaStartAt,
    afterHours: true,
    landedAt: night,
  });
  const sla = { targetSeconds: 30, criticalSeconds: 900, openTime: "08:00", closeTime: "21:00", timeZone: TZ };
  const queued = planSpeedToLead([row], sla, night).plans[0];
  assert.equal(queued.fires.length, 0);
  assert.equal(queued.view.line, "Came in after hours");
  assert.match(queued.view.spoken, /Queued until 8 AM/);
  const open = planSpeedToLead([row], sla, new Date(window.slaStartAt.getTime() + 30_000)).plans[0];
  assert.equal(open.fires[0].severity, "warning");
  assert.match(open.view.line, /Waiting 30s/);
  assert.match(open.view.line, /Came in after hours/);
});

test("the dashboard reports median seconds, the in-target rate, and the slowest leads", () => {
  const start = wall("2026-10-29T11:00:00");
  const sla = { targetSeconds: 30, criticalSeconds: 900, openTime: "08:00", closeTime: "21:00", timeZone: TZ };
  const rows = [10, 22, 40].map((seconds, index) =>
    lead({
      id: `lead_${index}`,
      name: `Lead ${index}`,
      seconds,
      firstTouchAt: new Date(start.getTime() + seconds * 1000),
      channel: "voice_ai",
      clockStartAt: start,
      slaStartAt: start,
    }),
  );
  rows.push(lead({ id: "waiting", name: "Still waiting", slaStartAt: start, clockStartAt: start }));
  const now = new Date(start.getTime() + 50_000);
  const { summary } = planSpeedToLead(rows, sla, now);
  assert.equal(summary.medianSeconds, 22);
  assert.equal(summary.headline, "Median first response today: 22s (goal: under 30s)");
  assert.equal(summary.withinTargetPercent, 50);
  assert.equal(summary.slowest[0].name, "Still waiting");
  assert.match(summary.answeredToday.find((row) => row.name === "Lead 1")?.line || "", /^Contacted in 22s$/);
  assert.equal(JSON.stringify(summary).includes("spend"), false);
  assert.equal(JSON.stringify(summary).includes("\"cost\""), false);
  assert.equal(median([]), null);
});

test("push slots respect quiet hours and a 15 minute gap", () => {
  const day = wall("2026-10-29T11:00:00");
  const night = wall("2026-10-29T21:05:00");
  assert.equal(canNotify({ severity: "warning", now: night, timeZone: TZ, openTime: "08:00", closeTime: "21:00", lastPushAt: null }), false);
  assert.equal(canNotify({ severity: "critical", now: night, timeZone: TZ, openTime: "08:00", closeTime: "21:00", lastPushAt: null }), true);
  assert.equal(canNotify({ severity: "critical", now: day, timeZone: TZ, openTime: "08:00", closeTime: "21:00", lastPushAt: new Date(day.getTime() - 14 * 60 * 1000) }), false);
  assert.equal(canNotify({ severity: "warning", now: day, timeZone: TZ, openTime: "08:00", closeTime: "21:00", lastPushAt: new Date(day.getTime() - 16 * 60 * 1000) }), true);
});

test("speed-to-lead decisions do not write a budget and client share stays unmeasured", () => {
  const share = buildClientShare({ client: "Acme", adViews: 10, leads: 2, booked: 1, campaigns: [] });
  assert.equal(share.kpis.find((row) => row.label === "Called within 5 min")?.value, "Not measured yet");
  assert.equal(touchSeconds(wall("2026-10-29T11:00:00"), new Date(wall("2026-10-29T11:00:00").getTime() + 22_000)), 22);
  assert.equal(undoStillOpen(wall("2026-10-29T11:00:00"), new Date(wall("2026-10-29T11:00:00").getTime() + 29_000)), true);
  assert.equal(undoStillOpen(wall("2026-10-29T11:00:00"), new Date(wall("2026-10-29T11:00:00").getTime() + 31_000)), false);
  assert.equal(telHref("+1 (919) 555-0144"), "tel:+19195550144");
  return decideRecommendation({
    actor: { kind: "human", access: { kind: "super_admin" } as never },
    recommendation: {
      id: "rec_speed",
      type: "speed_to_lead",
      status: "verified",
      campaignId: null,
      adAccountId: null,
      proposedBudgetAmount: null,
      proposedBudgetPeriod: null,
      proposedCurrency: null,
    },
    decision: "accept",
    budgetStore: new Proxy({} as never, { get: () => () => { throw new Error("budget write"); } }),
  }).then((result) => {
    assert.equal(result.budgetWrite, "none");
    assert.equal(result.status, "accepted");
  });
});

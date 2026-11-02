import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { defaultPushPrefs, deliverPush, hourLabel, notifyAccountManager, parsePushPrefs, planPush, pushHttpStatus, pushNotificationsEnabled, type PushCandidate, type PushPrefs } from "./notify";

const night = new Date("2026-11-01T02:30:00.000Z");
const day = new Date("2026-10-31T16:00:00.000Z");

function prefs(partial: Partial<PushPrefs> = {}): PushPrefs {
  return { ...defaultPushPrefs({}), optedIn: true, ...partial };
}

function item(partial: Partial<PushCandidate> = {}): PushCandidate {
  return { id: "f-1", severity: "urgent", kind: "other", title: "Tracking stopped", body: "No leads arrived.", ...partial };
}

test("PUSH_NOTIFICATIONS defaults off and client roles and share links are refused", () => {
  assert.equal(pushNotificationsEnabled({}), false);
  assert.equal(pushNotificationsEnabled({ PUSH_NOTIFICATIONS: "off" }), false);
  assert.equal(pushNotificationsEnabled({ PUSH_NOTIFICATIONS: "on" }), true);
  assert.equal(pushHttpStatus({ enabled: false, signedIn: true, kind: "account_manager", share: false }), 404);
  assert.equal(pushHttpStatus({ enabled: true, signedIn: false, kind: null, share: false }), 401);
  assert.equal(pushHttpStatus({ enabled: true, signedIn: true, kind: "account_manager", share: false }), 200);
  assert.equal(pushHttpStatus({ enabled: true, signedIn: true, kind: "super_admin", share: false }), 200);
  for (const kind of ["client_viewer", "client_owner", "owner", "admin", "viewer", "staff", "all_clients_viewer", "none"]) {
    assert.equal(pushHttpStatus({ enabled: true, signedIn: true, kind, share: false }), 403, kind);
  }
  assert.equal(pushHttpStatus({ enabled: true, signedIn: true, kind: "account_manager", share: true }), 403);
});

test("quiet hours default to 10 PM–7 AM and urgent outages can break through", () => {
  const defaults = defaultPushPrefs({});
  assert.equal(defaults.optedIn, false);
  assert.equal(defaults.quietStartHour, 22);
  assert.equal(defaults.quietEndHour, 7);
  assert.equal(defaults.urgentOutageBreaksQuiet, true);
  assert.equal(hourLabel(22), "10 PM");
  assert.equal(hourLabel(7), "7 AM");
  assert.equal(defaultPushPrefs({ PUSH_QUIET_START: "21", PUSH_QUIET_END: "8" }).quietStartHour, 21);
  assert.equal(defaultPushPrefs({ PUSH_OUTAGE_BREAKS_QUIET: "off" }).urgentOutageBreaksQuiet, false);
  assert.equal(defaultPushPrefs({ PUSH_QUIET_START: "nope" }).quietStartHour, 22);
  const parsed = parsePushPrefs({ optedIn: true, quietStartHour: 23, quietEndHour: 6, urgentOutageBreaksQuiet: false });
  assert.equal(parsed.quietStartHour, 23);
  assert.equal(parsed.urgentOutageBreaksQuiet, false);

  const logs: string[] = [];
  const held = planPush({ enabled: true, prefs: prefs(), item: item(), now: night });
  assert.equal(held.action, "skip");
  assert.equal(deliverPush(held, (line) => logs.push(line)).logged, null);

  const outage = planPush({ enabled: true, prefs: prefs(), item: item({ kind: "outage", title: "The offer page is down" }), now: night });
  assert.equal(outage.action, "would_send");
  if (outage.action === "would_send") assert.equal(outage.breaksQuietHours, true);
  const delivered = deliverPush(outage, (line) => logs.push(line));
  assert.equal(delivered.sent, false);
  assert.equal(delivered.logged, "would send");
  assert.match(logs[0] || "", /^would send push:/);

  const blocked = planPush({
    enabled: true,
    prefs: prefs({ urgentOutageBreaksQuiet: false }),
    item: item({ kind: "outage", title: "The offer page is down" }),
    now: night,
  });
  assert.equal(blocked.action, "skip");

  const daytime = planPush({ enabled: true, prefs: prefs(), item: item(), now: day });
  assert.equal(daytime.action, "would_send");
  assert.equal(planPush({ enabled: true, prefs: prefs(), item: item({ severity: "note" }), now: day }).action, "skip");
  assert.equal(planPush({ enabled: true, prefs: prefs(), item: item({ severity: "decision" }), now: day }).action, "skip");
  assert.equal(planPush({ enabled: true, prefs: prefs({ optedIn: false }), item: item(), now: day }).action, "skip");
  assert.equal(planPush({ enabled: false, prefs: prefs(), item: item(), now: day }).action, "off");
});

test("delivery stays a log line and does nothing while the switch is off", async () => {
  const source = readFileSync(new URL("./notify.ts", import.meta.url), "utf8");
  assert.equal(source.includes("fetch("), false);
  assert.match(source, /would send push:/);
  let loads = 0;
  const logs: string[] = [];
  const skipped = await notifyAccountManager({
    env: {},
    userId: "u1",
    items: [item({ kind: "outage", title: "The offer page is down" })],
    now: night,
    loadPrefs: async () => {
      loads += 1;
      return prefs();
    },
    log: (line) => logs.push(line),
  });
  assert.deepEqual(skipped, []);
  assert.equal(loads, 0);
  assert.deepEqual(logs, []);
  const sent = await notifyAccountManager({
    env: { PUSH_NOTIFICATIONS: "on" },
    userId: "u1",
    items: [item({ kind: "outage", title: "The offer page is down" }), item({ id: "n", severity: "note", title: "A note" })],
    now: night,
    loadPrefs: async () => prefs(),
    log: (line) => logs.push(line),
  });
  assert.equal(sent[0]?.logged, "would send");
  assert.equal(sent[1]?.logged, null);
  assert.equal(sent[0]?.sent, false);
  assert.equal(logs.length, 1);
});

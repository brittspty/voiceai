import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deliverPush, planPush, defaultPushPrefs } from "./notify";
import { parsePushSubscription, subscriptionStored, VAPID_PUBLIC_KEY } from "./subscription";

const subscription = {
  endpoint: "https://push.example.test/subscription/1",
  expirationTime: null,
  keys: { p256dh: "key", auth: "auth" },
};

test("a browser subscription is stored only when the endpoint is https and the keys are present", () => {
  assert.equal(subscriptionStored(subscription), true);
  assert.equal(parsePushSubscription({ ...subscription, endpoint: "http://push.example.test/a" }), null);
  assert.equal(parsePushSubscription({ endpoint: "https://push.example.test/a", keys: {} }), null);
  assert.equal(parsePushSubscription(null), null);
  const raw = Buffer.from(VAPID_PUBLIC_KEY, "base64url");
  assert.equal(raw.length, 65);
  assert.equal(raw[0], 4);
  const source = readFileSync(new URL("./subscription.ts", import.meta.url), "utf8");
  assert.equal(source.includes("privateKey"), false);
  const worker = readFileSync(new URL("../../public/push-sw.js", import.meta.url), "utf8");
  assert.equal(worker.includes("fetch("), false);
  const notify = readFileSync(new URL("./notify.ts", import.meta.url), "utf8");
  assert.equal(notify.includes("fetch("), false);
  assert.equal(notify.includes("endpoint"), false);
});

test("a stored subscription does not change delivery into a provider call", () => {
  const logs: string[] = [];
  const plan = planPush({
    enabled: true,
    prefs: { ...defaultPushPrefs({}), optedIn: true },
    item: { id: "1", severity: "urgent", kind: "outage", title: "The offer page is down", body: "3 checks failed" },
    now: new Date("2026-10-31T16:00:00.000Z"),
  });
  const sent = deliverPush(plan, (line) => logs.push(line));
  assert.equal(sent.sent, false);
  assert.equal(sent.logged, "would send");
  assert.match(logs[0] || "", /^would send push:/);
  assert.equal((logs[0] || "").includes(subscription.endpoint), false);
});

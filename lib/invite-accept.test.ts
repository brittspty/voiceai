import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { decideAcceptInvite, inviteFollowup, INVITE_INVALID, INVITE_PASSWORD_SET, INVITE_READY, INVITE_SHORT_PASSWORD } from "./invite-accept";

const NOW = Date.parse("2026-11-04T21:00:00.000Z");
const ROOT = path.resolve(import.meta.dirname, "..");

test("an existing invite user is told to sign in instead of seeing an invalid link", () => {
  const expired = { expiresAt: NOW - 1000 };
  const open = { expiresAt: NOW + 1000 };
  assert.deepEqual(decideAcceptInvite({ password: "short", invite: expired, userExists: true, now: NOW }), {
    status: "ready",
    message: INVITE_READY,
  });
  assert.deepEqual(decideAcceptInvite({ password: "long-enough-password", invite: open, userExists: true, now: NOW }), {
    status: "ready",
    message: INVITE_READY,
  });
  assert.deepEqual(decideAcceptInvite({ password: "long-enough-password", invite: null, userExists: false, now: NOW }), {
    status: "invalid",
    message: INVITE_INVALID,
  });
  assert.deepEqual(decideAcceptInvite({ password: "long-enough-password", invite: expired, userExists: false, now: NOW }), {
    status: "invalid",
    message: INVITE_INVALID,
  });
  assert.deepEqual(decideAcceptInvite({ password: "short", invite: open, userExists: false, now: NOW }), {
    status: "error",
    message: INVITE_SHORT_PASSWORD,
  });
  assert.deepEqual(decideAcceptInvite({ password: "long-enough-password", invite: open, userExists: false, now: NOW }), {
    status: "done",
    message: INVITE_PASSWORD_SET,
  });

  const done = inviteFollowup("done");
  const ready = inviteFollowup("ready");
  assert.equal(`${done.before}${done.link}`, "Your password is set. Sign in");
  assert.equal(done.href, "/login");
  assert.equal(`${ready.before}${ready.link}`, "Your account is ready, sign in");
  assert.equal(ready.href, "/login");

  const form = readFileSync(path.join(ROOT, "components/accept-invite-form.tsx"), "utf8");
  const action = readFileSync(path.join(ROOT, "lib/actions.ts"), "utf8");
  assert.match(form, /useActionState/);
  assert.equal(form.includes("setDone"), false);
  assert.match(form, /inviteFollowup/);
  assert.match(form, /href=\{follow\.href\}/);
  assert.match(action, /decideAcceptInvite/);
  const accept = action.slice(action.indexOf("export async function acceptInvite"));
  assert.equal(accept.includes("That person already has an account."), false);
  assert.equal(accept.includes("This invite link is no longer valid"), false);
});

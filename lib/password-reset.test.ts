import assert from "node:assert/strict";
import test from "node:test";
import {
  PASSWORD_RESET_MESSAGE,
  PASSWORD_RESET_TTL_MS,
  confirmPasswordReset,
  consumeRateLimit,
  hashResetToken,
  mintResetToken,
  requestPasswordReset,
  type PasswordResetRecord,
  type PasswordResetStore,
} from "./password-reset";
import { passwordResetEnabled } from "./marketing/config";

function memoryStore() {
  const rows = new Map<string, PasswordResetRecord>();
  const store: PasswordResetStore = {
    async create(row) {
      rows.set(row.tokenHash, { ...row });
    },
    async find(tokenHash) {
      const row = rows.get(tokenHash);
      return row ? { ...row } : null;
    },
    async markUsed(tokenHash, usedAt) {
      const row = rows.get(tokenHash);
      if (!row || row.usedAt || row.expiresAt.getTime() <= usedAt.getTime()) return false;
      row.usedAt = usedAt;
      return true;
    },
  };
  return { store, rows };
}

test("password reset stays off and does not reveal whether an email exists", async () => {
  assert.equal(passwordResetEnabled({}), false);
  assert.equal(passwordResetEnabled({ PASSWORD_RESET: "on" }), true);
  const { store, rows } = memoryStore();
  const mail: { transport: string; toAddress: string }[] = [];
  const off = await requestPasswordReset({
    email: "ada@example.com",
    env: { INTEGRATIONS_MODE: "mock" },
    findUser: async () => ({ email: "ada@example.com" }),
    store,
    recordMail: async (row) => {
      mail.push(row);
    },
  });
  assert.equal(off.status, 404);
  assert.equal(rows.size, 0);

  const env = { PASSWORD_RESET: "on", INTEGRATIONS_MODE: "mock" };
  const known = await requestPasswordReset({
    email: "Ada@Example.com",
    env,
    now: 1_000,
    findUser: async () => ({ email: "Ada@Example.com" }),
    store,
    recordMail: async (row) => {
      mail.push(row);
    },
    send: async () => {
      throw new Error("mock mode must not call Resend");
    },
  });
  const unknown = await requestPasswordReset({
    email: "missing@example.com",
    env,
    now: 1_000,
    limits: new Map(),
    findUser: async () => null,
    store,
    recordMail: async (row) => {
      mail.push(row);
    },
  });
  assert.equal(known.status, 200);
  assert.equal(unknown.status, 200);
  assert.equal(known.status === 200 && known.message, PASSWORD_RESET_MESSAGE);
  assert.equal(unknown.status === 200 && unknown.message, known.status === 200 ? known.message : "");
  assert.equal(JSON.stringify(known), JSON.stringify(unknown));
  assert.equal(rows.size, 1);
  assert.equal(mail.length, 1);
  assert.equal(mail[0]?.transport, "would send");
  assert.equal(mail[0]?.toAddress, "ada@example.com");
});

test("a reset token is single use, expires, and revokes sessions", async () => {
  const { store } = memoryStore();
  const now = Date.parse("2026-11-02T12:00:00.000Z");
  const minted = mintResetToken(now);
  assert.equal(minted.expiresAt.getTime() - now, PASSWORD_RESET_TTL_MS);
  assert.equal(minted.tokenHash, hashResetToken(minted.token));
  assert.notEqual(minted.tokenHash, minted.token);
  await store.create({ email: "ada@example.com", tokenHash: minted.tokenHash, expiresAt: minted.expiresAt, usedAt: null });
  let saved = "";
  let revoked = "";
  const first = await confirmPasswordReset({
    token: minted.token,
    password: "Correct-Horse-9",
    env: { PASSWORD_RESET: "on" },
    now: now + 1000,
    store,
    findUser: async () => ({ email: "ada@example.com" }),
    hashPassword: async (password) => `hash:${password}`,
    savePassword: async (_email, hash) => {
      saved = hash;
    },
    revokeSessions: async (email) => {
      revoked = email;
    },
  });
  assert.equal(first.status, 200);
  assert.equal(saved, "hash:Correct-Horse-9");
  assert.equal(revoked, "ada@example.com");
  const second = await confirmPasswordReset({
    token: minted.token,
    password: "Correct-Horse-9",
    env: { PASSWORD_RESET: "on" },
    now: now + 2000,
    store,
    findUser: async () => ({ email: "ada@example.com" }),
    hashPassword: async (password) => password,
    savePassword: async () => undefined,
    revokeSessions: async () => undefined,
  });
  assert.equal(second.status, 400);

  const limits = new Map<string, { n: number; at: number }>();
  for (let i = 0; i < 5; i += 1) assert.equal(consumeRateLimit(limits, "ada@example.com|local", now), false);
  assert.equal(consumeRateLimit(limits, "ada@example.com|local", now), true);
  const limited = await requestPasswordReset({
    email: "ada@example.com",
    env: { PASSWORD_RESET: "on" },
    now,
    limits,
    findUser: async () => {
      throw new Error("rate limit must return before the lookup");
    },
    store,
    recordMail: async () => undefined,
  });
  assert.equal(limited.status, 429);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { googleOAuthStartUrl } from "./marketing/offline/access";
import {
  MAGIC_LINK_READY,
  MAGIC_LINK_TTL_MS,
  deliverMagicLink,
  hashMagicToken,
  magicLinkEnabled,
  mintMagicToken,
  redeemMagicLink,
  requestMagicLink,
  workEmailError,
  type MagicLinkRecord,
  type MagicLinkStore,
} from "./magic-link";

const ROOT = path.resolve(import.meta.dirname, "..");

function memoryStore() {
  const rows = new Map<string, MagicLinkRecord>();
  const store: MagicLinkStore = {
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

test("magic links stay off and do not send mail", async () => {
  assert.equal(magicLinkEnabled({}), false);
  assert.equal(magicLinkEnabled({ MAGIC_LINK_ENABLED: "off" }), false);
  assert.equal(magicLinkEnabled({ MAGIC_LINK_ENABLED: "on" }), true);
  const { store, rows } = memoryStore();
  const mail: { toAddress: string; subject: string; body: string; transport: string }[] = [];
  let loads = 0;
  const off = await requestMagicLink({
    email: "ada@example.com",
    env: {},
    findUser: async () => {
      loads += 1;
      return { email: "ada@example.com" };
    },
    store,
    recordMail: async (row) => {
      mail.push(row);
    },
  });
  assert.equal(off.status, 404);
  assert.equal(loads, 0);
  assert.equal(mail.length, 0);

  const logs: string[] = [];
  const on = await requestMagicLink({
    email: "Ada@Example.com",
    env: { MAGIC_LINK_ENABLED: "on", INTEGRATIONS_MODE: "mock" },
    findUser: async () => ({ email: "Ada@Example.com" }),
    store,
    recordMail: async (row) => {
      mail.push(row);
    },
    log: (line) => logs.push(line),
    send: async () => {
      throw new Error("mock mode must not call Resend");
    },
  });
  assert.equal(on.status, 200);
  assert.equal(on.status === 200 && on.sent, false);
  assert.equal(on.status === 200 && on.message, MAGIC_LINK_READY);
  assert.deepEqual(logs, ["would send magic link to ada@example.com"]);
  assert.equal(mail.length, 1);
  assert.equal(mail[0]?.transport, "would send");
  assert.equal(mail[0]?.toAddress, "ada@example.com");
  assert.match(mail[0]?.body || "", /would send|sign-in link/i);
  assert.equal(rows.size, 1);
  const saved = [...rows.values()][0];
  assert.equal(saved?.email, "ada@example.com");
  assert.notEqual(saved?.tokenHash, "");
  assert.equal(saved?.usedAt, null);
  assert.equal(deliverMagicLink("ada@example.com", () => undefined).sent, false);

  const missing = await requestMagicLink({
    email: "nope",
    env: { MAGIC_LINK_ENABLED: "on" },
    findUser: async () => ({ email: "nope@example.com" }),
    store,
    recordMail: async (row) => {
      mail.push(row);
    },
  });
  assert.equal(missing.status, 400);
  assert.equal(workEmailError("nope"), "Enter the email you use for work, like name@company.com.");

  const quiet: string[] = [];
  const before = mail.length;
  await requestMagicLink({
    email: "missing@example.com",
    env: { MAGIC_LINK_ENABLED: "on", INTEGRATIONS_MODE: "mock" },
    findUser: async () => null,
    store,
    recordMail: async (row) => {
      mail.push(row);
    },
    log: (line) => quiet.push(line),
  });
  assert.deepEqual(quiet, []);
  assert.equal(mail.length, before);

  const source = [
    "lib/magic-link.ts",
    "app/api/auth/magic-link/route.ts",
    "app/api/auth/magic-link/redeem/route.ts",
    "lib/magic-link-store.ts",
  ]
    .map((file) => readFileSync(path.join(ROOT, file), "utf8"))
    .join("\n");
  assert.equal(source.includes("resend"), false);
  assert.equal(source.includes("sendInviteEmail"), false);
  assert.equal(source.includes("fetch("), false);
  const route = readFileSync(path.join(ROOT, "app/api/auth/magic-link/route.ts"), "utf8");
  assert.match(route, /mailLog\.create/);
  assert.match(route, /findActiveUserByEmail/);
  const lookup = readFileSync(path.join(ROOT, "lib/active-user.ts"), "utf8");
  assert.match(lookup, /findFirst/);
  assert.match(lookup, /mode: "insensitive"/);
});

test("a magic link is single use and expires after 15 minutes", async () => {
  const { store } = memoryStore();
  const now = Date.parse("2026-10-31T12:00:00.000Z");
  const minted = mintMagicToken(now);
  assert.equal(minted.expiresAt.getTime() - now, MAGIC_LINK_TTL_MS);
  assert.equal(minted.tokenHash, hashMagicToken(minted.token));
  assert.notEqual(minted.tokenHash, minted.token);
  await store.create({ email: "ada@example.com", tokenHash: minted.tokenHash, expiresAt: minted.expiresAt, usedAt: null });

  const first = await redeemMagicLink({ token: minted.token, env: { MAGIC_LINK_ENABLED: "on" }, now: now + 1000, store });
  assert.equal(first.status, 200);
  if (first.status === 200) assert.equal(first.email, "ada@example.com");
  const second = await redeemMagicLink({ token: minted.token, env: { MAGIC_LINK_ENABLED: "on" }, now: now + 2000, store });
  assert.equal(second.status, 400);

  const expired = mintMagicToken(now);
  await store.create({ email: "ada@example.com", tokenHash: expired.tokenHash, expiresAt: expired.expiresAt, usedAt: null });
  const late = await redeemMagicLink({
    token: expired.token,
    env: { MAGIC_LINK_ENABLED: "on" },
    now: now + MAGIC_LINK_TTL_MS + 1,
    store,
  });
  assert.equal(late.status, 400);
  const closed = await redeemMagicLink({ token: minted.token, env: {}, now, store });
  assert.equal(closed.status, 404);
});

test("team sign-in stays disconnected and documents Google Workspace OIDC without credentials", () => {
  assert.equal(googleOAuthStartUrl({}, "https://app.example/callback", "state"), null);
  const route = readFileSync(path.join(ROOT, "app/api/auth/company/route.ts"), "utf8");
  const screen = readFileSync(path.join(ROOT, "components/login-analytics-screen.tsx"), "utf8");
  const readme = readFileSync(path.join(ROOT, "README.md"), "utf8");
  assert.equal(route.includes("googleOAuthStartUrl"), false);
  assert.equal(route.includes("GOOGLE_ADS_CLIENT"), false);
  assert.match(route, /specificityinc\.com/);
  assert.match(route, /client secret/i);
  assert.match(screen, /disabled/);
  assert.match(screen, /Company sign-in isn/);
  assert.match(readme, /jarvis\.specificityinc\.com\/api\/auth\/oidc\/callback/);
  assert.equal(/okta|microsoft|saml|github/i.test(`${route}\n${screen}`), false);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { clientConfig } from "./client-config";
import { plannedSeedUsers, SAMPLE_ACTIVITY_ACTIONS, seedStartupLines } from "./seed-plan";

const SECRET = "JBSWY3DPEHPK3PXP";

test("sample seed creates owner, admin, and viewer with two-step off", () => {
  const users = plannedSeedUsers(clientConfig({}));
  assert.deepEqual(users.map((user) => user.role), ["owner", "admin", "viewer"]);
  assert.equal(users.every((user) => user.totpEnabled === false && user.totpSecret === null), true);
  assert.equal(users.find((user) => user.role === "admin")?.email, "jordan.lee@specificityinc.example");
});

test("production seed with sample data off creates only the owner", () => {
  const users = plannedSeedUsers(clientConfig({ SEED_SAMPLE_DATA: "false" }));
  assert.deepEqual(users.map((user) => user.id), ["user_owner"]);
  assert.equal(users[0].totpEnabled, false);
  assert.equal(users[0].totpSecret, null);
});

test("startup lines do not publish a TOTP secret", () => {
  const demo = seedStartupLines(clientConfig({}));
  const production = seedStartupLines(clientConfig({ SEED_SAMPLE_DATA: "false" }));
  assert.equal(demo.some((line) => line.includes("jordan.lee@specificityinc.example")), true);
  assert.equal(demo.some((line) => line.includes(SECRET)), false);
  assert.equal(production.some((line) => line.startsWith("Admin") || line.startsWith("Viewer")), false);
  const actions: readonly string[] = SAMPLE_ACTIVITY_ACTIONS;
  assert.equal(actions.includes("Turned on two-step sign-in"), false);
});

test("the published demo TOTP secret is gone from seed, the login hint, and the readme", () => {
  const root = new URL("..", import.meta.url);
  const files = ["prisma/seed.ts", "components/login-form.tsx", "README.md"];
  for (const file of files) {
    const text = readFileSync(new URL(file, root), "utf8");
    assert.equal(text.includes(SECRET), false, file);
  }
  assert.equal(readFileSync(new URL("prisma/seed.ts", root), "utf8").includes("Turned on two-step sign-in"), false);
});

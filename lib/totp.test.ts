import assert from "node:assert/strict";
import test from "node:test";
import { totpCode, verifyTotp } from "./totp";

const SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

test("matches the RFC 6238 SHA-1 test vector", async () => {
  assert.equal(await totpCode(SECRET, 59_000), "287082");
  assert.equal(await totpCode(SECRET, 1111111109_000), "081804");
});

test("accepts a code one step either side of now", async () => {
  const now = 1_700_000_000_000;
  const code = await totpCode(SECRET, now - 30_000);
  assert.equal(await verifyTotp(SECRET, code, now), true);
  assert.equal(await verifyTotp(SECRET, "000000", now), false);
});

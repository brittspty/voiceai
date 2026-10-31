import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function signIntake(secret: string, rawBody: string) {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function verifyIntakeSignature(secret: string, rawBody: string, signature: string) {
  if (!secret || !signature) return false;
  const expected = signIntake(secret, rawBody);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function claimIdempotency(seen: Set<string>, key: string) {
  const id = key.trim();
  if (!id) throw new Error("An idempotency key is required.");
  if (seen.has(id)) return "duplicate" as const;
  seen.add(id);
  return "new" as const;
}

export function hashIntakeSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

/** The raw key is returned once. The database keeps this sealed form. */
export function sealSecret(secret: string, pepper: string) {
  const key = createHash("sha256").update(pepper).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function openSecret(sealed: string, pepper: string) {
  const buf = Buffer.from(sealed, "base64url");
  if (buf.length < 29) return "";
  const key = createHash("sha256").update(pepper).digest();
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

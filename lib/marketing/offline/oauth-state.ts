import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const OAUTH_STATE_COOKIE = "voiceops_google_oauth_state";
export const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

/** HMAC-signed nonce. The callback must see this same value in the query and the cookie. */
export function createOAuthState(secret: string, now = Date.now()) {
  const nonce = randomBytes(16).toString("base64url");
  const payload = `${nonce}.${now}`;
  const mac = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export function verifyOAuthState(secret: string, state: string, now = Date.now(), maxAgeMs = OAUTH_STATE_MAX_AGE_MS) {
  if (!secret || !state) return false;
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const [nonce, issuedRaw, mac] = parts;
  if (!nonce || !issuedRaw || !mac || !/^\d+$/.test(issuedRaw)) return false;
  const issuedAt = Number(issuedRaw);
  if (!Number.isFinite(issuedAt) || issuedAt > now + 60_000 || now - issuedAt > maxAgeMs) return false;
  const expected = createHmac("sha256", secret).update(`${nonce}.${issuedRaw}`).digest("base64url");
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function oauthStateMatches(cookie: string, query: string, secret: string, now = Date.now()) {
  if (!cookie || !query || cookie !== query) return false;
  return verifyOAuthState(secret, query, now);
}

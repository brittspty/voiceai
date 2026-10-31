/** Uncompressed P-256 point. The signing key is not stored, so this app cannot send a push. */
export const VAPID_PUBLIC_KEY = "BJn9r1xdP17KIkK3hBNaA2hxKHbqN7pWF1kDFhD0xQts6QEhBIK1lRkNKGCm_UbCc1lP6cEq-bLHFmEHE2zRzY8";

export type StoredPushSubscription = {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
};

export function parsePushSubscription(value: unknown): StoredPushSubscription | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const endpoint = typeof row.endpoint === "string" ? row.endpoint.trim() : "";
  if (!endpoint || endpoint.length > 2000) return null;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const keys = row.keys;
  if (!keys || typeof keys !== "object") return null;
  const p256dh = typeof (keys as Record<string, unknown>).p256dh === "string" ? String((keys as Record<string, unknown>).p256dh).trim() : "";
  const auth = typeof (keys as Record<string, unknown>).auth === "string" ? String((keys as Record<string, unknown>).auth).trim() : "";
  if (!p256dh || !auth || p256dh.length > 200 || auth.length > 200) return null;
  const expirationTime = typeof row.expirationTime === "number" && Number.isFinite(row.expirationTime) ? row.expirationTime : null;
  return { endpoint, expirationTime, keys: { p256dh, auth } };
}

export function subscriptionStored(value: unknown) {
  return parsePushSubscription(value) != null;
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SECRET_KEY = /access_?token|refresh_?token|client_secret|developer_?token|authorization|password|api_?key|secret/i;
const SENSITIVE_KEY = /email|phone|e164|first_?name|last_?name|full_?name|contact_?name/i;

/** Meta Conversions API user_data keys. Values must be SHA-256 hex, including inside arrays. */
const HASH_KEYS = new Set(["em", "ph", "fn", "ln", "ct", "st", "zp", "external_id", "country", "db", "ge", "madid"]);

/** Raw network details. Never log them, and never treat them as a hash. */
const RAW_KEYS = new Set(["client_ip_address", "client_user_agent"]);

function isHash(value: string) {
  return /^[a-f0-9]{64}$/.test(value);
}

function keyName(key: string) {
  return key.trim().toLowerCase();
}

/** Drops secrets and raw contact details. 64-character hashes are kept. */
export function redactForLog(value: unknown, key = ""): unknown {
  const name = keyName(key);
  if (RAW_KEYS.has(name)) return undefined;
  if (Array.isArray(value)) {
    return value.map((item) => redactForLog(item, key)).filter((item) => item !== undefined);
  }
  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(childKey) || RAW_KEYS.has(keyName(childKey))) continue;
      const redacted = redactForLog(child, childKey);
      if (redacted !== undefined) next[childKey] = redacted;
    }
    return next;
  }
  if (typeof value === "string") {
    if (HASH_KEYS.has(name)) return isHash(value) ? value : "[redacted]";
    if (SENSITIVE_KEY.test(key) && !isHash(value)) return "[redacted]";
    const cleaned = value.replace(EMAIL, "[redacted]");
    EMAIL.lastIndex = 0;
    return cleaned;
  }
  return value;
}

export function payloadHasRawPii(payload: unknown): boolean {
  const walk = (value: unknown, key = ""): boolean => {
    const name = keyName(key);
    if (typeof value === "string") {
      if (HASH_KEYS.has(name) && !isHash(value)) return true;
      if (RAW_KEYS.has(name) && value.trim()) return true;
      const email = EMAIL.test(value);
      EMAIL.lastIndex = 0;
      if (email) return true;
      if (SENSITIVE_KEY.test(key) && !isHash(value)) return true;
      return false;
    }
    if (Array.isArray(value)) return value.some((item) => walk(item, key));
    if (value && typeof value === "object") {
      return Object.entries(value as Record<string, unknown>).some(([childKey, child]) => walk(child, childKey));
    }
    return false;
  };
  return walk(payload);
}

export function conversionLogLine(entry: {
  mode: string;
  platform: string;
  status: string;
  eventId: string;
  uploadId: string;
  payload: unknown;
}) {
  return JSON.stringify(redactForLog({ event: "offline_conversion", ...entry }));
}

export type LogSink = (line: string) => void;

export function defaultLogSink(line: string) {
  console.log(line);
}

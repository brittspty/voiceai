const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SECRET_KEY = /access_?token|refresh_?token|client_secret|developer_?token|authorization|password|api_?key|secret/i;
const SENSITIVE_KEY = /email|phone|e164|first_?name|last_?name|full_?name|contact_?name/i;

function isHash(value: string) {
  return /^[a-f0-9]{64}$/.test(value);
}

/** Drops secrets and raw contact details. 64-character hashes are kept. */
export function redactForLog(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactForLog(item));
  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(key)) continue;
      if (SENSITIVE_KEY.test(key) && typeof child === "string" && !isHash(child)) continue;
      next[key] = redactForLog(child);
    }
    return next;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(EMAIL, "[redacted]");
    EMAIL.lastIndex = 0;
    return cleaned;
  }
  return value;
}

export function payloadHasRawPii(payload: unknown): boolean {
  const walk = (value: unknown, key = ""): boolean => {
    if (typeof value === "string") {
      const email = EMAIL.test(value);
      EMAIL.lastIndex = 0;
      if (email) return true;
      if (SENSITIVE_KEY.test(key) && !isHash(value)) return true;
      return false;
    }
    if (Array.isArray(value)) return value.some((item) => walk(item));
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

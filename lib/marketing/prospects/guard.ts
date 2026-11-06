export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class ProspectWriteBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProspectWriteBlockedError";
  }
}

export class ProspectApiError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "ProspectApiError";
    this.status = status;
  }
}

export function redactProspectSecrets(value: string, secrets: string[] = []) {
  let redacted = value.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  redacted = redacted.replace(/(x-api-key|api[_-]?key)["']?\s*[:=]\s*["']?\S+/gi, "$1 [redacted]");
  for (const secret of secrets) {
    if (secret.trim().length >= 6) redacted = redacted.split(secret).join("[redacted]");
  }
  return redacted;
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function walkKeys(value: unknown, visit: (key: string) => void) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walkKeys(item, visit);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    visit(key);
    walkKeys(child, visit);
  }
}

const SECRET_KEY = /api[_-]?key|authorization|secret|token|password|webhook/i;

/** Drops credential-shaped keys before a payload is stored. */
export function sanitizeRaw(value: unknown, depth = 0): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 4) return {};
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY.test(key)) continue;
    if (Array.isArray(child)) {
      next[key] = child.slice(0, 20).map((item) => (item && typeof item === "object" ? sanitizeRaw(item, depth + 1) : item));
      continue;
    }
    if (child && typeof child === "object") {
      next[key] = sanitizeRaw(child, depth + 1);
      continue;
    }
    next[key] = child;
  }
  return next;
}

export function httpsUrl(raw: string, hostname: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ProspectWriteBlockedError("The prospect request URL is invalid.");
  }
  if (url.protocol !== "https:" || url.hostname !== hostname) {
    throw new ProspectWriteBlockedError(`Prospect reads only use https://${hostname}.`);
  }
  if (url.username || url.password || url.hash) {
    throw new ProspectWriteBlockedError("The prospect request URL cannot carry credentials.");
  }
  return url;
}

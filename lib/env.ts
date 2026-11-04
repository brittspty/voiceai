export function sessionSecret() {
  return process.env.SESSION_SECRET || "dev-only-session-secret-change-me";
}

export const APP_ORIGIN_FALLBACK = "http://127.0.0.1:43123";

/**
 * First trimmed origin in a comma-separated host list.
 * Production APP_URL can list several hosts. The stored value is not rewritten.
 */
export function firstAppOrigin(value: string | null | undefined, fallback = APP_ORIGIN_FALLBACK) {
  const first = (value ?? "").split(",")[0]?.trim() ?? "";
  if (!first) return fallback;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(first) ? first : `https://${first}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname) return fallback;
    return url.origin;
  } catch {
    return fallback;
  }
}

export function appUrl(env: Record<string, string | undefined> = process.env) {
  return firstAppOrigin(env.APP_URL, APP_ORIGIN_FALLBACK);
}

/** Public https origin for links people send or paste into another product. Local hosts are refused. */
export function publicHttpsBase(env: Record<string, string | undefined> = process.env) {
  const origin = firstAppOrigin(env.PUBLIC_APP_URL || env.APP_URL || "", "");
  if (!origin || /localhost|127\.0\.0\.1/i.test(origin)) return null;
  if (origin.startsWith("https://")) return origin;
  if (origin.startsWith("http://")) return `https://${origin.slice("http://".length)}`;
  return null;
}

export type Env = Record<string, string | undefined>;

export function integrationsMode(env: Env = process.env): "mock" | "live" {
  return env.INTEGRATIONS_MODE === "live" ? "live" : "mock";
}

/** Voice stays on the mock ports unless integrations are live and the workspace test switch is off. */
export function portsAreMocked(testMode: boolean, env: Env = process.env) {
  return integrationsMode(env) !== "live" || testMode;
}

export function workerStepMs() {
  const n = Number(process.env.WORKER_STEP_MS ?? 1600);
  return Number.isFinite(n) && n >= 0 ? n : 1600;
}

export function hasEnv(name: string) {
  return Boolean(process.env[name]?.trim());
}

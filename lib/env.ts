export function sessionSecret() {
  return process.env.SESSION_SECRET || "dev-only-session-secret-change-me";
}

export function appUrl() {
  return (process.env.APP_URL || "http://127.0.0.1:43123").replace(/\/$/, "");
}

/** Public https origin for links people send or paste into another product. Local hosts are refused. */
export function publicHttpsBase(env: Record<string, string | undefined> = process.env) {
  const raw = (env.PUBLIC_APP_URL || env.APP_URL || "").trim().replace(/\/$/, "");
  if (!raw || /localhost|127\.0\.0\.1/i.test(raw)) return null;
  if (raw.startsWith("https://")) return raw;
  if (raw.startsWith("http://")) return `https://${raw.slice("http://".length)}`;
  return `https://${raw}`;
}

export function integrationsMode(): "mock" | "live" {
  return process.env.INTEGRATIONS_MODE === "live" ? "live" : "mock";
}

export function workerStepMs() {
  const n = Number(process.env.WORKER_STEP_MS ?? 1600);
  return Number.isFinite(n) && n >= 0 ? n : 1600;
}

export function hasEnv(name: string) {
  return Boolean(process.env[name]?.trim());
}

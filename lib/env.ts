export function sessionSecret() {
  return process.env.SESSION_SECRET || "dev-only-session-secret-change-me";
}

export function appUrl() {
  return (process.env.APP_URL || "http://127.0.0.1:43123").replace(/\/$/, "");
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

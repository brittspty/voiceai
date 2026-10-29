export type Env = Record<string, string | undefined>;

const REQUIRED_LIVE = ["META_ACCESS_TOKEN", "META_APP_ID", "META_APP_SECRET"] as const;

export type SyncDecision =
  | { action: "skip"; reason: string }
  | { action: "mock" }
  | {
      action: "live";
      accessToken: string;
      appId: string;
      appSecret: string;
      accountIds: string[];
      graphVersion: string;
      attributionWindows: string[];
    };

/** Accepts `act_123` or `123`. Returns "" when the value is not an account id. */
export function normalizeAdAccountId(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const id = trimmed.startsWith("act_") ? trimmed : `act_${trimmed}`;
  return /^act_\d+$/.test(id) ? id : "";
}

/**
 * Comma-separated allow-list for this deployment.
 * Empty input is empty — there is no built-in account id.
 */
export function parseAdAccountIds(raw: string | undefined) {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const part of (raw || "").split(",")) {
    const id = normalizeAdAccountId(part);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * A non-empty env allow-list is exclusive.
 * When the env list is empty, previously stored syncEnabled accounts are used.
 */
export function resolveAccountIds(envIds: string[], dbEnabledIds: string[]) {
  const fromEnv = parseAdAccountIds(envIds.join(","));
  if (fromEnv.length) return fromEnv;
  return parseAdAccountIds(dbEnabledIds.join(","));
}

export function graphVersion(env: Env) {
  const raw = (env.META_GRAPH_VERSION || "v23.0").trim();
  return /^v\d+\.\d+$/.test(raw) ? raw : "v23.0";
}

export function attributionWindows(env: Env) {
  const parts = (env.META_ATTRIBUTION_WINDOWS || "7d_click,1d_view")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts : ["7d_click", "1d_view"];
}

export function attributionWindowLabel(windows: string[]) {
  return windows.join("_");
}

export const MAX_LOOKBACK_DAYS = 90;

export function lookbackDays(env: Env, fallback = 7) {
  const parsed = Number(env.MARKETING_LOOKBACK_DAYS ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_LOOKBACK_DAYS, Math.max(1, Math.floor(parsed)));
}

export function flagOn(env: Env, name: string) {
  const value = (env[name] || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "on" || value === "yes";
}

/** Off unless MARKETING_INTRADAY_SYNC is explicitly on. */
export function intradaySyncEnabled(env: Env = process.env) {
  return flagOn(env, "MARKETING_INTRADAY_SYNC");
}

/** Off unless MARKETING_MONITOR is explicitly on. */
export function monitorEnabled(env: Env = process.env) {
  return flagOn(env, "MARKETING_MONITOR");
}

/** Off unless MARKETING_DIGEST is explicitly on. Generation only. */
export function digestEnabled(env: Env = process.env) {
  return flagOn(env, "MARKETING_DIGEST");
}

/** Off unless MARKETING_DIGEST_DELIVERY is explicitly on. Sending stays unimplemented. */
export function digestDeliveryEnabled(env: Env = process.env) {
  return flagOn(env, "MARKETING_DIGEST_DELIVERY");
}

/** Off unless MARKETING_CLIENT_LINKS is explicitly on. */
export function clientLinksEnabled(env: Env = process.env) {
  return flagOn(env, "MARKETING_CLIENT_LINKS");
}

export const FULL_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const INTRADAY_SYNC_INTERVAL_MS = 15 * 60 * 1000;

export function marketingSyncIntervalMs(env: Env = process.env) {
  const fallback = intradaySyncEnabled(env) ? INTRADAY_SYNC_INTERVAL_MS : FULL_SYNC_INTERVAL_MS;
  const raw = env.MARKETING_SYNC_INTERVAL_MS;
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 60_000) return fallback;
  return Math.floor(parsed);
}

export const MONITOR_LAG_MS = 30 * 60 * 1000;
export const STALE_SYNC_MS = 20 * 60 * 1000;

export function baselineDays(env: Env = process.env) {
  const parsed = Number(env.MARKETING_BASELINE_DAYS ?? 7);
  if (!Number.isFinite(parsed)) return 7;
  return Math.min(90, Math.max(1, Math.floor(parsed)));
}

export function alertMinImpressions(env: Env = process.env) {
  const parsed = Number(env.MARKETING_ALERT_MIN_IMPRESSIONS ?? 200);
  if (!Number.isFinite(parsed)) return 200;
  return Math.max(1, Math.floor(parsed));
}

export function recommendationMinImpressions(env: Env = process.env) {
  const parsed = Number(env.MARKETING_MIN_IMPRESSIONS ?? 1000);
  if (!Number.isFinite(parsed)) return 1000;
  return Math.max(1, Math.floor(parsed));
}

export function recommendationMinClicks(env: Env = process.env) {
  const parsed = Number(env.MARKETING_MIN_CLICKS ?? 20);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.floor(parsed));
}

export type Benchmark = { ctr?: number; cpc?: number; cpm?: number; cpa?: number; cpl?: number };

export function verticalBenchmarks(env: Env = process.env): Record<string, Benchmark> {
  const raw = (env.MARKETING_BENCHMARKS || "").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, Benchmark>;
  } catch {
    return {};
  }
}

export function decideSync(env: Env): SyncDecision {
  const mode = (env.MARKETING_SYNC_MODE || "auto").trim().toLowerCase();
  if (mode === "off") return { action: "skip", reason: "MARKETING_SYNC_MODE=off" };
  if (mode === "mock") return { action: "mock" };
  if (mode !== "auto" && mode !== "live") {
    return { action: "skip", reason: `unknown MARKETING_SYNC_MODE ${mode}` };
  }
  const missing = REQUIRED_LIVE.filter((name) => !(env[name] || "").trim());
  if (missing.length) return { action: "skip", reason: `missing ${missing.join(", ")}` };
  return {
    action: "live",
    accessToken: env.META_ACCESS_TOKEN!.trim(),
    appId: env.META_APP_ID!.trim(),
    appSecret: env.META_APP_SECRET!.trim(),
    accountIds: parseAdAccountIds(env.META_AD_ACCOUNT_IDS),
    graphVersion: graphVersion(env),
    attributionWindows: attributionWindows(env),
  };
}

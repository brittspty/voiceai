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

export function marketingSyncIntervalMs(env: Env = process.env) {
  const parsed = Number(env.MARKETING_SYNC_INTERVAL_MS ?? 6 * 60 * 60 * 1000);
  if (!Number.isFinite(parsed) || parsed < 60_000) return 6 * 60 * 60 * 1000;
  return Math.floor(parsed);
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

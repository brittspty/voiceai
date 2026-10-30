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

/** Off unless MARKETING_CREATIVE_FATIGUE is explicitly on. */
export function creativeFatigueEnabled(env: Env = process.env) {
  return flagOn(env, "MARKETING_CREATIVE_FATIGUE");
}

/** Off unless MARKETING_PACING_RECS is explicitly on. Recommendations only. */
export function pacingRecsEnabled(env: Env = process.env) {
  return flagOn(env, "MARKETING_PACING_RECS");
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

/** Off unless MARKETING_CLIENT_VIEWERS is explicitly on. */
export function clientViewersEnabled(env: Env = process.env) {
  return flagOn(env, "MARKETING_CLIENT_VIEWERS");
}

/** Off unless MARKETING_SPEED_TO_LEAD is explicitly on. */
export function speedToLeadEnabled(env: Env = process.env) {
  return flagOn(env, "MARKETING_SPEED_TO_LEAD");
}

/** Off unless MARKETING_LEAD_SCORING is explicitly on. Rules only unless an API key is set. */
export function leadScoringEnabled(env: Env = process.env) {
  return flagOn(env, "MARKETING_LEAD_SCORING");
}

/** Off unless MARKETING_OFFLINE_CONVERSIONS is explicitly on. Dry run only until the live switch is also on. */
export function offlineConversionsEnabled(env: Env = process.env) {
  return flagOn(env, "MARKETING_OFFLINE_CONVERSIONS");
}

/** Off unless MARKETING_OFFLINE_CONVERSIONS_LIVE is explicitly on. Has no effect while the master switch is off. */
export function offlineConversionsLiveEnabled(env: Env = process.env) {
  return offlineConversionsEnabled(env) && flagOn(env, "MARKETING_OFFLINE_CONVERSIONS_LIVE");
}

/** Off unless MARKETING_PAGE_MONITOR is explicitly on. Checks only. */
export function pageMonitorEnabled(env: Env = process.env) {
  return flagOn(env, "MARKETING_PAGE_MONITOR");
}

/** Off unless MARKETING_PAGE_AUTOPAUSE is explicitly on. Also needs that client's opt-in. */
export function pageAutoPauseEnabled(env: Env = process.env) {
  return flagOn(env, "MARKETING_PAGE_AUTOPAUSE");
}

/** A public URL this worker must reach before a page failure can pause ads. */
export function pageMonitorCanaryUrl(env: Env = process.env) {
  const raw = (env.PAGE_MONITOR_CANARY_URL || "https://www.gstatic.com/generate_204").trim();
  return raw;
}

/** Off unless MARKETING_SEARCH_WASTE is explicitly on. Reads SearchTermMetric and exports a CSV. */
export function searchWasteEnabled(env: Env = process.env) {
  return flagOn(env, "MARKETING_SEARCH_WASTE");
}

/** Off unless MARKETING_COMPETITOR_WATCH is explicitly on. Meta Ad Library only. */
export function competitorWatchEnabled(env: Env = process.env) {
  return flagOn(env, "MARKETING_COMPETITOR_WATCH");
}

/** Off unless MARKETING_HOLDOUTS is explicitly on. Design and readout only. */
export function holdoutsEnabled(env: Env = process.env) {
  return flagOn(env, "MARKETING_HOLDOUTS");
}

export function adLibraryCountries(env: Env = process.env) {
  const parts = (env.META_AD_LIBRARY_COUNTRIES || "US")
    .split(",")
    .map((part) => part.trim().toUpperCase())
    .filter((part) => /^[A-Z]{2}$/.test(part));
  return parts.length ? parts : ["US"];
}

/** Off unless MARKETING_DASHBOARDS_V2 is explicitly on. */
export function dashboardsV2Enabled(env: Env = process.env) {
  return flagOn(env, "MARKETING_DASHBOARDS_V2");
}

export function amBudgetCapUsd(env: Env = process.env) {
  const parsed = Number(env.MARKETING_AM_BUDGET_CAP_USD ?? 500);
  if (!Number.isFinite(parsed) || parsed < 0) return 500;
  return parsed;
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

export const GOOGLE_ADS_REQUIRED = [
  "GOOGLE_ADS_DEVELOPER_TOKEN",
  "GOOGLE_ADS_CLIENT_ID",
  "GOOGLE_ADS_CLIENT_SECRET",
  "GOOGLE_ADS_REFRESH_TOKEN",
  "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
] as const;

export type GoogleAdsCredentialName = (typeof GOOGLE_ADS_REQUIRED)[number];

/** Off unless MARKETING_GOOGLE_ADS is explicitly on. */
export function googleAdsEnabled(env: Env = process.env) {
  return flagOn(env, "MARKETING_GOOGLE_ADS");
}

/** Accepts `1234567890` or `123-456-7890`. Returns "" when it is not a 10-digit id. */
export function normalizeCustomerId(raw: string) {
  const digits = raw.trim().replace(/-/g, "");
  return /^\d{10}$/.test(digits) ? digits : "";
}

/** Comma-separated Google Ads customer ids. Empty input is empty. */
export function parseCustomerIds(raw: string | undefined) {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const part of (raw || "").split(",")) {
    const id = normalizeCustomerId(part);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * REST major version. The path is `/v26`; minor releases such as v26.1 are served there.
 * v18–v22 are sunset (v21 on 2026-08-05, v22 on 2026-10-07). A sunset or invalid value
 * falls back to this constant so every caller shares one default.
 */
export const GOOGLE_ADS_API_VERSION = "v26";

const SUNSET_GOOGLE_ADS_VERSIONS = new Set(["v15", "v16", "v17", "v18", "v19", "v20", "v21", "v22"]);

export function googleAdsApiVersion(env: Env) {
  const raw = (env.GOOGLE_ADS_API_VERSION || "").trim();
  if (/^v\d+$/.test(raw) && !SUNSET_GOOGLE_ADS_VERSIONS.has(raw)) return raw;
  return GOOGLE_ADS_API_VERSION;
}

export type GoogleAdsEnv = {
  enabled: boolean;
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  loginCustomerId: string;
  /** From GOOGLE_ADS_CUSTOMER_IDS only. GOOGLE_ADS_CUSTOMER_ID is not read. */
  customerIds: string[];
  apiVersion: string;
};

/**
 * One parser for Google Ads env. One deployment is one client, so
 * GOOGLE_ADS_CUSTOMER_IDS is that client's account allow-list. A later
 * multi-client database should store the customer id on the client row.
 */
export function googleAdsEnv(env: Env = process.env): GoogleAdsEnv {
  return {
    enabled: googleAdsEnabled(env),
    developerToken: (env.GOOGLE_ADS_DEVELOPER_TOKEN || "").trim(),
    clientId: (env.GOOGLE_ADS_CLIENT_ID || "").trim(),
    clientSecret: (env.GOOGLE_ADS_CLIENT_SECRET || "").trim(),
    refreshToken: (env.GOOGLE_ADS_REFRESH_TOKEN || "").trim(),
    loginCustomerId: normalizeCustomerId(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || ""),
    customerIds: parseCustomerIds(env.GOOGLE_ADS_CUSTOMER_IDS),
    apiVersion: googleAdsApiVersion(env),
  };
}

export type GoogleAdsDecision =
  | { action: "skip"; reason: string }
  | { action: "mock" }
  | {
      action: "live";
      developerToken: string;
      clientId: string;
      clientSecret: string;
      refreshToken: string;
      loginCustomerId: string;
      customerIds: string[];
      apiVersion: string;
    };

/**
 * Google Ads sync does nothing unless MARKETING_GOOGLE_ADS is on.
 * Missing credentials skip. They do not throw.
 */
export function decideGoogleAdsSync(env: Env): GoogleAdsDecision {
  if (!googleAdsEnabled(env)) return { action: "skip", reason: "MARKETING_GOOGLE_ADS is off" };
  const mode = (env.MARKETING_SYNC_MODE || "auto").trim().toLowerCase();
  if (mode === "off") return { action: "skip", reason: "MARKETING_SYNC_MODE=off" };
  if (mode === "mock") return { action: "mock" };
  if (mode !== "auto" && mode !== "live") {
    return { action: "skip", reason: `unknown MARKETING_SYNC_MODE ${mode}` };
  }
  const settings = googleAdsEnv(env);
  const missing = GOOGLE_ADS_REQUIRED.filter((name) => !(env[name] || "").trim());
  if (missing.length) return { action: "skip", reason: `missing ${missing.join(", ")}` };
  if (!settings.loginCustomerId) return { action: "skip", reason: "GOOGLE_ADS_LOGIN_CUSTOMER_ID is not a 10-digit customer id" };
  return {
    action: "live",
    developerToken: settings.developerToken,
    clientId: settings.clientId,
    clientSecret: settings.clientSecret,
    refreshToken: settings.refreshToken,
    loginCustomerId: settings.loginCustomerId,
    customerIds: settings.customerIds,
    apiVersion: settings.apiVersion,
  };
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

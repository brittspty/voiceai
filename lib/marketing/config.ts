export type Env = Record<string, string | undefined>;

const REQUIRED_LIVE = ["META_ACCESS_TOKEN", "META_APP_ID", "META_APP_SECRET"] as const;

/** One read credential set. The token stays in env; `tokenEnv` is the pointer. */
export type MetaReadConnection = {
  /** `primary` or a name from META_EXTRA_CONNECTIONS. */
  name: string;
  tokenEnv: string;
  accessToken: string;
  appId: string;
  appSecret: string;
  accountIds: string[];
};

/** A listed connection that will not be called. `reason` names env vars, never secret values. */
export type MetaReadSkip = {
  name: string;
  reason: string;
};

export type SyncDecision =
  | { action: "skip"; reason: string }
  | { action: "mock" }
  | {
      action: "live";
      /**
       * Primary connection when it is configured. Otherwise the first ready connection.
       * Sync and the CLI read `connections` so each account uses the token that lists it.
       */
      accessToken: string;
      appId: string;
      appSecret: string;
      accountIds: string[];
      graphVersion: string;
      attributionWindows: string[];
      connections: MetaReadConnection[];
      skipped: MetaReadSkip[];
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

/** Off unless MARKETING_DIGEST and MARKETING_DIGEST_SEND are both on. This is the send switch. */
export function digestSendEnabled(env: Env = process.env) {
  return digestEnabled(env) && flagOn(env, "MARKETING_DIGEST_SEND");
}

/** Off unless AM_REALTIME_FEED is explicitly on. */
export function amRealtimeEnabled(env: Env = process.env) {
  return flagOn(env, "AM_REALTIME_FEED");
}

/** Off unless MARKETING_SKILL_APPROVAL is explicitly on. Fans a skill offer out to every super admin. */
export function skillApprovalFanoutEnabled(env: Env = process.env) {
  return flagOn(env, "MARKETING_SKILL_APPROVAL");
}

/** Off unless MARKETING_ROLE_ADMIN is explicitly on. */
export function roleAdminEnabled(env: Env = process.env) {
  return flagOn(env, "MARKETING_ROLE_ADMIN");
}

/** Off unless PASSWORD_RESET is explicitly on. While off, the forgot-password page stays the support instructions. */
export function passwordResetEnabled(env: Env = process.env) {
  return flagOn(env, "PASSWORD_RESET");
}

/** Off unless USER_ADMIN_V2 is explicitly on. */
export function userAdminEnabled(env: Env = process.env) {
  return flagOn(env, "USER_ADMIN_V2");
}

export function inboxEnabled(env: Env = process.env) {
  return digestSendEnabled(env) || amRealtimeEnabled(env) || skillApprovalFanoutEnabled(env);
}

/** Off unless ALL_CLIENTS_VIEWER_SEES_COST is explicitly on. Spend stays with super admins and account managers. */
export function allClientsViewerSeesCost(env: Env = process.env) {
  return flagOn(env, "ALL_CLIENTS_VIEWER_SEES_COST");
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

/** Off unless MARKETING_AD_FATIGUE is explicitly on. Recommendations only. No ad or budget writes. */
export function adFatigueEnabled(env: Env = process.env) {
  return flagOn(env, "MARKETING_AD_FATIGUE");
}

/** Off unless MARKETING_STACKADAPT is explicitly on. Kept for older deploys. Live reads use STACKADAPT_SYNC. */
export function stackAdaptEnabled(env: Env = process.env) {
  return flagOn(env, "MARKETING_STACKADAPT");
}

/** Off unless STACKADAPT_SYNC is explicitly on. Read-only, and only for mapped advertisers. */
export function stackAdaptSyncEnabled(env: Env = process.env) {
  return flagOn(env, "STACKADAPT_SYNC");
}

/** Off unless TRAXY_SYNC is explicitly on. Read-only. INTEGRATIONS_MODE is not consulted. */
export function traxySyncEnabled(env: Env = process.env) {
  return flagOn(env, "TRAXY_SYNC");
}

/** Off unless APOLLO_SYNC is explicitly on. Read-only. INTEGRATIONS_MODE is not consulted. */
export function apolloSyncEnabled(env: Env = process.env) {
  return flagOn(env, "APOLLO_SYNC");
}

export type ProspectSyncDecision = { action: "skip"; reason: string } | { action: "mock" } | { action: "live" };

/**
 * TRAXY_SYNC or APOLLO_SYNC must be on.
 * MARKETING_SYNC_MODE=mock loads a fixture and makes no request.
 * live or auto is a live read once that source has a key. off skips.
 * INTEGRATIONS_MODE is not read. Per-client live read is applied by the sync.
 */
export function decideProspectSync(env: Env, flag: "TRAXY_SYNC" | "APOLLO_SYNC"): ProspectSyncDecision {
  if (!flagOn(env, flag)) return { action: "skip", reason: `${flag} is off` };
  const mode = (env.MARKETING_SYNC_MODE || "auto").trim().toLowerCase();
  if (mode === "off") return { action: "skip", reason: "MARKETING_SYNC_MODE=off" };
  if (mode === "mock") return { action: "mock" };
  if (mode !== "auto" && mode !== "live") return { action: "skip", reason: `unknown MARKETING_SYNC_MODE ${mode}` };
  return { action: "live" };
}

/** Off unless CTV_ATTRIBUTION is explicitly on. Staff-only read of CTV attribution. */
export function ctvAttributionEnabled(env: Env = process.env) {
  return flagOn(env, "CTV_ATTRIBUTION");
}

/**
 * Off unless STACKADAPT_CTV_LIVE is explicitly on.
 * On replaces the example CTV pages with stored StackAdapt delivery.
 * The read uses the StackAdapt sync gate. INTEGRATIONS_MODE stays mock and is not consulted.
 */
export function stackAdaptCtvLiveEnabled(env: Env = process.env) {
  return flagOn(env, "STACKADAPT_CTV_LIVE");
}

/** Days per campaignInsight breakdown request. A long range often returns only the latest week. */
export function ctvBreakdownChunkDays(env: Env = process.env) {
  const parsed = Number(env.CTV_BREAKDOWN_CHUNK_DAYS ?? 7);
  if (!Number.isFinite(parsed)) return 7;
  return Math.min(31, Math.max(1, Math.floor(parsed)));
}

export type CtvAttributionDecision = { action: "skip"; reason: string } | { action: "mock" } | { action: "live"; apiKey: string };

/**
 * Mock, or a missing StackAdapt key, uses fixtures and makes no outbound call.
 * INTEGRATIONS_MODE must be live before a GET is allowed.
 */
export function decideCtvAttribution(env: Env): CtvAttributionDecision {
  if (!ctvAttributionEnabled(env)) return { action: "skip", reason: "CTV_ATTRIBUTION is off" };
  const sync = (env.MARKETING_SYNC_MODE || "auto").trim().toLowerCase();
  if (sync === "off") return { action: "skip", reason: "MARKETING_SYNC_MODE=off" };
  const integrations = (env.INTEGRATIONS_MODE || "mock").trim().toLowerCase();
  if (integrations !== "live" || sync === "mock") return { action: "mock" };
  const apiKey = (env.STACKADAPT_API_KEY || "").trim();
  if (!apiKey) return { action: "mock" };
  return { action: "live", apiKey };
}

/** Off unless MARKETING_GBP is explicitly on. Read-only Business Profile reads. */
export function googleBusinessProfileEnabled(env: Env = process.env) {
  return flagOn(env, "MARKETING_GBP");
}

export type StackAdaptDecision = { action: "skip"; reason: string } | { action: "mock" } | { action: "live"; apiKey: string };

/**
 * Same gate as Meta reads. INTEGRATIONS_MODE stays mock and is not consulted.
 * STACKADAPT_SYNC must be on. MARKETING_SYNC_MODE=live, or auto (the default) with
 * STACKADAPT_API_KEY set, is a live read. mock uses fixtures. off skips.
 * A missing key skips. It does not throw. Per-client stackadaptLiveRead is applied by the sync.
 */
export function decideStackAdapt(env: Env): StackAdaptDecision {
  if (!stackAdaptSyncEnabled(env)) return { action: "skip", reason: "STACKADAPT_SYNC is off" };
  const mode = (env.MARKETING_SYNC_MODE || "auto").trim().toLowerCase();
  if (mode === "off") return { action: "skip", reason: "MARKETING_SYNC_MODE=off" };
  if (mode === "mock") return { action: "mock" };
  if (mode !== "auto" && mode !== "live") return { action: "skip", reason: `unknown MARKETING_SYNC_MODE ${mode}` };
  const apiKey = (env.STACKADAPT_API_KEY || "").trim();
  if (!apiKey) return { action: "skip", reason: "missing STACKADAPT_API_KEY" };
  return { action: "live", apiKey };
}

/**
 * CTV delivery read. Off makes no request and leaves the example pages in place.
 * On follows decideStackAdapt: STACKADAPT_SYNC, the key, and mapped advertisers.
 * INTEGRATIONS_MODE is not consulted.
 */
export function decideStackAdaptCtv(env: Env): StackAdaptDecision {
  if (!stackAdaptCtvLiveEnabled(env)) return { action: "skip", reason: "STACKADAPT_CTV_LIVE is off" };
  return decideStackAdapt(env);
}

/** Probe and backfill call StackAdapt only when this is live. Mock and skip make no request. */
export function stackAdaptLiveRead(env: Env): { ok: true; apiKey: string } | { ok: false; reason: string } {
  const decision = decideStackAdapt(env);
  if (decision.action === "live") return { ok: true, apiKey: decision.apiKey };
  if (decision.action === "mock") return { ok: false, reason: "MARKETING_SYNC_MODE=mock" };
  return { ok: false, reason: decision.reason };
}

/** Whole days for a backfill or probe. Null when the value is missing, not a whole number, or above 90. */
export function parseLookbackArg(raw: string | undefined) {
  const trimmed = (raw || "").trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const days = Number(trimmed);
  if (days < 1 || days > MAX_LOOKBACK_DAYS) return null;
  return days;
}

export type GoogleBusinessDecision =
  | { action: "skip"; reason: string }
  | { action: "mock"; accountId: string; locationIds: string[] }
  | { action: "live"; clientId: string; clientSecret: string; refreshToken: string; accountId: string; locationIds: string[] };

function businessIds(raw: string | undefined) {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const part of (raw || "").split(",")) {
    const digits = part.trim().replace(/^locations\//, "");
    if (!/^\d+$/.test(digits) || seen.has(digits)) continue;
    seen.add(digits);
    ids.push(digits);
  }
  return ids;
}

/**
 * Business Profile uses the same Google OAuth client id, secret, and refresh token as Google Ads.
 * This connector only GETs. A missing location list skips.
 */
export function decideGoogleBusinessProfile(env: Env): GoogleBusinessDecision {
  if (!googleBusinessProfileEnabled(env)) return { action: "skip", reason: "MARKETING_GBP is off" };
  const mode = (env.MARKETING_SYNC_MODE || "auto").trim().toLowerCase();
  const locationIds = businessIds(env.GOOGLE_BUSINESS_LOCATION_IDS);
  const accountId = (env.GOOGLE_BUSINESS_ACCOUNT_ID || "").trim().replace(/^accounts\//, "");
  if (mode === "off") return { action: "skip", reason: "MARKETING_SYNC_MODE=off" };
  if (mode === "mock") return { action: "mock", accountId, locationIds };
  if (mode !== "auto" && mode !== "live") return { action: "skip", reason: `unknown MARKETING_SYNC_MODE ${mode}` };
  const clientId = (env.GOOGLE_ADS_CLIENT_ID || "").trim();
  const clientSecret = (env.GOOGLE_ADS_CLIENT_SECRET || "").trim();
  const refreshToken = (env.GOOGLE_ADS_REFRESH_TOKEN || "").trim();
  const missing = [
    !clientId ? "GOOGLE_ADS_CLIENT_ID" : "",
    !clientSecret ? "GOOGLE_ADS_CLIENT_SECRET" : "",
    !refreshToken ? "GOOGLE_ADS_REFRESH_TOKEN" : "",
    !locationIds.length ? "GOOGLE_BUSINESS_LOCATION_IDS" : "",
  ].filter(Boolean);
  if (missing.length) return { action: "skip", reason: `missing ${missing.join(", ")}` };
  return { action: "live", clientId, clientSecret, refreshToken, accountId, locationIds };
}

/** Off unless MARKETING_DATA_INTAKE is explicitly on. */
export function dataIntakeEnabled(env: Env = process.env) {
  return flagOn(env, "MARKETING_DATA_INTAKE");
}

/** Off unless MARKETING_METRIC_DICTIONARY is explicitly on. */
export function metricDictionaryEnabled(env: Env = process.env) {
  return flagOn(env, "MARKETING_METRIC_DICTIONARY");
}

/** Off unless MARKETING_PROVENANCE is explicitly on. */
export function provenanceEnabled(env: Env = process.env) {
  return flagOn(env, "MARKETING_PROVENANCE");
}

/** Off unless MARKETING_COVERAGE is explicitly on. */
export function coverageScoreEnabled(env: Env = process.env) {
  return flagOn(env, "MARKETING_COVERAGE");
}

/** Off unless SEGMENT_ENGINE is explicitly on. */
export function segmentEngineEnabled(env: Env = process.env) {
  return flagOn(env, "SEGMENT_ENGINE");
}

export function adLibraryCountries(env: Env = process.env) {
  const parts = (env.META_AD_LIBRARY_COUNTRIES || "US")
    .split(",")
    .map((part) => part.trim().toUpperCase())
    .filter((part) => /^[A-Z]{2}$/.test(part));
  return parts.length ? parts : ["US"];
}

/** Off unless CLIENT_METRIC_VISIBILITY is explicitly on. Existing client dashboards stay as they are. */
export function clientMetricVisibilityEnabled(env: Env = process.env) {
  return flagOn(env, "CLIENT_METRIC_VISIBILITY");
}

/** Off unless MARKETING_DASHBOARDS_V2 is explicitly on. */
export function dashboardsV2Enabled(env: Env = process.env) {
  return flagOn(env, "MARKETING_DASHBOARDS_V2");
}

/**
 * Off unless MARKETING_CLIENT_SWITCHER is explicitly on.
 * While off, the staff marketing dashboard stays workspace-wide.
 */
export function marketingClientSwitcherEnabled(env: Env = process.env) {
  return flagOn(env, "MARKETING_CLIENT_SWITCHER");
}

/** Off unless JARVIS_UI_V2 is explicitly on. The current UI stays in place. */
export function jarvisUiV2Enabled(env: Env = process.env) {
  return flagOn(env, "JARVIS_UI_V2");
}

/** Off unless DECISIONS_V1 is explicitly on. /decisions keeps its current screen. */
export function decisionsV1Enabled(env: Env = process.env) {
  return flagOn(env, "DECISIONS_V1");
}

/** Impressions per unique impression before a CTV frequency decision. Default 5. */
export function ctvFrequencyCap(env: Env = process.env) {
  const raw = (env.CTV_FREQUENCY_CAP || "").trim();
  if (!raw) return 5;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 5;
  return parsed;
}

/** Off unless CHANNEL_REGISTRY is explicitly on. Existing channel screens stay as they are. */
export function channelRegistryEnabled(env: Env = process.env) {
  return flagOn(env, "CHANNEL_REGISTRY");
}

/** Off unless CHANNEL_REGISTRY and CHATGPT_ADS are both on. Keys are sealed by the registry. */
export function chatgptAdsEnabled(env: Env = process.env) {
  return channelRegistryEnabled(env) && flagOn(env, "CHATGPT_ADS");
}

/** `dollars` or `micros`. Unset means the first live Insights response still needs a person to confirm units. */
export function chatgptAdsSpendUnit(env: Env = process.env): "dollars" | "micros" | "unverified" {
  const raw = (env.CHATGPT_ADS_SPEND_UNIT || "").trim().toLowerCase();
  if (raw === "dollars" || raw === "micros") return raw;
  return "unverified";
}

/** Off unless AUDIENCE_LIBRARY is explicitly on. MAID import, dry-run sync, and pixel tracking. */
export function audienceLibraryEnabled(env: Env = process.env) {
  return flagOn(env, "AUDIENCE_LIBRARY");
}

/** Off unless AUDIENCE_DATA is explicitly on. Staff example screen. No outbound calls. */
export function audienceDataEnabled(env: Env = process.env) {
  return flagOn(env, "AUDIENCE_DATA");
}

/** Off unless AUDIENCE_DATA_CLIENT is explicitly on. Client example screen. Independent of the staff switch. */
export function audienceDataClientEnabled(env: Env = process.env) {
  return flagOn(env, "AUDIENCE_DATA_CLIENT");
}

/** Off unless RESOLUTION_DATA is explicitly on. Example counts only. No platform writes. */
export function resolutionDataEnabled(env: Env = process.env) {
  return flagOn(env, "RESOLUTION_DATA");
}

/** Days without a refresh before a source is stale. Default 7. */
export function audienceDataStaleMs(env: Env = process.env) {
  const raw = (env.AUDIENCE_DATA_STALE_DAYS || "").trim();
  const days = raw ? Number(raw) : 7;
  const safe = Number.isFinite(days) && days > 0 ? days : 7;
  return safe * 24 * 60 * 60 * 1000;
}

/**
 * Off unless AUDIENCE_PUSH_ENABLED is explicitly on.
 * Has no effect while the audience library is off. Default is dry-run logging.
 */
export function audiencePushEnabled(env: Env = process.env) {
  return audienceLibraryEnabled(env) && flagOn(env, "AUDIENCE_PUSH_ENABLED");
}

/** Off unless AUDIENCE_RETAIN_RAW_MAIDS is explicitly on. Raw values are encrypted. */
export function retainRawMaids(env: Env = process.env) {
  return flagOn(env, "AUDIENCE_RETAIN_RAW_MAIDS");
}

export function audienceMaidKey(env: Env = process.env) {
  return (env.AUDIENCE_MAID_KEY || "").trim();
}

/** Off unless LIST_VALIDATION_GATE is explicitly on. Checks are recommendations only. */
export function listValidationGateEnabled(env: Env = process.env) {
  return flagOn(env, "LIST_VALIDATION_GATE");
}

function configPercent(env: Env, name: string, fallback: number) {
  const raw = (env[name] || "").trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed > 1 ? parsed / 100 : parsed;
}

export type ListValidationConfig = {
  seedMinPercent: number;
  seedMaxPercent: number;
  seedRate: number;
  seedMatchMaxPercent: number;
  holdoutPercent: number;
  googleMatchMin: number;
  googleMatchMax: number;
};

/** Defaults: seeds 2–5% (use 3%), flag seed matches above 5%, 10% holdout, Google match 29–62%. */
export function listValidationConfig(env: Env = process.env): ListValidationConfig {
  const seedMinPercent = configPercent(env, "LIST_VALIDATION_SEED_MIN", 0.02);
  const seedMaxPercent = configPercent(env, "LIST_VALIDATION_SEED_MAX", 0.05);
  const seedRate = Math.min(seedMaxPercent, Math.max(seedMinPercent, configPercent(env, "LIST_VALIDATION_SEED_RATE", 0.03)));
  return {
    seedMinPercent,
    seedMaxPercent,
    seedRate,
    seedMatchMaxPercent: configPercent(env, "LIST_VALIDATION_SEED_MATCH_MAX", 0.05),
    holdoutPercent: configPercent(env, "LIST_VALIDATION_HOLDOUT", 0.1),
    googleMatchMin: configPercent(env, "LIST_VALIDATION_GOOGLE_MATCH_MIN", 0.29),
    googleMatchMax: configPercent(env, "LIST_VALIDATION_GOOGLE_MATCH_MAX", 0.62),
  };
}

/** Off unless JARVIS_REPORTS_V2 is explicitly on. */
export function reportsV2Enabled(env: Env = process.env) {
  return flagOn(env, "JARVIS_REPORTS_V2");
}

/** Off unless REPORTS_P1 is explicitly on. Reports v2 stays as it is. */
export function reportsP1Enabled(env: Env = process.env) {
  return flagOn(env, "REPORTS_P1");
}

/** Off unless AUDIENCE_DATA_P1 is explicitly on. Segment engine and Audience Data v1 stay as they are. */
export function audienceDataP1Enabled(env: Env = process.env) {
  return flagOn(env, "AUDIENCE_DATA_P1");
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

/**
 * Live sync skips when any of these are blank.
 * GOOGLE_ADS_DEVELOPER_TOKEN is optional. Google retired developer tokens on
 * 2026-09-09. Access follows the Cloud project that owns the OAuth client.
 */
export const GOOGLE_ADS_REQUIRED = [
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

/** Off unless GOOGLE_ANALYTICS_SYNC is explicitly on. Read-only. Does not use the Google Ads token. */
export function googleAnalyticsSyncEnabled(env: Env = process.env) {
  return flagOn(env, "GOOGLE_ANALYTICS_SYNC");
}

/** Off unless CLARITY_SYNC is explicitly on. Read-only Data Export API. */
export function claritySyncEnabled(env: Env = process.env) {
  return flagOn(env, "CLARITY_SYNC");
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
 * One parser for Google Ads env.
 * GOOGLE_ADS_CUSTOMER_IDS is an optional extra allow-list.
 * The sync reads only customer ids saved on a client with googleAdsLiveRead on,
 * and only the overlap when this list is set.
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
 * INTEGRATIONS_MODE stays mock in production and is not consulted.
 * MARKETING_SYNC_MODE=live, or auto (the default) with OAuth credentials, is a live read.
 * mock uses fixtures. off skips. Missing OAuth credentials or a login customer id skip.
 * A blank GOOGLE_ADS_DEVELOPER_TOKEN does not skip.
 * Per-client googleAdsLiveRead is applied by the sync, not here.
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

/** Probe and backfill call Google only when this is live. Mock and skip make no request. */
export function googleAdsLiveRead(env: Env):
  | {
      ok: true;
      developerToken: string;
      clientId: string;
      clientSecret: string;
      refreshToken: string;
      loginCustomerId: string;
      customerIds: string[];
      apiVersion: string;
    }
  | { ok: false; reason: string } {
  const decision = decideGoogleAdsSync(env);
  if (decision.action === "live") {
    return {
      ok: true,
      developerToken: decision.developerToken,
      clientId: decision.clientId,
      clientSecret: decision.clientSecret,
      refreshToken: decision.refreshToken,
      loginCustomerId: decision.loginCustomerId,
      customerIds: decision.customerIds,
      apiVersion: decision.apiVersion,
    };
  }
  if (decision.action === "mock") return { ok: false, reason: "MARKETING_SYNC_MODE=mock" };
  return { ok: false, reason: decision.reason };
}

const EXTRA_CONNECTION_NAME = /^[a-z][a-z0-9_]{0,32}$/;

export const PRIMARY_META_CONNECTION = "primary";

/**
 * Names from META_EXTRA_CONNECTIONS. Blank entries are ignored.
 * `primary` and anything that is not a short slug are invalid and skipped.
 */
export function parseExtraConnectionNames(raw: string | undefined) {
  const names: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const part of (raw || "").split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const name = trimmed.toLowerCase();
    if (name === PRIMARY_META_CONNECTION || !EXTRA_CONNECTION_NAME.test(name)) {
      invalid.push(trimmed);
      continue;
    }
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return { names, invalid };
}

/** Env var names for one extra connection. The name is the slug, not the token. */
export function metaExtraEnv(name: string) {
  const prefix = `META_${name.trim().toUpperCase()}`;
  return {
    tokenEnv: `${prefix}_ACCESS_TOKEN`,
    appIdEnv: `${prefix}_APP_ID`,
    appSecretEnv: `${prefix}_APP_SECRET`,
    accountIdsEnv: `${prefix}_AD_ACCOUNT_IDS`,
  };
}

export type MetaReadPlan = {
  action: "skip" | "mock" | "live";
  reason?: string;
  graphVersion: string;
  attributionWindows: string[];
  connections: MetaReadConnection[];
  skipped: MetaReadSkip[];
};

export type MetaAccountPull = {
  name: string;
  tokenEnv: string;
  accessToken: string;
  appId: string;
  appSecret: string;
  accountIds: string[];
};

function emptyPlan(action: MetaReadPlan["action"], env: Env, reason?: string): MetaReadPlan {
  return {
    action,
    reason,
    graphVersion: graphVersion(env),
    attributionWindows: attributionWindows(env),
    connections: [],
    skipped: [],
  };
}

function envTrimmed(env: Env, name: string) {
  return (env[name] || "").trim();
}

/**
 * Every Meta read connection for this process.
 * The primary META_* variables stay the first connection.
 * META_EXTRA_CONNECTIONS lists more. A missing extra token, app id, app secret,
 * or account allow-list skips that name and leaves the others in place.
 * An extra connection does not fall back to stored accounts.
 */
export function planMetaReads(env: Env): MetaReadPlan {
  const mode = (env.MARKETING_SYNC_MODE || "auto").trim().toLowerCase();
  if (mode === "off") return emptyPlan("skip", env, "MARKETING_SYNC_MODE=off");
  if (mode === "mock") return emptyPlan("mock", env);
  if (mode !== "auto" && mode !== "live") return emptyPlan("skip", env, `unknown MARKETING_SYNC_MODE ${mode}`);

  const connections: MetaReadConnection[] = [];
  const skipped: MetaReadSkip[] = [];
  const primaryMissing = REQUIRED_LIVE.filter((name) => !envTrimmed(env, name));
  if (primaryMissing.length) {
    skipped.push({ name: PRIMARY_META_CONNECTION, reason: `missing ${primaryMissing.join(", ")}` });
  } else {
    connections.push({
      name: PRIMARY_META_CONNECTION,
      tokenEnv: "META_ACCESS_TOKEN",
      accessToken: envTrimmed(env, "META_ACCESS_TOKEN"),
      appId: envTrimmed(env, "META_APP_ID"),
      appSecret: envTrimmed(env, "META_APP_SECRET"),
      accountIds: parseAdAccountIds(env.META_AD_ACCOUNT_IDS),
    });
  }

  const listed = parseExtraConnectionNames(env.META_EXTRA_CONNECTIONS);
  for (const name of listed.invalid) {
    skipped.push({ name: name.toLowerCase(), reason: `invalid Meta connection name ${name}` });
  }
  for (const name of listed.names) {
    const vars = metaExtraEnv(name);
    const missing = [vars.tokenEnv, vars.appIdEnv, vars.appSecretEnv].filter((key) => !envTrimmed(env, key));
    if (missing.length) {
      skipped.push({ name, reason: `missing ${missing.join(", ")}` });
      continue;
    }
    const accountIds = parseAdAccountIds(env[vars.accountIdsEnv]);
    if (!accountIds.length) {
      skipped.push({ name, reason: `${vars.accountIdsEnv} has no ad account ids` });
      continue;
    }
    connections.push({
      name,
      tokenEnv: vars.tokenEnv,
      accessToken: envTrimmed(env, vars.tokenEnv),
      appId: envTrimmed(env, vars.appIdEnv),
      appSecret: envTrimmed(env, vars.appSecretEnv),
      accountIds,
    });
  }

  if (!connections.length) {
    const primary = skipped.find((row) => row.name === PRIMARY_META_CONNECTION);
    return {
      ...emptyPlan("skip", env, primary?.reason ?? "missing META_ACCESS_TOKEN, META_APP_ID, META_APP_SECRET"),
      skipped,
    };
  }
  return {
    action: "live",
    graphVersion: graphVersion(env),
    attributionWindows: attributionWindows(env),
    connections,
    skipped,
  };
}

function pullFor(connection: MetaReadConnection, accountIds: string[]): MetaAccountPull {
  return {
    name: connection.name,
    tokenEnv: connection.tokenEnv,
    accessToken: connection.accessToken,
    appId: connection.appId,
    appSecret: connection.appSecret,
    accountIds,
  };
}

function claimAccounts(connections: MetaReadConnection[]) {
  const owner = new Map<string, MetaReadConnection>();
  const warnings: string[] = [];
  for (const connection of connections) {
    for (const id of connection.accountIds) {
      const existing = owner.get(id);
      if (existing) {
        warnings.push(`${id} is listed on ${existing.name} and ${connection.name}; syncing it with ${existing.name}`);
        continue;
      }
      owner.set(id, connection);
    }
  }
  return { owner, warnings };
}

function pushAccount(grouped: Map<string, string[]>, name: string, id: string) {
  const rows = grouped.get(name) ?? [];
  if (!rows.includes(id)) rows.push(id);
  grouped.set(name, rows);
}

function pullsFrom(connections: MetaReadConnection[], grouped: Map<string, string[]>) {
  const pulls: MetaAccountPull[] = [];
  for (const connection of connections) {
    const accountIds = grouped.get(connection.name) ?? [];
    if (accountIds.length) pulls.push(pullFor(connection, accountIds));
  }
  return pulls;
}

function fallbackAccountIds(connections: MetaReadConnection[], dbEnabledIds: string[]) {
  const ownedByExtra = new Set<string>();
  for (const connection of connections) {
    if (connection.name === PRIMARY_META_CONNECTION) continue;
    for (const id of connection.accountIds) ownedByExtra.add(id);
  }
  return parseAdAccountIds(dbEnabledIds.join(",")).filter((id) => !ownedByExtra.has(id));
}

export type MetaRoute =
  | { ok: true; pulls: MetaAccountPull[]; skipped: MetaReadSkip[]; warnings: string[] }
  | { ok: false; reason: string };

/**
 * Assigns each account to the connection that may read it.
 * Primary is first. An account listed twice uses the earlier connection.
 * `--connection` forces that credential for the requested accounts.
 * An account on no list uses the only ready connection. With several connections it is an error.
 * The primary's empty allow-list uses `dbEnabledIds`, minus accounts owned by an extra connection.
 * Extra connections never use that fallback.
 */
export function routeMetaAccounts(
  source: { connections: MetaReadConnection[]; skipped?: MetaReadSkip[] },
  options: { accounts?: string[]; connection?: string | null; dbEnabledIds?: string[] } = {},
): MetaRoute {
  const skipped = source.skipped ?? [];
  const requestedName = (options.connection || "").trim().toLowerCase();
  if (requestedName) {
    if (requestedName !== PRIMARY_META_CONNECTION && !EXTRA_CONNECTION_NAME.test(requestedName)) {
      return { ok: false, reason: `unknown Meta connection ${options.connection}` };
    }
    const found = source.connections.find((connection) => connection.name === requestedName);
    if (!found) {
      const skip = skipped.find((row) => row.name === requestedName);
      return { ok: false, reason: skip ? `${requestedName} skipped: ${skip.reason}` : `unknown Meta connection ${requestedName}` };
    }
    let accountIds = options.accounts?.length ? parseAdAccountIds(options.accounts.join(",")) : found.accountIds;
    if (!accountIds.length && found.name === PRIMARY_META_CONNECTION && options.dbEnabledIds) {
      accountIds = fallbackAccountIds(source.connections, options.dbEnabledIds);
    }
    if (!accountIds.length) {
      const reason =
        found.name === PRIMARY_META_CONNECTION
          ? "No ad accounts. Pass --account act_... or set META_AD_ACCOUNT_IDS."
          : `${metaExtraEnv(found.name).accountIdsEnv} has no ad account ids`;
      return { ok: false, reason };
    }
    return { ok: true, pulls: [pullFor(found, accountIds)], skipped, warnings: [] };
  }

  if (options.accounts?.length) {
    const requested = parseAdAccountIds(options.accounts.join(","));
    if (!requested.length) return { ok: false, reason: "No ad accounts. Pass --account act_... or set META_AD_ACCOUNT_IDS." };
    const { owner, warnings } = claimAccounts(source.connections);
    const grouped = new Map<string, string[]>();
    for (const id of requested) {
      const found = owner.get(id);
      if (found) {
        pushAccount(grouped, found.name, id);
        continue;
      }
      if (source.connections.length === 1) {
        pushAccount(grouped, source.connections[0]!.name, id);
        continue;
      }
      return { ok: false, reason: `${id} is not on a Meta connection allow-list. Pass --connection <name>.` };
    }
    return { ok: true, pulls: pullsFrom(source.connections, grouped), skipped, warnings };
  }

  const { owner, warnings } = claimAccounts(source.connections);
  const grouped = new Map<string, string[]>();
  const primary = source.connections.find((connection) => connection.name === PRIMARY_META_CONNECTION);
  if (primary && !primary.accountIds.length && options.dbEnabledIds) {
    for (const id of fallbackAccountIds(source.connections, options.dbEnabledIds)) pushAccount(grouped, primary.name, id);
  }
  for (const connection of source.connections) {
    for (const id of connection.accountIds) {
      if (owner.get(id)?.name !== connection.name) continue;
      pushAccount(grouped, connection.name, id);
    }
  }
  return { ok: true, pulls: pullsFrom(source.connections, grouped), skipped, warnings };
}

/** Pointer stored on the one Meta PlatformConnection row. Never a token value. */
export function metaSecretRef(plan: MetaReadPlan) {
  const primary = plan.connections.find((connection) => connection.name === PRIMARY_META_CONNECTION);
  const chosen = primary ?? plan.connections[0];
  return chosen ? `env:${chosen.tokenEnv}` : "env:META_ACCESS_TOKEN";
}

export function decideSync(env: Env): SyncDecision {
  const plan = planMetaReads(env);
  if (plan.action === "mock") return { action: "mock" };
  if (plan.action === "skip" || !plan.connections.length) {
    return { action: "skip", reason: plan.reason || "missing META_ACCESS_TOKEN, META_APP_ID, META_APP_SECRET" };
  }
  const primary = plan.connections.find((connection) => connection.name === PRIMARY_META_CONNECTION);
  const head = primary ?? plan.connections[0]!;
  return {
    action: "live",
    accessToken: head.accessToken,
    appId: head.appId,
    appSecret: head.appSecret,
    accountIds: head.accountIds,
    graphVersion: plan.graphVersion,
    attributionWindows: plan.attributionWindows,
    connections: plan.connections,
    skipped: plan.skipped,
  };
}

import { flagOn, type Env } from "../demo/flags";
import { SENSITIVE_CAPTURE_ATTRIBUTE, SENSITIVE_CAPTURE_CLASS } from "./capture";
import {
  analyticsConsentGranted,
  readAnalyticsConsent,
  type AnalyticsConsentLevel,
} from "./consent";

/** US PostHog cloud. The browser SDK and the replay recorder both use this host. */
export const POSTHOG_API_HOST = "https://us.i.posthog.com";

const STAFF_ROLES = new Set([
  "owner",
  "admin",
  "viewer",
  "super_admin",
  "account_manager",
  "all_clients_viewer",
]);

const IDENTIFY_ROLES = new Set([...STAFF_ROLES, "client_viewer", "client_owner", "demo_viewer"]);

const TOKEN_QUERY_KEYS = new Set([
  "token",
  "access_token",
  "id_token",
  "refresh_token",
  "reset_token",
  "magic",
  "magic_token",
  "invite",
  "invite_token",
  "share_token",
  "auth",
  "auth_token",
  "session_token",
  "code",
]);

const URL_PROPERTY_KEYS = new Set([
  "$current_url",
  "$referrer",
  "$referring_domain",
  "$pathname",
  "$prev_pageview_pathname",
  "$session_entry_url",
  "$session_entry_pathname",
  "$session_entry_referrer",
  "$session_entry_referring_domain",
  "url",
  "$canonical_url",
]);

const TEXT_PROPERTY_KEYS = new Set([
  "$el_text",
  "$el_inner_text",
  "$elements_chain_texts",
  "$selected_content",
  "$copy_text",
  "$input_value",
  "$dead_click_text",
  "el_text",
  "text",
  "inner_text",
  "element_text",
]);

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]*)\d{3}[\s.-]*\d{4}/;

export type AnalyticsSurface = "staff" | "client" | "embed";

export type PosthogLoadReason = "disabled" | "missing-key" | "missing-path" | "excluded" | "consent" | "ok";

export type PosthogDecision = {
  load: boolean;
  reason: PosthogLoadReason;
  surface: AnalyticsSurface;
  identify: boolean;
};

export function posthogEnabled(env: Env = process.env) {
  return flagOn(env, "POSTHOG_ENABLED");
}

/**
 * Browser project key. NEXT_PUBLIC_POSTHOG_KEY is the client env.
 * At deploy, set it from the POSTHOG_PROJECT_API_KEY secret.
 * The server also reads that secret at runtime and passes it through only when the switch is on.
 */
export function posthogBrowserKey(env: Env = process.env) {
  const published = (env.NEXT_PUBLIC_POSTHOG_KEY || "").trim();
  if (published) return published;
  return (env.POSTHOG_PROJECT_API_KEY || "").trim();
}

export function normalizeAnalyticsPath(pathname: string) {
  const raw = pathname.split(/[?#]/, 1)[0] || "/";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  const trimmed = withSlash.length > 1 && withSlash.endsWith("/") ? withSlash.slice(0, -1) : withSlash;
  return trimmed.toLowerCase();
}

export function pathCarriesToken(pathname: string) {
  const path = normalizeAnalyticsPath(pathname);
  if (path === "/invite" || path.startsWith("/invite/")) return true;
  if (path === "/share" || path.startsWith("/share/") || path.startsWith("/api/share/")) return true;
  if (path === "/plan" || path.startsWith("/plan/")) return true;
  if (path === "/demo/enter" || path.startsWith("/demo/enter/")) return true;
  return false;
}

function queryCarriesToken(query: string) {
  const raw = query.replace(/^[?#]/, "");
  if (!raw) return false;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(raw);
  } catch {
    return /(?:^|[&])(token|access_token|id_token|refresh_token|code)=/i.test(raw);
  }
  for (const [key, value] of params) {
    if (TOKEN_QUERY_KEYS.has(key.toLowerCase())) return true;
    if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.trim())) return true;
  }
  return false;
}

export function urlCarriesToken(pathname: string, search = "", hash = "") {
  if (pathCarriesToken(pathname)) return true;
  if (queryCarriesToken(search)) return true;
  if (queryCarriesToken(hash)) return true;
  return false;
}

/** Auth pages, magic-link pages, and any URL that carries a token. */
export function posthogExcluded(pathname: string, search = "", hash = "") {
  const path = normalizeAnalyticsPath(pathname);
  if (!path) return true;
  if (path === "/login" || path.endsWith("/login")) return true;
  if (path === "/forgot-password" || path.startsWith("/forgot-password/")) return true;
  if (path === "/reset-password" || path.startsWith("/reset-password/")) return true;
  if (path === "/request-access" || path.startsWith("/request-access/")) return true;
  if (path.includes("magic-link") || path.includes("magic_link")) return true;
  if (urlCarriesToken(path, search, hash)) return true;
  return false;
}

export function analyticsSurface(input: { pathname: string; role?: string | null; embed?: boolean }): AnalyticsSurface {
  if (input.embed) return "embed";
  const path = normalizeAnalyticsPath(input.pathname);
  if (path === "/share" || path.startsWith("/share/") || path.startsWith("/api/share")) return "client";
  if (path === "/marketing/client" || path.startsWith("/marketing/client/")) return "client";
  if (path === "/plan" || path.startsWith("/plan/")) return "client";
  if (path === "/demo" || path.startsWith("/demo/")) return "client";
  if (input.role === "client_viewer" || input.role === "client_owner" || input.role === "demo_viewer") return "client";
  if (input.role && STAFF_ROLES.has(input.role)) return "staff";
  return "client";
}

export function shouldLoadPosthog(input: {
  env?: Env;
  apiKey?: string;
  pathname: string;
  search?: string;
  hash?: string;
  role?: string | null;
  userId?: string | null;
  consent?: AnalyticsConsentLevel;
  embed?: boolean;
  surface?: AnalyticsSurface;
}): PosthogDecision {
  const env = input.env ?? process.env;
  const surface = input.surface ?? analyticsSurface(input);
  const identify = Boolean(input.userId?.trim() && input.role && IDENTIFY_ROLES.has(input.role));
  const base = { surface, identify };
  if (!posthogEnabled(env)) return { load: false, reason: "disabled", ...base };
  const apiKey = (input.apiKey ?? posthogBrowserKey(env)).trim();
  if (!apiKey) return { load: false, reason: "missing-key", ...base };
  if (!input.pathname.trim()) return { load: false, reason: "missing-path", ...base, identify: false };
  if (posthogExcluded(input.pathname, input.search || "", input.hash || "")) {
    return { load: false, reason: "excluded", ...base, identify: false };
  }
  if (surface === "client" || surface === "embed") {
    const consent = input.consent === undefined ? readAnalyticsConsent() : input.consent;
    if (!analyticsConsentGranted(consent)) return { load: false, reason: "consent", ...base };
  }
  return { load: true, reason: "ok", ...base };
}

export type PosthogClientProps = {
  apiKey: string;
  apiHost: string;
  surface: AnalyticsSurface;
  userId: string | null;
  role: string | null;
};

/** Props for the browser SDK. Null means render nothing: no script and no key in the payload. */
export function posthogClientProps(input: {
  pathname: string;
  search?: string;
  hash?: string;
  role?: string | null;
  userId?: string | null;
  env?: Env;
  consent?: AnalyticsConsentLevel;
  embed?: boolean;
}): PosthogClientProps | null {
  const env = input.env ?? process.env;
  const decision = shouldLoadPosthog({ ...input, env });
  if (!decision.load) return null;
  const apiKey = posthogBrowserKey(env);
  if (!apiKey) return null;
  return {
    apiKey,
    apiHost: POSTHOG_API_HOST,
    surface: decision.surface,
    userId: decision.identify ? input.userId?.trim() || null : null,
    role: decision.identify ? input.role || null : null,
  };
}

export function sessionRecordingOptions() {
  return {
    maskAllInputs: true,
    maskTextSelector: "*",
    blockClass: SENSITIVE_CAPTURE_CLASS,
    blockSelector: ["img", "picture", "canvas", "video", "svg", `.${SENSITIVE_CAPTURE_CLASS}`, `[${SENSITIVE_CAPTURE_ATTRIBUTE}]`].join(", "),
    recordHeaders: false,
    recordBody: false,
    streamNetworkBody: false,
    recordCrossOriginIframes: false,
    collectFonts: false,
    captureCanvas: { recordCanvas: false },
    maskCapturedNetworkRequestFn: sanitizeCapturedRequest,
  };
}

export type AnalyticsEvent = {
  event?: string;
  properties?: Record<string, unknown>;
  $set?: Record<string, unknown>;
  $set_once?: Record<string, unknown>;
};

export function posthogInitConfig(input?: { secureCookie?: boolean; beforeSend?: (event: AnalyticsEvent | null) => AnalyticsEvent | null }) {
  return {
    api_host: POSTHOG_API_HOST,
    ui_host: "https://us.posthog.com",
    capture_pageview: "history_change" as const,
    capture_pageleave: true,
    person_profiles: "identified_only" as const,
    mask_all_text: true,
    mask_all_element_attributes: true,
    mask_personal_data_properties: true,
    custom_personal_data_properties: [
      "token",
      "access_token",
      "email",
      "phone",
      "name",
      "client",
      "spend",
      "budget",
      "bid",
      "cpc",
      "cpm",
      "cpa",
      "cpl",
      "cpv",
      "cpx",
      "roas",
      "audience",
    ],
    disable_surveys: true,
    capture_exceptions: false,
    secure_cookie: input?.secureCookie ?? true,
    cross_subdomain_cookie: false,
    persistence: "localStorage+cookie" as const,
    debug: false,
    disable_session_recording: false,
    autocapture: {
      capture_copied_text: false,
      capture_value_css_selector_allowlist: [] as string[],
    },
    session_recording: sessionRecordingOptions(),
    before_send: input?.beforeSend ?? sanitizeAnalyticsEvent,
  };
}

export function identifyPayload(user: {
  id: string;
  role: string;
  email?: string | null;
  name?: string | null;
  clientName?: string | null;
}) {
  const distinctId = user.id.trim();
  const role = IDENTIFY_ROLES.has(user.role) ? user.role : "unknown";
  return {
    distinctId,
    properties: { role },
  };
}

export function isLogoutAction(action: string | null | undefined) {
  if (!action) return false;
  const trimmed = action.trim();
  if (!trimmed) return false;
  try {
    const url = trimmed.startsWith("http://") || trimmed.startsWith("https://") ? new URL(trimmed) : new URL(trimmed, "https://jai.local");
    return normalizeAnalyticsPath(url.pathname) === "/api/auth/logout";
  } catch {
    return normalizeAnalyticsPath(trimmed.split(/[?#]/, 1)[0] || "") === "/api/auth/logout";
  }
}

export function sanitizeAnalyticsUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  let url: URL;
  try {
    url = new URL(trimmed, "https://jai.local");
  } catch {
    return redactLoose(stripQueryAndHash(trimmed));
  }
  url.search = "";
  url.hash = "";
  url.pathname = redactPath(url.pathname);
  url.username = "";
  url.password = "";
  if (/^https?:\/\//i.test(trimmed)) return url.toString();
  return `${url.pathname}`;
}

export function sanitizeCapturedRequest<T extends { name?: string; requestBody?: string | null; responseBody?: string | null }>(data: T): T {
  const next = { ...data, requestBody: null, responseBody: null };
  if (typeof next.name === "string") next.name = sanitizeAnalyticsUrl(next.name) as T["name"];
  if ("requestHeaders" in next) delete (next as { requestHeaders?: unknown }).requestHeaders;
  if ("responseHeaders" in next) delete (next as { responseHeaders?: unknown }).responseHeaders;
  return next;
}

export function sanitizeAnalyticsEvent<T extends AnalyticsEvent>(event: T | null): T | null {
  if (!event) return null;
  if (typeof event.event === "string" && event.event.startsWith("$snapshot")) return event;
  const next: T = { ...event };
  const current = event.properties?.$current_url;
  if (typeof current === "string" && analyticsUrlExcluded(current)) return null;
  if (event.properties) next.properties = sanitizeProperties(event.properties);
  if (event.$set) next.$set = sanitizePerson(event.$set);
  if (event.$set_once) next.$set_once = sanitizePerson(event.$set_once);
  return next;
}

function analyticsUrlExcluded(value: string) {
  try {
    const url = new URL(value, "https://jai.local");
    return posthogExcluded(url.pathname, url.search, url.hash);
  } catch {
    return posthogExcluded(value);
  }
}

function sanitizePerson(value: Record<string, unknown>) {
  const role = value.role;
  if (typeof role !== "string" || !IDENTIFY_ROLES.has(role)) return {};
  return { role };
}

function sanitizeProperties(value: Record<string, unknown>, depth = 0): Record<string, unknown> {
  if (depth > 6) return {};
  const next: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (TEXT_PROPERTY_KEYS.has(key) || sensitivePropertyKey(key)) continue;
    if (raw == null) continue;
    if (typeof raw === "string") {
      next[key] = URL_PROPERTY_KEYS.has(key) ? sanitizeAnalyticsUrl(raw) : redactString(raw);
      continue;
    }
    if (typeof raw === "number" || typeof raw === "boolean") {
      next[key] = raw;
      continue;
    }
    if (Array.isArray(raw)) {
      next[key] = raw.map((item) => {
        if (typeof item === "string") return redactString(item);
        if (item && typeof item === "object" && !Array.isArray(item)) return sanitizeProperties(item as Record<string, unknown>, depth + 1);
        if (typeof item === "number" || typeof item === "boolean") return item;
        return undefined;
      });
      continue;
    }
    if (typeof raw === "object") next[key] = sanitizeProperties(raw as Record<string, unknown>, depth + 1);
  }
  return next;
}

function sensitivePropertyKey(key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normalized === "role") return false;
  const parts = [
    "email",
    "phone",
    "mobile",
    "spend",
    "budget",
    "bid",
    "cpc",
    "cpm",
    "cpa",
    "cpl",
    "cpv",
    "cpx",
    "cpql",
    "roas",
    "audience",
    "firstname",
    "lastname",
    "fullname",
    "clientname",
    "companyname",
    "username",
  ];
  if (parts.some((part) => normalized.includes(part))) return true;
  if (normalized === "name" || normalized === "client" || normalized === "company" || normalized === "tel") return true;
  return false;
}

function redactString(value: string) {
  if (EMAIL.test(value) || PHONE.test(value)) return "[redacted]";
  return value;
}

function redactLoose(value: string) {
  return value.replace(EMAIL, "[redacted]").replace(PHONE, "[redacted]");
}

function stripQueryAndHash(value: string) {
  return value.split(/[?#]/, 1)[0] || "";
}

function redactPath(pathname: string) {
  const segments = pathname.split("/");
  return segments
    .map((segment, index) => {
      if (!segment) return segment;
      const previous = (segments[index - 1] || "").toLowerCase();
      if (previous === "invite" || previous === "share" || previous === "plan" || previous === "enter" || previous === "redeem") return "_";
      const decoded = safeDecode(segment);
      if (EMAIL.test(decoded) || PHONE.test(decoded)) return "_";
      return segment;
    })
    .join("/");
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export type PosthogSdk = {
  init: (key: string, config: ReturnType<typeof posthogInitConfig>) => void;
  identify: (distinctId: string, properties?: Record<string, string>) => void;
  reset: (resetDeviceId?: boolean) => void;
  stopSessionRecording?: () => void;
  startSessionRecording?: () => void;
};

export type PosthogSession = {
  loaded: boolean;
  reason: PosthogLoadReason;
  ready: Promise<void>;
  reset: () => void;
  cancel: () => void;
  noteLocation: (location: { pathname: string; search?: string; hash?: string }) => void;
  isLogout: typeof isLogoutAction;
};

export function bootPosthog(
  input: {
    env?: Env;
    apiKey?: string;
    apiHost?: string;
    pathname: string;
    search?: string;
    hash?: string;
    role?: string | null;
    userId?: string | null;
    email?: string | null;
    name?: string | null;
    clientName?: string | null;
    consent?: AnalyticsConsentLevel;
    embed?: boolean;
    surface?: AnalyticsSurface;
    secureCookie?: boolean;
  },
  deps?: { loadSdk?: () => Promise<PosthogSdk> },
): PosthogSession {
  const decision = shouldLoadPosthog(input);
  let sdk: PosthogSdk | null = null;
  let cancelled = false;
  let resetRequested = false;
  let capture = decision.load;
  let resolveReady = () => {};
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  const session: PosthogSession = {
    loaded: decision.load,
    reason: decision.reason,
    ready,
    reset() {
      resetRequested = true;
      capture = false;
      sdk?.reset(true);
    },
    cancel() {
      cancelled = true;
    },
    noteLocation(location) {
      const next = shouldLoadPosthog({ ...input, surface: undefined, ...location });
      capture = next.load;
      if (!sdk) return;
      if (!next.load) sdk.stopSessionRecording?.();
      else sdk.startSessionRecording?.();
    },
    isLogout: isLogoutAction,
  };

  if (!decision.load || (input.apiHost && input.apiHost !== POSTHOG_API_HOST)) {
    session.loaded = false;
    if (decision.load) session.reason = "disabled";
    capture = false;
    resolveReady();
    return session;
  }

  const apiKey = (input.apiKey ?? posthogBrowserKey(input.env ?? process.env)).trim();
  const loadSdk = deps?.loadSdk;
  if (!loadSdk || !apiKey) {
    session.loaded = false;
    session.reason = apiKey ? "disabled" : "missing-key";
    capture = false;
    resolveReady();
    return session;
  }

  void loadSdk()
    .then((client) => {
      if (cancelled) return;
      sdk = client;
      client.init(
        apiKey,
        posthogInitConfig({
          secureCookie: input.secureCookie,
          beforeSend: (event) => (capture ? sanitizeAnalyticsEvent(event) : null),
        }),
      );
      if (resetRequested || cancelled || !capture) {
        client.reset(true);
        client.stopSessionRecording?.();
        return;
      }
      if (decision.identify && input.userId && input.role) {
        const payload = identifyPayload({
          id: input.userId,
          role: input.role,
          email: input.email,
          name: input.name,
          clientName: input.clientName,
        });
        if (payload.distinctId) client.identify(payload.distinctId, payload.properties);
      }
    })
    .catch(() => {
      capture = false;
    })
    .finally(() => {
      resolveReady();
    });

  return session;
}

import { publicHttpsBase } from "./env";

/**
 * Public hosts this product is served on.
 * Each serves normally until CANONICAL_HOST names one of them.
 * Any other host falls back to APP_URL so a forged Host header is not echoed.
 * The session cookie stays host-only. Do not set a Domain attribute.
 */
export const SPECIFICITY_PUBLIC_HOSTS = ["voiceai.specificityinc.com", "jarvis.specificityinc.com", "diverai.specificityinc.com", "jai.specificityinc.com"] as const;

type Env = Record<string, string | undefined>;

export function hostnameFrom(value: string | null | undefined): string | null {
  const raw = (value || "").trim().toLowerCase();
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim() ?? "";
  if (!first) return null;
  try {
    const url = first.includes("://") ? new URL(first) : new URL(`https://${first}`);
    return url.hostname.replace(/\.$/, "");
  } catch {
    return null;
  }
}

export function isSpecificityPublicHost(value: string | null | undefined) {
  const host = hostnameFrom(value);
  return host !== null && (SPECIFICITY_PUBLIC_HOSTS as readonly string[]).includes(host);
}

export function canonicalOrigin(hostHeader: string | null | undefined, env: Env): string | null {
  const host = hostnameFrom(hostHeader);
  if (host && isSpecificityPublicHost(host)) return `https://${host}`;
  return publicHttpsBase(env);
}

/**
 * Unset, empty, or not one of the allowed hosts: no redirect.
 * Set to an allowed host: browser pages on the other allowed host redirect there.
 * API and webhook paths stay on the host that received them.
 */
export function canonicalHost(env: Env = process.env): string | null {
  const host = hostnameFrom(env.CANONICAL_HOST);
  if (!host || !isSpecificityPublicHost(host)) return null;
  return host;
}

export function publicHostRedirect(
  hostHeader: string | null | undefined,
  pathname: string,
  search = "",
  env: Env = process.env,
): string | null {
  const canonical = canonicalHost(env);
  if (!canonical) return null;
  if (pathname === "/api" || pathname.startsWith("/api/")) return null;
  const host = hostnameFrom(hostHeader);
  if (!host || host === canonical || !isSpecificityPublicHost(host)) return null;
  const query = search ? (search.startsWith("?") ? search : `?${search}`) : "";
  return `https://${canonical}${pathname}${query}`;
}

function configuredOrigin(env: Env) {
  return (env.APP_URL || env.PUBLIC_APP_URL || "http://127.0.0.1:43123").replace(/\/$/, "");
}

/**
 * Absolute origin for a redirect.
 * A known public host is used as-is. Local APP_URL is used when the request host matches it.
 * Anything else falls back to APP_URL and is not echoed.
 */
export function safeRequestOrigin(hostHeader: string | null | undefined, env: Env = process.env) {
  const host = hostnameFrom(hostHeader);
  if (host && isSpecificityPublicHost(host)) return `https://${host}`;
  const configured = configuredOrigin(env);
  if (host && host === hostnameFrom(configured)) return configured;
  return configured;
}

export function requestOrigin(request: { headers: { get(name: string): string | null }; url?: string }, env: Env = process.env) {
  const header = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (header) return safeRequestOrigin(header, env);
  if (request.url) {
    try {
      return safeRequestOrigin(new URL(request.url).host, env);
    } catch {
      return safeRequestOrigin(null, env);
    }
  }
  return safeRequestOrigin(null, env);
}

/** Links we email. Uses CANONICAL_HOST when that is an allowed host, otherwise APP_URL. */
export function authLinkOrigin(env: Env = process.env) {
  const canonical = canonicalHost(env);
  if (canonical) return `https://${canonical}`;
  return configuredOrigin(env);
}

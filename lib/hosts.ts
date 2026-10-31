import { publicHttpsBase } from "./env";

/**
 * Public hosts this product is served on.
 * A request to either host uses that host for the canonical URL.
 * Any other host falls back to APP_URL so a forged Host header is not echoed.
 */
export const SPECIFICITY_PUBLIC_HOSTS = ["voiceai.specificityinc.com", "jarvis.specificityinc.com"] as const;

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

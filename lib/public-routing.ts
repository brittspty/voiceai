import { demoViewerGate } from "./demo/isolation";
import { clientViewerBlock } from "./marketing/client-gate";

/**
 * Public homepage routing.
 *
 * PUBLIC_HOMEPAGE defaults off. While it is off, "/" stays the signed-in app.
 * The page file for that app home lives at "/app", and a request for "/" is
 * rewritten internally so the address bar does not change.
 *
 * While it is on, "/" is a public page. Signed-in visitors are not redirected.
 * "/login" is still the only sign-in page. "/app" is the authenticated home
 * for workspace roles. Existing paths (/marketing, /calls, /settings, /api,
 * webhooks, OAuth callbacks) stay where they are. Deep links are not prefixed.
 *
 * After sign-in, with the public homepage on:
 * - client_viewer opens the client view
 * - super_admin and account_manager open the staff marketing view
 * - owner, admin, and viewer open /app
 * With the homepage off, client_viewer still opens the client view and everyone
 * else still opens "/". LOGIN_ANALYTICS sends super admins and account managers
 * to /portfolio instead, and leaves every client role on its own view.
 * There is one sign-in, not a second auth system.
 */

export type Env = Record<string, string | undefined>;

export function envEnabled(value: string | undefined) {
  const flag = (value || "").trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "on" || flag === "yes";
}

export function publicHomepageEnabled(env: Env = process.env) {
  return envEnabled(env.PUBLIC_HOMEPAGE);
}

export function demoWorkspaceEnabled(env: Env = process.env) {
  return envEnabled(env.DEMO_WORKSPACE);
}

export const LEGACY_PUBLIC_PREFIXES = [
  "/login",
  "/forgot-password",
  "/privacy",
  "/terms",
  "/contact",
  "/request-access",
  "/invite/",
  "/api/auth/",
  "/api/webhooks/",
  "/api/health",
  "/share",
  "/api/share",
] as const;

export const CLIENT_VIEW_PATH = "/marketing/client";
export const STAFF_VIEW_PATH = "/marketing";
export const APP_PATH = "/app";

export function normalizePath(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

export function isDemoPath(pathname: string) {
  const path = normalizePath(pathname);
  return path === "/demo" || path.startsWith("/demo/");
}

export function isDemoApiPath(pathname: string) {
  const path = normalizePath(pathname);
  return path === "/api/demo" || path.startsWith("/api/demo/");
}

export function isPlanPath(pathname: string) {
  const path = normalizePath(pathname);
  return path === "/plan" || path.startsWith("/plan/");
}

export function isHomepageContactPath(pathname: string) {
  return normalizePath(pathname) === "/api/homepage/contact";
}

export function loginAnalyticsEnabled(env: Env = process.env) {
  return envEnabled(env.LOGIN_ANALYTICS);
}

/** Public aggregate for the sign-in panel. The handler returns 404 while the switch is off. */
export function isLoginAnalyticsPath(pathname: string) {
  return normalizePath(pathname) === "/api/public/login-analytics";
}

export const PORTFOLIO_PATH = "/portfolio";

export function isLegacyPublic(pathname: string) {
  return LEGACY_PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

export function isPublicPath(pathname: string, env: Env) {
  if (isLegacyPublic(pathname)) return true;
  if (isLoginAnalyticsPath(pathname)) return true;
  if (publicHomepageEnabled(env) && normalizePath(pathname) === "/") return true;
  if (publicHomepageEnabled(env) && isHomepageContactPath(pathname)) return true;
  if (demoWorkspaceEnabled(env) && (isDemoPath(pathname) || isDemoApiPath(pathname))) return true;
  if (isPlanPath(pathname)) return true;
  return false;
}

export function appHomePath(env: Env = process.env) {
  return publicHomepageEnabled(env) ? APP_PATH : "/";
}

export function postLoginPath(role: string | null | undefined, env: Env = process.env) {
  if (role === "demo_viewer") return "/demo";
  if (role === "client_viewer") return CLIENT_VIEW_PATH;
  if (loginAnalyticsEnabled(env) && (role === "super_admin" || role === "account_manager")) return PORTFOLIO_PATH;
  if (!publicHomepageEnabled(env)) return "/";
  if (role === "super_admin" || role === "account_manager") return STAFF_VIEW_PATH;
  return APP_PATH;
}

/** Omitted while both switches are off so the sign-in page keeps its current destination. */
export function loginNextField(role: string | null | undefined, env: Env = process.env): { next?: string } {
  if (!publicHomepageEnabled(env) && !loginAnalyticsEnabled(env)) return {};
  const next = postLoginPath(role, env);
  if (!publicHomepageEnabled(env) && next === "/") return {};
  return { next };
}

/** Next.js calls proxy with a fetch event. Tests pass a plain env object. */
export function envForProxy(override?: unknown): Env {
  if (!override || typeof override !== "object") return process.env;
  if ("waitUntil" in override) return process.env;
  return override as Env;
}

export type GateDecision =
  | { action: "next" }
  | { action: "rewrite"; pathname: string }
  | { action: "redirect"; pathname: string; next?: string; clearSearch?: boolean }
  | { action: "json"; status: 401 | 403; error: string };

export function gateDecision(input: {
  pathname: string;
  signedIn: boolean;
  role?: string | null;
  env: Env;
}): GateDecision {
  const path = normalizePath(input.pathname);
  const env = input.env;
  const homepage = publicHomepageEnabled(env);
  const { signedIn, role } = input;

  if (!homepage && path === APP_PATH && signedIn) {
    return { action: "redirect", pathname: "/" };
  }

  if (!signedIn && !isPublicPath(input.pathname, env)) {
    if (input.pathname.startsWith("/api/")) return { action: "json", status: 401, error: "Sign in required" };
    return { action: "redirect", pathname: "/login", next: input.pathname };
  }

  if (signedIn && role === "demo_viewer" && demoViewerGate(input.pathname) === "demo") {
    if (input.pathname.startsWith("/api/")) return { action: "json", status: 403, error: "Not allowed" };
    return { action: "redirect", pathname: "/demo", clearSearch: true };
  }

  if (signedIn && role === "client_viewer") {
    const block = clientViewerBlock(input.pathname);
    if (block === "deny") return { action: "json", status: 403, error: "Not allowed" };
    if (block === "redirect") return { action: "redirect", pathname: CLIENT_VIEW_PATH, clearSearch: true };
  }

  if (signedIn && path === "/login") {
    return { action: "redirect", pathname: postLoginPath(role, env), clearSearch: true };
  }

  if (!homepage && path === "/") return { action: "rewrite", pathname: APP_PATH };
  return { action: "next" };
}

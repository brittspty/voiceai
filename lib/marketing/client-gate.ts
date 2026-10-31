import { audienceDataP1Enabled, jarvisUiV2Enabled, reportsP1Enabled, type Env } from "./config";

/** Paths a signed-in client viewer may open. Everything else is blocked. */
export function clientViewerAllowed(pathname: string, env: Env = process.env) {
  if (pathname === "/") return true;
  if (pathname === "/marketing/client") return true;
  if (pathname === "/marketing/segments" || pathname === "/marketing/segments/lineage" || pathname === "/marketing/segments/drill" || pathname === "/marketing/segments/tests") return true;
  if (pathname === "/sites/landing-pages") return true;
  if (pathname === "/api/marketing/client" || pathname === "/api/marketing/client/export") return true;
  if (pathname === "/api/auth/logout") return true;
  if (pathname === "/login") return true;
  if (pathname === "/share" || pathname.startsWith("/share/")) return true;
  if (pathname.startsWith("/api/share/")) return true;
  if (pathname === "/api/health") return true;
  if (pathname === "/reports" || pathname === "/reports/print") return true;
  if (pathname === "/api/marketing/reports" || pathname === "/api/marketing/reports/export") return true;
  if (reportsP1Enabled(env)) {
    if (pathname === "/reports/schedules" || pathname.startsWith("/reports/channels/")) return true;
    if (pathname === "/api/marketing/reports/p1/schedules" || pathname.startsWith("/api/marketing/reports/p1/channels/")) return true;
  }
  if (audienceDataP1Enabled(env)) {
    if (pathname === "/audience-data/lineage" || pathname === "/audience-data/drill" || pathname === "/audience-data/tests") return true;
    if (pathname === "/api/marketing/audience-p1/lineage" || pathname === "/api/marketing/audience-p1/drill" || pathname === "/api/marketing/audience-p1/tests") return true;
  }
  if (pathname === "/api/homepage/contact") return true;
  if (pathname === "/demo" || pathname.startsWith("/demo/")) return true;
  if (pathname === "/plan" || pathname.startsWith("/plan/")) return true;
  if (jarvisUiV2Enabled(env)) {
    if (pathname === "/decisions" || pathname.startsWith("/decisions/")) return true;
    if (pathname === "/leads" || pathname.startsWith("/leads/")) return true;
    if (pathname === "/c" || pathname.startsWith("/c/")) return true;
    if (pathname === "/ais2l" || pathname.startsWith("/ais2l/")) return true;
    if (pathname === "/settings" || pathname.startsWith("/settings/")) return true;
    if (pathname === "/api/marketing/jarvis/home") return true;
  }
  return false;
}

export function clientViewerBlock(pathname: string): "allow" | "redirect" | "deny" {
  if (clientViewerAllowed(pathname)) return "allow";
  if (pathname.startsWith("/api/")) return "deny";
  return "redirect";
}

/** Paths a signed-in client viewer may open. Everything else is blocked. */
export function clientViewerAllowed(pathname: string) {
  if (pathname === "/") return true;
  if (pathname === "/marketing/client") return true;
  if (pathname === "/sites/landing-pages") return true;
  if (pathname === "/api/marketing/client" || pathname === "/api/marketing/client/export") return true;
  if (pathname === "/api/auth/logout") return true;
  if (pathname === "/login") return true;
  if (pathname === "/share" || pathname.startsWith("/share/")) return true;
  if (pathname.startsWith("/api/share/")) return true;
  if (pathname === "/api/health") return true;
  return false;
}

export function clientViewerBlock(pathname: string): "allow" | "redirect" | "deny" {
  if (clientViewerAllowed(pathname)) return "allow";
  if (pathname.startsWith("/api/")) return "deny";
  return "redirect";
}

/** Homepage and other surfaces link here. The page 404s while DEMO_WORKSPACE is off. */
export const TRY_DEMO_HREF = "/demo";

export const DEMO_ROUTE = "/demo";

/** Future dedicated host. Requests on this host are rewritten onto /demo. */
export const DEMO_PUBLIC_HOST = "demo.jarvis.specificityinc.com";

export const DEMO_CONTACT_HREF = "/contact";

export function rewriteForDemoHost(host: string, pathname: string) {
  const name = host.split(":")[0]?.trim().toLowerCase() || "";
  if (name !== DEMO_PUBLIC_HOST) return null;
  if (pathname === "/" || pathname === "") return DEMO_ROUTE;
  if (pathname.startsWith("/demo") || pathname.startsWith("/api/demo") || pathname.startsWith("/contact") || pathname.startsWith("/privacy") || pathname.startsWith("/terms") || pathname.startsWith("/plan")) {
    return pathname;
  }
  return `${DEMO_ROUTE}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

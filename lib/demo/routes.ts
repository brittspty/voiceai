/**
 * Homepage and other surfaces link here.
 * Primary path: https://jai.specificityinc.com/demo.
 * The page 404s while the demo workspace flag is off. When it is on, a visitor
 * still needs a signed demo link (/demo/enter) or the demo access page.
 */
export const TRY_DEMO_HREF = "/demo";

export const DEMO_ROUTE = "/demo";

/** Primary sales URL. The dedicated host below is optional future DNS. */
export const DEMO_PRIMARY_URL = "https://jai.specificityinc.com/demo";

/**
 * Optional future host. Requests on this host are rewritten onto /demo.
 * jai.specificityinc.com/demo stays the primary path until that DNS exists.
 */
export const DEMO_PUBLIC_HOST = "demo.jai.specificityinc.com";

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

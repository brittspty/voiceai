import { publicHomepageEnabled, type Env } from "./public-routing";

/** Public URLs for /sitemap.xml. Early access is listed only while the homepage is on. */
export function publicSitemapPaths(env: Env = process.env) {
  if (!publicHomepageEnabled(env)) return [];
  return ["/", "/early-access"];
}

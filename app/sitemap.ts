import type { MetadataRoute } from "next";
import { PUBLIC_SITE_ORIGIN } from "@/lib/brand/public";
import { publicSitemapPaths } from "@/lib/public-sitemap";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  return publicSitemapPaths().map((path) => ({
    url: `${PUBLIC_SITE_ORIGIN}${path === "/" ? "/" : path}`,
  }));
}

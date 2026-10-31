import { Suspense } from "react";
import { LoginAnalyticsScreen } from "@/components/login-analytics-screen";
import { LoginScreen } from "@/components/login-form";
import { BRAND_TAGLINE, BRAND_WORDMARK, loadBrand, PRODUCT_TAGLINE } from "@/lib/brand";
import { clientConfig } from "@/lib/client-config";
import { ANALYTICS_ZONE, assertPublicAnalytics, buildPublicLoginAnalytics, loginAnalyticsEnabled, loginAnalyticsMinClients, publicAsOf } from "@/lib/login-analytics";
import { loadLoginContributions } from "@/lib/login-analytics-query";
import { magicLinkEnabled } from "@/lib/magic-link";
import { zonedISODate } from "@/lib/time";
import { appHomePath } from "@/lib/public-routing";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ audience?: string }> }) {
  const [brand, cfg, sp] = await Promise.all([loadBrand(), Promise.resolve(clientConfig()), searchParams]);
  const hint = cfg.showDemoLogin
    ? {
        ownerEmail: cfg.owner.email,
        ownerPassword: process.env.SEED_OWNER_PASSWORD?.trim() ? null : cfg.owner.password,
        adminEmail: cfg.admin.email,
      }
    : null;
  const props = {
    brand: { companyName: brand.companyName, brandColor: brand.brandColor, logoUrl: brand.logoUrl, mark: brand.mark, wordmark: BRAND_WORDMARK, tagline: BRAND_TAGLINE, productLine: PRODUCT_TAGLINE },
    hint,
    homeHref: appHomePath(),
  };
  if (!loginAnalyticsEnabled()) return <LoginScreen {...props} />;
  let initial = null;
  try {
    const now = new Date();
    const contributions = await loadLoginContributions(now);
    const body = buildPublicLoginAnalytics({
      contributions,
      now,
      threshold: loginAnalyticsMinClients(),
      zoneISO: zonedISODate(publicAsOf(now), ANALYTICS_ZONE),
    });
    assertPublicAnalytics(body, contributions.flatMap((row) => [row.workspaceId, row.name || ""]));
    initial = body;
  } catch {
    initial = null;
  }
  return (
    <Suspense>
      <LoginAnalyticsScreen {...props} audience={sp.audience === "team" ? "team" : "client"} magicLink={magicLinkEnabled()} initial={initial} />
    </Suspense>
  );
}

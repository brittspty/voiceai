import { AppShell } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { BRAND_TAGLINE, BRAND_WORDMARK, resolveBrandColor, resolveLogoUrl } from "@/lib/brand";
import { getOrg } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, org] = await Promise.all([requireUser(), getOrg()]);
  return (
    <AppShell
      org={{ name: org.name, subtitle: org.subtitle, brandColor: resolveBrandColor(org.brandColor), logoUrl: resolveLogoUrl(org.logoUrl), mark: org.mark }}
      user={user}
      mode={{ testMode: org.testMode, agentName: org.agentName, wordmark: BRAND_WORDMARK, tagline: BRAND_TAGLINE }}
    >
      {children}
    </AppShell>
  );
}

import { AppShell } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { PRODUCT_NAME, resolveBrandColor, resolveLogoUrl } from "@/lib/brand";
import { getOrg } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, org] = await Promise.all([requireUser(), getOrg()]);
  return (
    <AppShell
      org={{ name: org.name, subtitle: org.subtitle, brandColor: resolveBrandColor(org.brandColor), logoUrl: resolveLogoUrl(org.logoUrl), mark: org.mark }}
      user={user}
      mode={{ testMode: org.testMode, agentName: org.agentName, productName: PRODUCT_NAME }}
    >
      {children}
    </AppShell>
  );
}

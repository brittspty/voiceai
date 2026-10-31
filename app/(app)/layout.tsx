import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { JarvisShell } from "@/components/jarvis/shell";
import { AppShell } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { BRAND_TAGLINE, BRAND_WORDMARK, LOGO_ON_DARK, LOGO_ON_LIGHT, PRODUCT_NAME, resolveBrandColor, resolveLogoUrl } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { exampleRegistryState, projectSurfaces } from "@/lib/marketing/channels/registry";
import { jarvisNav } from "@/lib/marketing/channels/nav";
import { clientViewerAllowed } from "@/lib/marketing/client-gate";
import { loginAnalyticsEnabled } from "@/lib/login-analytics";
import { insightsEnabled } from "@/lib/insights/learn";
import { audienceLibraryEnabled, channelRegistryEnabled, inboxEnabled, jarvisUiV2Enabled, leadScoringEnabled, reportsV2Enabled, segmentEngineEnabled, speedToLeadEnabled } from "@/lib/marketing/config";
import { pushNotificationsEnabled } from "@/lib/push/notify";
import { listHomeWorkspaces } from "@/lib/marketing/home-query";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { getOrg } from "@/lib/queries";
import { appHomePath, publicHomepageEnabled } from "@/lib/public-routing";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, org] = await Promise.all([requireUser(), getOrg()]);
  const path = (await headers()).get("x-voiceops-path") || "";
  if (user.role === "demo_viewer") redirect("/demo");
  const jarvis = jarvisUiV2Enabled();
  if (user.role === "client_viewer" && path && !clientViewerAllowed(path)) redirect(jarvis && !publicHomepageEnabled() ? "/" : "/marketing/client");
  const showInbox = inboxEnabled() && user.role !== "client_viewer" && user.role !== "all_clients_viewer";
  const unread = showInbox ? await prisma.staffNotification.count({ where: { userId: user.id, readAt: null } }) : 0;
  if (reportsV2Enabled() && (path === "/reports" || path.startsWith("/reports/"))) return <>{children}</>;
  if (jarvis) {
    const access = await loadMarketingAccess(user);
    const spaces = access.kind === "none" ? [] : await listHomeWorkspaces(access).catch(() => []);
    const showAis2l = spaces.some((row) => row.voiceEnabled);
    const staff = access.seesCost;
    const registry = channelRegistryEnabled() ? projectSurfaces(exampleRegistryState(), { audience: staff ? "staff" : "client", clientId: "harbor" }) : null;
    const items = jarvisNav({
      audience: staff ? "staff" : "client",
      showAis2l,
      decisionCount: staff ? 7 : 2,
      showLive: access.kind === "super_admin" || access.kind === "account_manager",
      showSegments: segmentEngineEnabled(),
      showAudiences: staff && audienceLibraryEnabled(),
      channelLinks: registry ? (staff ? registry.nav : registry.clientNav) : undefined,
      showInsights: staff && insightsEnabled(),
      showNotifications: staff && pushNotificationsEnabled(),
    });
    return (
      <JarvisShell productName={PRODUCT_NAME} wordmark={BRAND_WORDMARK} logoOnDark={LOGO_ON_DARK} logoOnLight={LOGO_ON_LIGHT} items={items} unread={unread} moreChannels={registry?.commandCenter.moreLabel}>
        {children}
      </JarvisShell>
    );
  }
  return (
    <AppShell
      org={{ name: org.name, subtitle: org.subtitle, brandColor: resolveBrandColor(org.brandColor), logoUrl: resolveLogoUrl(org.logoUrl), mark: org.mark }}
      user={user}
      mode={{ testMode: org.testMode, agentName: org.agentName, wordmark: BRAND_WORDMARK, tagline: BRAND_TAGLINE }}
      showSpeedToLead={speedToLeadEnabled()}
      leadScoring={leadScoringEnabled()}
      showInbox={showInbox}
      unread={unread}
      showSegments={segmentEngineEnabled()}
      audienceLibrary={audienceLibraryEnabled()}
      showReports={reportsV2Enabled()}
      homeHref={appHomePath()}
      showPortfolio={loginAnalyticsEnabled() && (user.role === "super_admin" || user.role === "account_manager")}
      showInsights={insightsEnabled()}
      showNotifications={pushNotificationsEnabled()}
    >
      {children}
    </AppShell>
  );
}

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { BRAND_TAGLINE, BRAND_WORDMARK, resolveBrandColor, resolveLogoUrl } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { clientViewerAllowed } from "@/lib/marketing/client-gate";
import { inboxEnabled, leadScoringEnabled, speedToLeadEnabled } from "@/lib/marketing/config";
import { getOrg } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, org] = await Promise.all([requireUser(), getOrg()]);
  const path = (await headers()).get("x-voiceops-path") || "";
  if (user.role === "client_viewer" && path && !clientViewerAllowed(path)) redirect("/marketing/client");
  const showInbox = inboxEnabled() && user.role !== "client_viewer" && user.role !== "all_clients_viewer";
  const unread = showInbox ? await prisma.staffNotification.count({ where: { userId: user.id, readAt: null } }) : 0;
  return (
    <AppShell
      org={{ name: org.name, subtitle: org.subtitle, brandColor: resolveBrandColor(org.brandColor), logoUrl: resolveLogoUrl(org.logoUrl), mark: org.mark }}
      user={user}
      mode={{ testMode: org.testMode, agentName: org.agentName, wordmark: BRAND_WORDMARK, tagline: BRAND_TAGLINE }}
      showSpeedToLead={speedToLeadEnabled()}
      leadScoring={leadScoringEnabled()}
      showInbox={showInbox}
      unread={unread}
    >
      {children}
    </AppShell>
  );
}

import Link from "next/link";
import { AppShell } from "@/components/shell";
import { BRAND_TAGLINE, BRAND_WORDMARK, resolveBrandColor, resolveLogoUrl } from "@/lib/brand";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { getOrg } from "@/lib/queries";
import { usesStaffNav } from "@/lib/shell-nav";
import { MISSING_BODY, MISSING_TITLE } from "@/lib/ux/missing-page";
import { uxLaunchGapsEnabled } from "@/lib/ux-flags";

function MissingCard({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="grid min-h-[70vh] place-items-center px-4">
      <div className="max-w-lg rounded-xl border border-line bg-card p-6">
        <p className="text-sm text-muted">{BRAND_WORDMARK}</p>
        <h1 className="mt-2 text-2xl font-semibold">{MISSING_TITLE}</h1>
        <p className="mt-2 text-sm">{MISSING_BODY}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {signedIn ? (
            <Link href="/" className="btn-brand inline-flex min-h-11 items-center rounded-full px-4 text-sm">Back to home</Link>
          ) : (
            <>
              <Link href="/login" className="btn-brand inline-flex min-h-11 items-center rounded-full px-4 text-sm">Sign in</Link>
              <Link href="/" className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm">Go to homepage</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default async function NotFound() {
  if (!uxLaunchGapsEnabled()) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas px-4 text-center">
        <div>
          <p className="text-sm text-muted">{BRAND_WORDMARK}</p>
          <h1 className="mt-2 text-2xl font-semibold">That page is not here</h1>
          <Link href="/login" className="mt-3 inline-block text-sm underline">Back to sign in</Link>
        </div>
      </div>
    );
  }
  const user = await getCurrentUser();
  if (!user) return <MissingCard signedIn={false} />;
  const org = await getOrg();
  const connected = new Set<string>();
  if (!usesStaffNav(user.role)) {
    const access = await loadMarketingAccess(user);
    if (access.workspaceId) {
      const rows = await prisma.clientConnection.findMany({
        where: { clientId: access.workspaceId, state: "connected", platformKey: { in: ["youtube", "linkedin"] } },
        select: { platformKey: true },
      });
      for (const row of rows) connected.add(row.platformKey);
    }
  }
  return (
    <AppShell
      org={{ name: org.name, subtitle: org.subtitle, brandColor: resolveBrandColor(org.brandColor), logoUrl: resolveLogoUrl(org.logoUrl), mark: org.mark }}
      user={user}
      mode={{ testMode: org.testMode, agentName: org.agentName, wordmark: BRAND_WORDMARK, tagline: BRAND_TAGLINE }}
      youtubeConnected={connected.has("youtube")}
      linkedinConnected={connected.has("linkedin")}
    >
      <MissingCard signedIn />
    </AppShell>
  );
}

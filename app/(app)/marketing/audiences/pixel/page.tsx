import { PixelTrackingScreen } from "@/components/pixel-tracking";
import { NoAccess } from "@/components/no-access";
import { PageTitle } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { audienceLibraryEnabled } from "@/lib/marketing/config";
import { canManageAudiences, canUseAudienceLibrary } from "@/lib/marketing/feature-access";
import { listPixelBoard } from "@/lib/marketing/audiences/store";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export default async function PixelTrackingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (!audienceLibraryEnabled()) {
    return (
      <div>
        <PageTitle title="Pixel tracking" subtitle="The audience library is turned off." />
      </div>
    );
  }
  if (!canUseAudienceLibrary(access)) return <NoAccess title="Pixel tracking" />;
  const query = await searchParams;
  const board = await listPixelBoard(access.workspaceId);
  return (
    <div>
      <PageTitle title="Pixel tracking" subtitle="Page health, events, and retargeting pools. Sync stays a dry run." />
      <PixelTrackingScreen
        pages={board?.pages ?? []}
        pools={board?.pools ?? []}
        guide={board?.guide ?? []}
        eventsCaptured={board?.eventsCaptured ?? 0}
        canManage={canManageAudiences(access)}
        googleNotice={board?.googleNotice}
        error={query.error}
      />
    </div>
  );
}

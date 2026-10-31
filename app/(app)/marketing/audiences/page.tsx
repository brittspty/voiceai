import { AudienceLibraryScreen } from "@/components/audience-library";
import { NoAccess } from "@/components/no-access";
import { PageTitle } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { audienceLibraryEnabled } from "@/lib/marketing/config";
import { canManageAudiences, canUseAudienceLibrary } from "@/lib/marketing/feature-access";
import { presentLibrary } from "@/lib/marketing/audiences/library";
import { finalizeDuePushes, listAudiencePushes, listLibraryAudiences } from "@/lib/marketing/audiences/store";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export default async function AudiencesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (!audienceLibraryEnabled()) {
    return (
      <div>
        <PageTitle title="Audiences" subtitle="The audience library is turned off." />
      </div>
    );
  }
  if (!canUseAudienceLibrary(access)) return <NoAccess title="Audiences" />;
  const query = await searchParams;
  await finalizeDuePushes(access.workspaceId);
  const [rows, pushes] = await Promise.all([
    listLibraryAudiences(access.workspaceId),
    listAudiencePushes(access.workspaceId),
  ]);
  const view = presentLibrary(rows, { reader: "staff", seesCost: access.seesCost });
  return (
    <div>
      <PageTitle
        title="Audiences"
        subtitle="Data-market MAID lists. Yes logs a dry run after 30 seconds. Nothing is sent."
      />
      <AudienceLibraryScreen
        cards={view.cards}
        leaderboard={view.leaderboard}
        pushes={pushes}
        seesCost={access.seesCost}
        canManage={canManageAudiences(access)}
        error={query.error}
      />
    </div>
  );
}

import { NoAccess } from "@/components/no-access";
import { SegmentLeaderboard } from "@/components/segment-screens";
import { requireUser } from "@/lib/auth";
import { segmentEngineEnabled } from "@/lib/marketing/config";
import { exampleBoard } from "@/lib/marketing/segments/example";
import { segmentAudience, type BoardSort } from "@/lib/marketing/segments/present";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export default async function SegmentsPage({ searchParams }: { searchParams: Promise<{ sort?: string; source?: string }> }) {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (!segmentEngineEnabled()) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Segments</h1>
        <p className="mt-2 text-sm text-muted">Segments are turned off.</p>
      </div>
    );
  }
  if (!access.workspaceId || access.kind === "none") return <NoAccess title="Segments" />;
  const query = await searchParams;
  const sort: BoardSort = query.sort === "quality" || query.sort === "revenue" ? query.sort : "conversion";
  const mode = segmentAudience(access);
  const board = exampleBoard(mode, sort, false, query.source);
  return <SegmentLeaderboard board={board} staff={mode === "staff"} />;
}

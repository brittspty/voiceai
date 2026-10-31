import { NoAccess } from "@/components/no-access";
import { SegmentDrillView } from "@/components/segment-screens";
import { requireUser } from "@/lib/auth";
import { segmentEngineEnabled } from "@/lib/marketing/config";
import { exampleDrill } from "@/lib/marketing/segments/example";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export default async function SegmentDrillPage() {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (!segmentEngineEnabled()) {
    return <h1 className="text-2xl font-semibold">Drill-down is turned off.</h1>;
  }
  if (!access.workspaceId || access.kind === "none") return <NoAccess title="Drill-down" />;
  return <SegmentDrillView drill={exampleDrill()} />;
}

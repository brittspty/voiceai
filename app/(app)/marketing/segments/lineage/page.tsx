import { NoAccess } from "@/components/no-access";
import { SegmentLineageView } from "@/components/segment-screens";
import { requireUser } from "@/lib/auth";
import { segmentEngineEnabled } from "@/lib/marketing/config";
import { exampleLineage } from "@/lib/marketing/segments/example";
import { segmentAudience } from "@/lib/marketing/segments/present";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export default async function SegmentLineagePage() {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (!segmentEngineEnabled()) {
    return <h1 className="text-2xl font-semibold">Lineage is turned off.</h1>;
  }
  if (!access.workspaceId || access.kind === "none") return <NoAccess title="Lineage" />;
  const mode = segmentAudience(access);
  const nodes = mode === "staff" ? exampleLineage() : exampleLineage().map((node) => ({ ...node, vendor: "", detail: "MAID list" }));
  return <SegmentLineageView nodes={nodes} staff={mode === "staff"} />;
}

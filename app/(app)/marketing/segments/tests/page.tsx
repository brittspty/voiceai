import { NoAccess } from "@/components/no-access";
import { SegmentTestView } from "@/components/segment-screens";
import { requireUser } from "@/lib/auth";
import { segmentEngineEnabled } from "@/lib/marketing/config";
import { exampleControl } from "@/lib/marketing/segments/example";
import { segmentAudience } from "@/lib/marketing/segments/present";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export default async function SegmentTestsPage() {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (!segmentEngineEnabled()) {
    return <h1 className="text-2xl font-semibold">Segment tests are turned off.</h1>;
  }
  if (!access.workspaceId || access.kind === "none") return <NoAccess title="Segment tests" />;
  const mode = segmentAudience(access);
  return <SegmentTestView test={exampleControl()} staff={mode === "staff"} />;
}

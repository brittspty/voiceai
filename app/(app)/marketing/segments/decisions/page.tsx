import { cookies } from "next/headers";
import { NoAccess } from "@/components/no-access";
import { SegmentDecisions } from "@/components/segment-screens";
import { requireUser } from "@/lib/auth";
import { segmentEngineEnabled } from "@/lib/marketing/config";
import { exampleBoard } from "@/lib/marketing/segments/example";
import { canUndoDecision } from "@/lib/marketing/segments/decisions";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export default async function SegmentDecisionsPage() {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (!segmentEngineEnabled()) {
    return <h1 className="text-2xl font-semibold">Decisions are turned off.</h1>;
  }
  if (access.kind !== "super_admin" && access.kind !== "account_manager") return <NoAccess title="Decisions" />;
  const board = exampleBoard("staff", "conversion", false);
  const cards = board.rows
    .filter((row) => row.chip === "SCALE" || row.chip === "CUT" || row.chip === "TEST MORE")
    .map((row) => ({
      id: row.key,
      type: row.chip === "SCALE" ? "segment_scale" as const : row.chip === "CUT" ? "segment_cut" as const : "segment_test" as const,
      title: row.chip === "SCALE" ? `Scale ${row.name}?` : row.chip === "CUT" ? `Stop ${row.name}?` : `Keep testing ${row.name}?`,
      summary: row.reason,
      basedOn: row.basedOn,
      vendor: row.vendor || "",
      listId: row.listId,
    }));
  const raw = (await cookies()).get("segment_decision")?.value;
  const logged = readLog(raw);
  return <SegmentDecisions cards={cards} logged={logged} />;
}

function readLog(raw: string | undefined) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { steps?: string[]; at?: number; type?: string };
    if (!parsed.at || !Array.isArray(parsed.steps)) return null;
    return { steps: parsed.steps, undo: canUndoDecision(parsed.at, Date.now()), type: parsed.type || "" };
  } catch {
    return null;
  }
}

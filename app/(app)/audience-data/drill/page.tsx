import { redirect } from "next/navigation";
import { DrillScreen } from "@/components/audience-p1/screens";
import "@/components/audience-p1/audience-p1.css";
import { requireUser } from "@/lib/auth";
import { isDrillDimension, presentDrill } from "@/lib/marketing/audience-p1/drill";
import { audienceDataP1Enabled } from "@/lib/marketing/config";
import { readerFor } from "@/lib/marketing/p1-reader";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export default async function AudienceDrillPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!audienceDataP1Enabled()) redirect("/marketing");
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  const query = await searchParams;
  const raw = typeof query.dimension === "string" ? query.dimension : "geo";
  const dimension = isDrillDimension(raw) ? raw : "geo";
  return <DrillScreen model={presentDrill(readerFor(access), dimension)} />;
}

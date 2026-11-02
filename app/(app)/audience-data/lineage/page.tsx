import { redirect } from "next/navigation";
import { LineageScreen } from "@/components/audience-p1/screens";
import "@/components/audience-p1/audience-p1.css";
import { requireUser } from "@/lib/auth";
import { presentLineage, type LineageLevel, LINEAGE_LEVELS } from "@/lib/marketing/audience-p1/lineage";
import { audienceDataP1Enabled } from "@/lib/marketing/config";
import { readerFor } from "@/lib/marketing/p1-reader";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export default async function AudienceLineagePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!audienceDataP1Enabled()) redirect("/marketing");
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  const query = await searchParams;
  const selection: Partial<Record<LineageLevel, string>> = {};
  for (const level of LINEAGE_LEVELS) {
    const value = query[level];
    if (typeof value === "string" && value) selection[level] = value;
  }
  return <LineageScreen model={presentLineage(readerFor(access), selection)} />;
}

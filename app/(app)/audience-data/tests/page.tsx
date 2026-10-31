import { redirect } from "next/navigation";
import { TestsScreen } from "@/components/audience-p1/screens";
import "@/components/audience-p1/audience-p1.css";
import { requireUser } from "@/lib/auth";
import { presentTests } from "@/lib/marketing/audience-p1/head-to-head";
import { audienceDataP1Enabled } from "@/lib/marketing/config";
import { readerFor } from "@/lib/marketing/p1-reader";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export default async function AudienceTestsPage() {
  if (!audienceDataP1Enabled()) redirect("/marketing");
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  const reader = readerFor(access);
  return <TestsScreen model={presentTests(reader)} staff={reader === "staff"} />;
}

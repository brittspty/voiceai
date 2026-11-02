import { redirect } from "next/navigation";
import { TestsScreen } from "@/components/audience-p1/screens";
import "@/components/audience-p1/audience-p1.css";
import { requireUser } from "@/lib/auth";
import { loadAudienceDecisions } from "@/lib/marketing/audience-p1/decide";
import { presentTests } from "@/lib/marketing/audience-p1/head-to-head";
import { audienceDataP1Enabled } from "@/lib/marketing/config";
import { p1LogStore } from "@/lib/marketing/p1-log-prisma";
import { readerFor } from "@/lib/marketing/p1-reader";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { WORKSPACE_ID } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";

export default async function AudienceTestsPage() {
  if (!audienceDataP1Enabled()) redirect("/marketing");
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  const reader = readerFor(access);
  const log = reader === "staff" ? await loadAudienceDecisions(p1LogStore, WORKSPACE_ID) : [];
  return <TestsScreen model={presentTests(reader)} staff={reader === "staff"} log={log} />;
}

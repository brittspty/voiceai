import { redirect } from "next/navigation";
import { ThresholdScreen } from "@/components/audience-p1/screens";
import "@/components/audience-p1/audience-p1.css";
import { requireUser } from "@/lib/auth";
import { presentThresholds } from "@/lib/marketing/audience-p1/thresholds";
import { audienceDataP1Enabled } from "@/lib/marketing/config";
import { staffOnlyStatus } from "@/lib/marketing/p1-reader";

export const dynamic = "force-dynamic";

export default async function AudienceThresholdsPage() {
  if (!audienceDataP1Enabled()) redirect("/marketing");
  const user = await requireUser();
  if (staffOnlyStatus(user.role) !== 200) redirect("/marketing/client");
  return <ThresholdScreen model={presentThresholds()} />;
}
